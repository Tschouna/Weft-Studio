// Snowfall engine. Coordinates are virtual-screen pixels (y down). Snow falls in front of everything and
// comes to rest on the top edges of app windows and on the taskbar. Each window's pile is a height per pixel
// column that settles like real snow, moves with the window, and falls off when the window is shaken,
// minimised or closed. Windows stacked in front hide the piles of windows behind them.
//
// On the piles live objects: snowballs (which roll when the mouse pushes them, and grow as they pick up
// snow), snowmen (stacks of two or three balls, which build themselves or are built by rolling a smaller ball
// into a bigger one) and Santa's presents. A snowplow clears the taskbar now and then.
#include "engine.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <map>

namespace snow {

Rect unite(const Rect& a, const Rect& b) {
  if (a.empty()) return b;
  if (b.empty()) return a;
  return {std::min(a.l, b.l), std::min(a.t, b.t), std::max(a.r, b.r), std::max(a.b, b.b)};
}
Rect intersect(const Rect& a, const Rect& b) {
  Rect r{std::max(a.l, b.l), std::max(a.t, b.t), std::min(a.r, b.r), std::min(a.b, b.b)};
  if (r.empty()) return {};
  return r;
}

const char* decoName(int k) {
  static const char* n[kDecoCount] = {"Holiday house", "Hydrant", "Street lamp", "Lantern", "Frosted pine", "Decorated fir",
                                      "Red present", "Blue present", "Bench", "Market stall", "Snowman", "Candy cane"};
  return k >= 0 && k < kDecoCount ? n[k] : "";
}
const char* lightColorsName(int c) {
  static const char* n[kLightColorCount] = {"Warm white", "Multicolour", "Cool white", "Red and green", "Gold", "Blue"};
  return c >= 0 && c < kLightColorCount ? n[c] : "";
}
uint32_t lightColor(int colors, int i) {
  switch (colors) {
    case kLightsWarm: return 0xFFC46E;
    case kLightsCool: return 0xD2E6FF;
    case kLightsGold: return 0xFFAF3C;
    case kLightsBlue: return 0x6EA5FF;
    case kLightsRedGreen: return (i & 1) ? 0x46D264 : 0xFF4646;
    default: {
      static const uint32_t m[] = {0xFF4646, 0x50DC6E, 0x5A96FF, 0xFFC83C, 0xFF7828, 0xDC64FF};
      return m[((i % 6) + 6) % 6];
    }
  }
}
Layout villageLayout() {
  Layout l;
  auto d = [&](int k, float p) { l.decos.push_back({k, 0, p}); };
  d(kDecoLamp, 0.025f); d(kDecoHouse, 0.06f); d(kDecoHydrant, 0.093f); d(kDecoPine, 0.12f);
  d(kDecoFir, 0.835f); d(kDecoStall, 0.876f); d(kDecoPresentRed, 0.911f); d(kDecoPresentBlue, 0.923f); d(kDecoBench, 0.951f); d(kDecoLantern, 0.979f);
  return l;
}

namespace {

constexpr float PI = 3.14159265358979f;
constexpr uint64_t kGroundTag = 0x5157000000000000ull;  // ground pile ids: tag | monitor index
constexpr uint64_t kDecoTag = 0x5158000000000000ull;    // roofs of decorations: tag | decoration index
constexpr float kDecoScale = 1.6f;                      // decorations are drawn 1.6 px per unit at 100%
constexpr float kRopeSeg = 7.f;
constexpr int kMaxClumps = 3000;
constexpr int kMaxPresents = 6, kMaxSnowmen = 8, kMaxBalls = 14;
constexpr float kGravity = 900.f;  // px/s² at 100% scale

struct Rng {
  uint64_t s = 0x9E3779B97F4A7C15ull;
  uint32_t u() { s ^= s << 13; s ^= s >> 7; s ^= s << 17; return (uint32_t)(s >> 11); }
  float f() { return (u() & 0xFFFFFF) / 16777216.f; }
  float r(float a, float b) { return a + (b - a) * f(); }
  int i(int n) { return (int)(u() % (uint32_t)std::max(1, n)); }
};

// ----------------------------------------------------------------------------------------- pixels
inline uint32_t pm(int r, int g, int b, float a) {
  int A = (int)(std::clamp(a, 0.f, 1.f) * 255.f + 0.5f);
  return ((uint32_t)A << 24) | ((uint32_t)((r * A + 127) / 255) << 16) | ((uint32_t)((g * A + 127) / 255) << 8) | (uint32_t)((b * A + 127) / 255);
}
// Premultiplied "source over destination".
inline void over(uint32_t* d, uint32_t s) {
  uint32_t sa = s >> 24;
  if (!sa) return;
  if (sa == 255) { *d = s; return; }
  uint32_t inv = 255 - sa, dv = *d;
  uint32_t rb = (dv & 0x00FF00FF) * inv;
  uint32_t ag = ((dv >> 8) & 0x00FF00FF) * inv;
  rb = ((rb + 0x00800080 + ((rb >> 8) & 0x00FF00FF)) >> 8) & 0x00FF00FF;
  ag = (ag + 0x00800080 + ((ag >> 8) & 0x00FF00FF)) & 0xFF00FF00;
  *d = s + rb + ag;
}
inline uint32_t scaleA(uint32_t s, uint32_t k /*0..256*/) {
  uint32_t rb = ((s & 0x00FF00FF) * k >> 8) & 0x00FF00FF;
  uint32_t ag = (((s >> 8) & 0x00FF00FF) * k) & 0xFF00FF00;
  return rb | ag;
}

// ----------------------------------------------------------------------------------------- world parts
struct Flake {
  float x, y, vy, ex, ey;     // ex, ey: extra velocity, from the mouse
  float phase, freq, amp;     // side-to-side flutter
  float r, alpha, depth;      // depth 0 = far and small, 1 = near and big; only near flakes settle
  float rot, rotV;
  int16_t mon;
  uint8_t crystal, variant, rbucket;
};

enum ClumpKind : uint8_t { kSnow, kGlitter, kDrop, kIce, kDebris, kSmoke };
struct Clump {
  float x, y, vx, vy, r, life;
  uint32_t color;
  int16_t mon;
  uint8_t kind;
};

struct Icicle { float rel, len, maxLen, w, drip; };

struct Pile {
  uint64_t id = 0;
  Kind kind = Kind::Window;
  float x0 = 0, base = 0;      // left edge and the y of the surface the snow sits on
  int width = 0, corner = 0, z = 0, mon = 0;
  float maxH = 16, scale = 1;
  std::vector<float> h;
  float vx = 0, vy = 0, sinceMove = 1;
  float lostL = 0, lostR = 0;  // snow that slid off the ends, waiting to drip as a clump
  float active = 0;            // seconds of settling left
  float deep = 0, check = 0;   // seconds the snow has been deep; countdown to the next look for snowmen
  bool visible = true, seen = true;
  bool deco = false;           // the roof of a decoration on the taskbar
  std::vector<Rect> occ;       // windows in front that overlap the pile's band
  std::vector<Icicle> icicles;

  float off(int c) const {     // how far the surface drops at the rounded corners
    if (corner <= 0) return 0;
    float R = (float)corner, d = -1;
    if (c < corner) d = R - (c + 0.5f);
    else if (c >= width - corner) d = R - (width - c - 0.5f);
    if (d < 0) return 0;
    return R - std::sqrt(std::max(0.f, R * R - d * d));
  }
  float surfaceY(int c) const { return base + off(c) - h[c]; }
  bool hidden(float x, float y) const {
    for (auto& o : occ) if (o.contains(x, y)) return true;
    return false;
  }
  float volume() const { float v = 0; for (float a : h) v += a; return v; }
};

// Things that sit on the snow: snowballs, snowmen and presents.
enum ObjKind : uint8_t { kStack, kPresent };
struct Obj {
  ObjKind kind = kStack;
  uint64_t pile = 0;           // the pile it sits on; 0 while in the air
  float rel = 0;               // x on the pile, from its left edge
  float x = 0, y = 0;          // bottom centre, screen pixels
  float vx = 0, vy = 0;        // in the air
  float roll = 0, spin = 0;    // a lone snowball rolling along its pile
  float r[3] = {0, 0, 0};      // ball radii, bottom first
  float target[3] = {0, 0, 0}; // a snowman building himself grows his balls to these
  int n = 0, nTarget = 0;      // balls now / when built
  float build = -1;            // >= 0 while building himself
  int hat = 0, hatColor = 0;
  bool right = true;
  float waveT = 0, nextWave = 12;
  float age = 0, life = 1e9f;  // presents vanish after a while
  int color = 0;
  float scale = 1, fallFrom = 0;
  bool dead = false;
  Sprite decor[2];
  int decorKey = -1;
};

struct Santa {
  bool on = false, right = true, dropped = true;
  int mon = 0;
  float x = 0, y0 = 0, t = 0, vx = 0, S = 1, dropAt = 0, glitter = 0;
};

struct Plow {
  bool on = false, right = true;
  int mon = 0;
  float x = 0, t = 0, S = 1, speed = 0, smoke = 0, blade = 0;
};

struct SpriteSet {
  std::vector<Sprite> crystals;  // [variant][bucket][angle]
  Sprite santa[2][4], present[5], plow[2][4];
  Sprite deco[kDecoCount][2];
};
constexpr int kVariants = 3, kBuckets = 4, kAngles = 8;
constexpr float kBucketR[kBuckets] = {3.2f, 4.3f, 5.4f, 6.6f};

struct MonState {
  std::vector<Rect> drawn;
  bool editDirty = false;  // the screen was dimmed for editing: clear it all once
  int count = 0;
  float spawnAcc = 0;
  float plowCheck = 8, plowCooldown = 45;
};

float easeOut(float t) { t = std::clamp(t, 0.f, 1.f); return 1 - (1 - t) * (1 - t); }

}  // namespace

// =========================================================================================== Impl
struct World::Impl {
  World* w;
  Rng rng;
  float time = 0, storm = 0, stormT = 0, meltAcc = 0;
  float windSeed[4];
  std::vector<Flake> flakes;
  std::vector<Clump> clumps;
  std::vector<Obj> objs, spawnQ;  // new objects wait in spawnQ until the loops over objs are done
  std::unordered_map<uint64_t, std::unique_ptr<Pile>> piles;
  std::vector<Pile*> surfaces;    // piles snow can land on, topmost window first
  std::vector<MonState> ms;
  std::map<int, std::unique_ptr<SpriteSet>> sprites;
  std::unordered_map<int, Sprite> ballCache;
  Santa santa;
  Plow plow;
  // the layout: decorations on the taskbar and strings of lights
  Layout layout_;
  struct DecoSt { int kind, mon; float x; uint64_t pile; };
  std::vector<DecoSt> decoSt;
  struct RopePt { float x, y, px, py; };
  struct Span { std::vector<RopePt> p; float seg = 7; bool hidden = false, aPinned = true, bPinned = true; };
  struct LightSim { std::vector<Span> spans; std::vector<Rect> occ; bool onTop = true; };
  std::vector<LightSim> lightSim;
  std::vector<Win> zlist_;
  std::unordered_map<uint64_t, Rect> winRect;
  std::unordered_map<uint64_t, int> winZ;
  std::vector<uint64_t> keep_;
  struct Editor {
    bool on = false;
    int tool = kEditSelect, kind = 0;
    Layout saved;
    int sel = -1, selJoint = -1;
    int hover = kHoverNone, hoverDeco = -1, hoverString = -1, hoverJoint = -1;
    int dragDeco = -1, dragString = -1, dragJoint = -1;
    float dragDX = 0;
    bool building = false;
    float mx = -1e9f, my = -1e9f;
    float slack = 0.4f;
    int colors = kLightsWarm;
  } ed;
  // the mouse
  bool cValid = false, cHad = false;
  float cx = 0, cy = 0, cpx = 0, cpy = 0, cvx = 0, cvy = 0;

  explicit Impl(World* ww) : w(ww) {
    for (float& s : windSeed) s = rng.r(0, 2 * PI);
  }

  const std::vector<Monitor>& mons() const { return w->mons_; }
  const Settings& set() const { return w->set_; }

  int monitorAt(float x, float y) const {
    for (size_t i = 0; i < mons().size(); ++i) if (mons()[i].r.contains(x, y)) return (int)i;
    return -1;
  }
  float scaleAt(float x, float y) const {
    int m = monitorAt(x, y);
    return m >= 0 ? mons()[m].scale : (mons().empty() ? 1.f : mons()[0].scale);
  }

  SpriteSet& spritesFor(float scale) {
    int key = (int)std::lround(scale * 100);
    auto& p = sprites[key];
    if (!p) {
      p = std::make_unique<SpriteSet>();
      p->crystals.reserve(kVariants * kBuckets * kAngles);
      for (int v = 0; v < kVariants; ++v)
        for (int b = 0; b < kBuckets; ++b)
          for (int a = 0; a < kAngles; ++a)
            p->crystals.push_back(makeCrystal(kBucketR[b] * scale, a * (PI / 3) / kAngles, v));
      for (int f = 0; f < 4; ++f) {
        p->santa[1][f] = makeSanta(scale * 1.35f, f, true);
        p->santa[0][f] = makeSanta(scale * 1.35f, f, false);
        p->plow[1][f] = makeSnowplow(scale * 1.1f, f, true);
        p->plow[0][f] = makeSnowplow(scale * 1.1f, f, false);
      }
      for (int c = 0; c < 5; ++c) p->present[c] = makePresent(scale * 1.5f, c);
    }
    return *p;
  }
  // A soft round light, rendered once per colour and size and then just copied.
  std::unordered_map<uint64_t, Sprite> glowCache;
  const Sprite& glowSprite(uint32_t rgb, float R) {
    int rr = std::max(2, (int)std::lround(R));
    uint64_t key = ((uint64_t)rgb << 16) | (uint64_t)rr;
    auto it = glowCache.find(key);
    if (it != glowCache.end()) return it->second;
    if (glowCache.size() > 200) glowCache.clear();
    Sprite g;
    g.w = g.h = 2 * rr + 1;
    g.ox = g.oy = rr;
    g.px.resize((size_t)g.w * g.h);
    int r = (rgb >> 16) & 255, gg = (rgb >> 8) & 255, b = rgb & 255;
    for (int y = 0; y < g.h; ++y)
      for (int x = 0; x < g.w; ++x) {
        float dx = (x - rr) / (float)rr, dy = (y - rr) / (float)rr, d = std::sqrt(dx * dx + dy * dy);
        float k = d < 1 ? (1 - d) * (1 - d) : 0;
        g.px[(size_t)y * g.w + x] = pm(r, gg, b, k);
      }
    return glowCache[key] = std::move(g);
  }
  // One light bulb: its glow, the coloured bulb and a glint, ready to copy.
  std::unordered_map<uint64_t, Sprite> bulbCache;
  const Sprite& bulbSprite(uint32_t rgb, float s) {
    uint64_t key = ((uint64_t)rgb << 16) | (uint64_t)std::lround(s * 100);
    auto it = bulbCache.find(key);
    if (it != bulbCache.end()) return it->second;
    if (bulbCache.size() > 200) bulbCache.clear();
    int R = std::max(3, (int)std::lround(7.5f * s));
    Sprite b;
    b.w = b.h = 2 * R + 1;
    b.ox = b.oy = R;
    b.px.assign((size_t)b.w * b.h, 0);
    int r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, bl = rgb & 255;
    float core = 1.75f * s, hi = 0.7f * s;
    for (int y = 0; y < b.h; ++y)
      for (int x = 0; x < b.w; ++x) {
        float dx = x - R + 0.f, dy = y - R + 0.f, d = std::sqrt(dx * dx + dy * dy);
        uint32_t px = 0;
        float k = d < R ? (1 - d / R) : 0;
        if (k > 0) px = pm(r, g, bl, 0.42f * k * k);
        float c = std::clamp(core + 0.5f - d, 0.f, 1.f);
        if (c > 0) over(&px, pm(r, g, bl, c));
        float hd = std::sqrt((dx + 0.5f * s) * (dx + 0.5f * s) + (dy + 0.55f * s) * (dy + 0.55f * s));
        float h = std::clamp(hi + 0.5f - hd, 0.f, 1.f) * 0.6f;
        if (h > 0) over(&px, pm(255, 255, 255, h));
        b.px[(size_t)y * b.w + x] = px;
      }
    return bulbCache[key] = std::move(b);
  }
  const Sprite& ballSprite(float r) {
    int key = (int)std::lround(r * 4);
    auto it = ballCache.find(key);
    if (it != ballCache.end()) return it->second;
    if (ballCache.size() > 400) ballCache.clear();
    return ballCache[key] = makeBall(key / 4.f);
  }

  // ------------------------------------------------------------------------------------- wind
  // The wind the user set (direction and strength), with gusts along it. px/s at 100%.
  void windVec(float& x, float& y) const {
    float wx = std::clamp(set().windX, -1.f, 1.f), wy = std::clamp(set().windY, -1.f, 1.f);
    float strength = std::min(1.f, std::sqrt(wx * wx + wy * wy));
    float t = time;
    float g = (6 + 55 * strength) * (0.55f * std::sin(t * 0.17f + windSeed[1]) + 0.3f * std::sin(t * 0.41f + windSeed[2]) + 0.15f * std::sin(t * 1.1f + windSeed[3]));
    float dx = strength > 0.05f ? wx / strength : 1.f, dy = strength > 0.05f ? wy / strength : 0.f;
    x = wx * 95 + g * dx + storm * 70.f * (0.6f + 0.4f * std::sin(t * 0.23f));
    y = wy * 45 + g * dy * 0.4f;
  }

  // ------------------------------------------------------------------------------------- piles
  Pile* ground(int mi) {
    auto it = piles.find(kGroundTag | (uint64_t)mi);
    return it == piles.end() ? nullptr : it->second.get();
  }
  Pile* pileById(uint64_t id) {
    auto it = piles.find(id);
    return it == piles.end() ? nullptr : it->second.get();
  }

  void rebuildSurfaces() {
    surfaces.clear();
    for (auto& kv : piles) {
      Pile* p = kv.second.get();
      if (!p->visible || p->width <= 0) continue;
      bool low = p->kind == Kind::Taskbar || p->deco;
      if (low && !set().pileTaskbar) continue;
      if (!low && !set().pileWindows) continue;
      if (low && (p->mon >= (int)mons().size() || !mons()[p->mon].active)) continue;
      surfaces.push_back(p);
    }
    std::sort(surfaces.begin(), surfaces.end(), [](Pile* a, Pile* b) { return a->z < b->z; });
  }

  void resample(Pile& p, int width) {
    if (width == p.width) return;
    std::vector<float> nh((size_t)std::max(0, width), 0.f);
    if (p.width > 0 && width > 0) {
      float k = (float)p.width / width;
      for (int i = 0; i < width; ++i) {
        float s = (i + 0.5f) * k - 0.5f;
        int a = std::clamp((int)std::floor(s), 0, p.width - 1), b = std::min(a + 1, p.width - 1);
        float f = std::clamp(s - a, 0.f, 1.f);
        nh[i] = p.h[a] * (1 - f) + p.h[b] * f;
      }
    }
    p.h.swap(nh);
    p.width = width;
    p.active = 2;
  }

  void makeIcicles(Pile& p) {
    p.icicles.clear();
    Rng r; r.s ^= p.id * 0x9E3779B97F4A7C15ull + 7;
    for (int k = 0; k < 4; ++k) r.u();
    int n = std::clamp((int)(p.width / (240.f * p.scale)), 1, 5);
    for (int i = 0; i < n; ++i) {
      Icicle c;
      c.rel = (i % 2 == 0 && i < 4) ? (i == 0 ? r.r(0.03f, 0.12f) : r.r(0.88f, 0.97f)) : r.r(0.15f, 0.85f);
      if (i == 2) c.rel = r.r(0.04f, 0.14f);
      c.len = 0;
      c.maxLen = r.r(6.f, 16.f) * p.scale;
      c.w = r.r(3.f, 4.8f) * p.scale;
      c.drip = r.r(3, 12);
      p.icicles.push_back(c);
    }
  }

  void addClump(float x, float y, float vx, float vy, float r, uint8_t kind, uint32_t color = 0, float life = 30) {
    if ((int)clumps.size() >= kMaxClumps) return;
    int m = monitorAt(x, std::max(y, (float)(mons().empty() ? 0 : mons()[0].r.t)));
    if (m < 0) m = monitorAt(x, y + 40);
    if (m < 0) return;
    clumps.push_back({x, y, vx, vy, r, life, color, (int16_t)m, kind});
  }
  void sparkle(float x, float y, float s, int n = 14) {
    for (int k = 0; k < n; ++k)
      addClump(x + rng.r(-6, 6) * s, y + rng.r(-6, 6) * s, rng.r(-50, 50) * s, rng.r(-80, 10) * s, rng.r(0.6f, 1.2f) * s, kGlitter, glitterColor(), rng.r(0.6f, 1.3f));
  }

  // Shake `frac` of the snow off a pile, flung with (vx, vy).
  void shed(Pile& p, float frac, float vx, float vy) {
    if (!p.visible || p.width <= 0) return;
    frac = std::clamp(frac, 0.f, 1.f);
    float total = p.volume() * frac;
    const float s = p.scale;
    if (total >= 0.5f) {
      // Bigger clumps when there's a lot of snow, so a full window doesn't become thousands of particles.
      float rr = std::clamp(std::sqrt(total / (PI * 700.f)), 1.1f, 2.6f) * std::max(1.f, s * 0.8f);
      float cv = PI * rr * rr;
      float acc = 0;
      for (int c = 0; c < p.width; ++c) {
        float take = p.h[c] * frac;
        if (take <= 0) continue;
        float y = p.surfaceY(c) + p.h[c] * 0.5f;
        p.h[c] -= take;
        acc += take;
        while (acc >= cv) {
          acc -= cv;
          if (!p.hidden(p.x0 + c, y)) addClump(p.x0 + c + rng.f(), y - rng.f() * 2 * s, vx + rng.r(-50, 50) * s, vy + rng.r(-170, -10) * s, rr * rng.r(0.75f, 1.15f), kSnow);
        }
      }
    }
    if (frac > 0.3f) {
      for (auto& ic : p.icicles) {
        if (ic.len > 2) {
          float x = p.x0 + ic.rel * p.width;
          for (int k = 0; k < 3; ++k) addClump(x + rng.r(-1, 1), p.base + ic.len * (k + 0.5f) / 3, vx * 0.6f + rng.r(-30, 30) * s, vy * 0.5f + rng.r(-60, 0) * s, 1.1f * s, kIce);
        }
        ic.len = 0;
      }
      for (auto& o : objs)
        if (o.pile == p.id && !o.dead) toAir(o, vx * 0.6f + rng.r(-50, 50) * s, vy * 0.6f - rng.r(80, 220) * s);
    }
    p.active = 2;
  }

  void deposit(Pile& p, int c, float vol, float r) {
    if (c < 0 || c >= p.width) return;
    float fill = p.h[c] / p.maxH;
    float k = 1.f - fill * fill;
    if (k <= 0.02f) k = 0.02f;
    vol *= k;
    int rad = 2 + (int)std::ceil(r * 2.2f);  // spread wide: thin snow on bare ground stays smooth
    float wsum = 0;
    for (int i = -rad; i <= rad; ++i) if (c + i >= 0 && c + i < p.width) wsum += (rad + 1 - std::abs(i));
    if (wsum <= 0) return;
    for (int i = -rad; i <= rad; ++i) {
      int cc = c + i;
      if (cc < 0 || cc >= p.width) continue;
      p.h[cc] += vol * (rad + 1 - std::abs(i)) / wsum;
    }
    p.active = 2.5f;
  }

  void settle(Pile& p, float dt) {
    if (p.active <= 0 || p.width < 2) return;
    p.active -= dt;
    // Fresh snow is a little sticky: it holds a steep, rounded edge, like a cap on the window.
    const float s = p.kind == Kind::Window ? 1.25f : 1.0f;
    float* h = p.h.data();
    const int n = p.width;
    for (int pass = 0; pass < 2; ++pass) {
      bool fwd = ((int)(time * 60) + pass) & 1;
      for (int k = 0; k < n - 1; ++k) {
        int i = fwd ? k : n - 2 - k;
        float d = h[i] - h[i + 1];
        if (d > s) { float m = (d - s) * 0.5f; h[i] -= m; h[i + 1] += m; }
        else if (d < -s) { float m = (-d - s) * 0.5f; h[i] += m; h[i + 1] -= m; }
      }
      // a little diffusion rounds the surface off
      if (pass == 0) {
        float prev = h[0];
        for (int i = 1; i < n - 1; ++i) {
          float cur = h[i];
          h[i] = cur + 0.07f * (prev + h[i + 1] - 2 * cur);
          prev = cur;
        }
      }
      if (p.kind == Kind::Window) {  // the ends of a window: snow slides off and drips
        const float e = 2.0f * p.scale;
        if (h[0] > e) { float m = (h[0] - e) * 0.5f; h[0] -= m; p.lostL += m; }
        if (h[n - 1] > e) { float m = (h[n - 1] - e) * 0.5f; h[n - 1] -= m; p.lostR += m; }
      }
    }
    float cv = 3.2f * p.scale * p.scale;
    if (p.lostL > cv) { p.lostL -= cv; if (!p.hidden(p.x0, p.base)) addClump(p.x0 - 0.5f, p.base + p.corner * 0.6f, -rng.r(4, 26) * p.scale, rng.r(0, 20), 1.1f * p.scale, kSnow); }
    if (p.lostR > cv) { p.lostR -= cv; if (!p.hidden(p.x0 + p.width, p.base)) addClump(p.x0 + p.width + 0.5f, p.base + p.corner * 0.6f, rng.r(4, 26) * p.scale, rng.r(0, 20), 1.1f * p.scale, kSnow); }
  }

  // Where does something falling from (x, y0) to (x, y1) land? Picks the first exposed surface it crosses.
  // Snowflakes (passThrough) may be falling in front of a window further back and pass its edge.
  Pile* landing(float x, float y0, float y1, int* col, bool passThrough = true) {
    Pile* best = nullptr;
    float bestY = 1e30f;
    for (Pile* p : surfaces) {
      int c = (int)std::floor(x - p->x0);
      if (c < 0 || c >= p->width) continue;
      float sy = p->surfaceY(c);
      if (y0 >= sy || y1 < sy || sy >= bestY) continue;  // only a real crossing, so each edge gets one chance
      if (p->hidden(x, sy - 0.5f)) continue;
      best = p; bestY = sy; *col = c;
    }
    if (passThrough && best && best->kind == Kind::Window) {
      for (Pile* f : surfaces) {
        if (f == best || f->kind != Kind::Window || f->z >= best->z) continue;
        int c = (int)std::floor(x - f->x0);
        if (c < 0 || c >= f->width) continue;
        float sy = f->surfaceY(c);
        if (sy > bestY && !f->hidden(x, sy - 0.5f)) {
          if (rng.f() < 0.5f) return nullptr;
          break;
        }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------------------------- objects
  float topR(const Obj& o) const { return o.n > 0 ? o.r[o.n - 1] : 0; }
  bool built(const Obj& o) const { return o.kind == kStack && o.build < 0; }
  bool decorated(const Obj& o) const { return o.kind == kStack && o.n >= 2 && (o.build < 0 || o.build >= o.nTarget); }
  float topY(const Obj& o) const {  // the top of the top ball, screen y
    float c[3];
    snowmanCentres(o.r, o.n, c);
    return o.y - c[o.n - 1] - topR(o);
  }

  void toAir(Obj& o, float vx, float vy) {
    o.pile = 0;
    o.vx = vx; o.vy = vy;
    o.roll = 0;
    o.fallFrom = o.y;
  }

  Obj newBall(float x, float y, float r, float scale) {
    Obj o;
    o.kind = kStack;
    o.x = x; o.y = y;
    o.r[0] = r; o.n = o.nTarget = 1;
    o.scale = scale;
    o.hat = rng.f() < 0.6f ? 0 : (rng.f() < 0.5f ? 1 : 2);
    o.hatColor = rng.i(4);
    o.right = rng.f() < 0.5f;
    o.fallFrom = y;
    return o;
  }

  // A snowman falls apart into his balls (which can be rolled into a new one); his hat flies off.
  void breakStack(Obj& o, float vx, float vy) {
    if (o.dead) return;
    const float s = o.scale;
    float c[3];
    snowmanCentres(o.r, o.n, c);
    for (int i = 0; i < o.n; ++i) {
      if (o.r[i] < 1.5f * s) continue;
      Obj b = newBall(o.x + rng.r(-2, 2) * s, o.y - c[i] + o.r[i] * 0.92f, o.r[i], s);
      b.vx = vx + rng.r(-110, 110) * s;
      b.vy = vy - rng.r(60, 240) * s;
      b.fallFrom = b.y;
      spawnQ.push_back(b);
    }
    if (o.n >= 2) {
      float hy = topY(o);
      uint32_t hatCol = o.hat == 1 ? pm(25, 25, 30, 1) : pm(205, 35, 40, 1);
      for (int i = 0; i < 6; ++i) addClump(o.x + rng.r(-4, 4) * s, hy, vx * 0.5f + rng.r(-140, 140) * s, rng.r(-300, -100) * s, 1.3f * s, kDebris, hatCol);
      for (int i = 0; i < 4; ++i) addClump(o.x + rng.r(-4, 4) * s, hy + topR(o), rng.r(-140, 140) * s, rng.r(-260, -80) * s, 1.1f * s, kDebris, pm(25, 25, 30, 1));
      addClump(o.x, hy + topR(o), rng.r(-140, 140) * s, rng.r(-260, -80) * s, 1.3f * s, kDebris, pm(245, 130, 30, 1));
    }
    for (int i = 0; i < 25; ++i) addClump(o.x + rng.r(-6, 6) * s, o.y - rng.f() * c[o.n - 1], vx * 0.3f + rng.r(-120, 120) * s, rng.r(-250, -40) * s, rng.r(1.f, 2.f) * s, kSnow);
    o.dead = true;
  }

  // A lone ball rolled into a snowman (or a bigger ball): it hops up, to land on top.
  void hop(Obj& o, const Obj& t) {
    const float s = o.scale, g = kGravity * s;
    float h = std::max(4 * s, o.y - topY(t) + 6 * s);
    float vy = -std::sqrt(2 * g * h), tUp = -vy / g, tLand = tUp + std::sqrt(2 * 6 * s / g);
    toAir(o, (t.x - o.x) / tLand, vy);
  }
  void stackOnto(Obj& o, Obj& t) {
    t.r[t.n] = o.r[0];
    t.n++;
    t.nTarget = t.n;
    t.decorKey = -1;
    t.waveT = 1.5f;
    o.dead = true;
    if (t.n == 2) sparkle(t.x, topY(t), t.scale);
  }

  // Snowmen and snowballs appear on deep snow by themselves.
  void autoSpawn(Pile& p) {
    if (p.deco || !set().snowmen || !p.visible || p.width < 90 * p.scale) return;
    if ((p.kind == Kind::Taskbar && !set().pileTaskbar) || (p.kind == Kind::Window && !set().pileWindows)) return;
    if (p.kind == Kind::Taskbar && (p.mon >= (int)mons().size() || !mons()[p.mon].active)) return;
    float avg = p.volume() / p.width;
    p.deep = avg >= 0.6f * p.maxH ? p.deep + 1 : 0;
    int men = 0, balls = 0, allMen = 0, allBalls = 0;
    for (auto& o : objs) {
      if (o.kind != kStack || o.dead) continue;
      bool man = o.nTarget >= 2;
      (man ? allMen : allBalls)++;
      if (o.pile == p.id) (man ? men : balls)++;
    }
    const float s = p.scale;
    auto freeSpot = [&](float lo, float hi, float* rel) {
      for (int k = 0; k < 8; ++k) {
        float r = rng.r(lo, hi) * p.width;
        if (p.hidden(p.x0 + r, p.base - 4)) continue;
        bool clear = true;
        if (p.kind == Kind::Taskbar)  // not in front of a decoration
          for (auto& d : decoSt)
            if (d.mon == p.mon && std::fabs(d.x - (p.x0 + r)) < decoGeom(d.kind).w * kDecoScale * s * 0.5f + 18 * s) clear = false;
        for (auto& o : objs) if (!o.dead && o.pile == p.id && std::fabs(o.rel - r) < 44 * s) clear = false;
        if (clear) { *rel = r; return true; }
      }
      return false;
    };
    float rel;
    if (p.deep >= 20 && men < (p.kind == Kind::Taskbar ? 2 : 1) && allMen < kMaxSnowmen && rng.f() < 0.12f) {
      bool ends = p.kind == Kind::Taskbar;
      bool ok = ends ? (rng.f() < 0.5f ? freeSpot(0.05f, 0.2f, &rel) : freeSpot(0.8f, 0.95f, &rel)) : freeSpot(0.14f, 0.86f, &rel);
      if (!ok) return;
      Obj o = newBall(p.x0 + rel, p.base, 0, s);
      o.pile = p.id;
      o.rel = rel;
      o.nTarget = rng.f() < 0.25f ? 2 : 3;
      o.n = 1;
      o.target[0] = rng.r(9.5f, 12.f) * s;
      o.target[1] = o.target[0] * (o.nTarget == 2 ? rng.r(0.64f, 0.72f) : rng.r(0.7f, 0.78f));
      o.target[2] = o.target[1] * rng.r(0.68f, 0.76f);
      o.build = 0;
      o.nextWave = rng.r(6, 16);
      spawnQ.push_back(o);
    } else if (avg >= 0.45f * p.maxH && balls < 2 && allBalls < kMaxBalls && rng.f() < 0.035f && freeSpot(0.2f, 0.8f, &rel)) {
      Obj o = newBall(p.x0 + rel, p.base, 2.2f * s, s);
      o.pile = p.id;
      o.rel = rel;
      o.roll = (rng.f() < 0.5f ? -1 : 1) * rng.r(160, 260) * s;
      spawnQ.push_back(o);
    }
  }

  void updateObjects(float dt) {
    for (size_t i = 0; i < objs.size(); ++i) {
      Obj& o = objs[i];
      if (o.dead) continue;
      const float s = o.scale, g = kGravity * s;
      o.age += dt;
      // a snowman building himself
      if (o.kind == kStack && o.build >= 0) {
        float prev = o.build;
        o.build += dt / 1.1f;
        for (int k = 0; k < o.nTarget; ++k) o.r[k] = o.target[k] * easeOut(o.build - k);
        o.n = std::clamp((int)std::floor(o.build) + 1, 1, o.nTarget);
        if (prev < o.nTarget && o.build >= o.nTarget) { o.decorKey = -1; sparkle(o.x, topY(o), s); }
        if (o.build >= o.nTarget + 0.4f) { o.build = -1; o.n = o.nTarget; for (int k = 0; k < o.n; ++k) o.r[k] = o.target[k]; }
      }
      if (o.pile) {
        Pile* p = pileById(o.pile);
        if (!p) { toAir(o, 0, 0); continue; }
        if (!p->visible) continue;  // its window is hidden for now
        if (o.kind == kStack && o.n == 1 && o.build < 0 && std::fabs(o.roll) > 0.5f) roll(o, *p, dt);
        if (o.dead || !o.pile) continue;
        if (o.rel < 0 || o.rel >= p->width) {  // off the end
          o.x = p->x0 + o.rel;
          toAir(o, o.roll, -20 * s);
          continue;
        }
        int c = std::clamp((int)o.rel, 0, p->width - 1);
        o.x = p->x0 + o.rel;
        o.y = p->surfaceY(c) + (o.kind == kPresent ? 1.5f * s : 0.f);
        // snowmen wave now and then, when Santa flies over, and when the mouse comes to say hello
        if (decorated(o)) {
          o.nextWave -= dt;
          float hy = topY(o);
          bool near = cValid && std::fabs(cx - o.x) < 36 * s && cy > hy - 30 * s && cy < o.y + 10 * s;
          int mi = monitorAt(o.x, o.y - 1);
          if (o.nextWave <= 0 || near || (santa.on && santa.mon == mi)) { o.waveT = std::max(o.waveT, 1.6f); if (o.nextWave <= 0) o.nextWave = rng.r(12, 30); }
          o.waveT = std::max(0.f, o.waveT - dt);
        }
      } else {  // in the air
        float py = o.y;
        o.vy += g * dt;
        o.x += o.vx * dt; o.y += o.vy * dt;
        o.vx *= std::exp(-dt * 0.3f);
        if (o.kind == kStack) o.spin += o.vx * dt / std::max(1.f, o.r[0]);
        if (o.vy > 0) {
          bool done = false;
          if (o.kind == kStack && o.n == 1)  // onto a snowman or a bigger ball
            for (auto& t : objs) {
              if (&t == &o || t.dead || !t.pile || !built(t) || t.n >= 3) continue;
              float ty = topY(t), tr = topR(t);
              if (std::fabs(o.x - t.x) < tr * 0.85f && py <= ty + 1 && o.y >= ty && o.r[0] <= tr * 1.15f) { stackOnto(o, t); done = true; break; }
            }
          if (done) continue;
          int c;
          if (Pile* p = landing(o.x, py, o.y, &c, false)) {
            o.pile = p->id;
            o.rel = o.x - p->x0;
            float fell = o.y - o.fallFrom;
            if (o.kind == kStack && o.n >= 2 && fell > 170 * s) { o.y = p->surfaceY(c); breakStack(o, o.vx * 0.3f, 0); continue; }
            if (o.kind == kStack && o.n == 1) o.roll = o.vx * 0.6f;
            o.vx = o.vy = 0;
            continue;
          }
        }
        int m = monitorAt(o.x, o.y);
        if (m < 0 && monitorAt(o.x, o.y - 3000) < 0) o.dead = true;
        if (m >= 0 && o.y > mons()[m].groundY + 60 * s) o.dead = true;
      }
      if (o.kind == kPresent && o.age > o.life) {  // vanishes in a puff of glitter
        sparkle(o.x, o.y - 5 * s, s, 24);
        o.dead = true;
      }
    }
    objs.erase(std::remove_if(objs.begin(), objs.end(), [](const Obj& o) { return o.dead; }), objs.end());
    for (auto& o : spawnQ) objs.push_back(std::move(o));
    spawnQ.clear();
  }

  // A lone snowball rolling along its pile: it picks up the snow it rolls over and grows.
  void roll(Obj& o, Pile& p, float dt) {
    const float s = o.scale;
    float old = o.rel;
    o.rel += o.roll * dt;
    o.spin += o.roll * dt / std::max(1.f, o.r[0]);
    int a, b;
    if (o.rel > old) { a = (int)std::floor(old) + 1; b = (int)std::floor(o.rel); }
    else { a = (int)std::floor(o.rel); b = (int)std::floor(old) - 1; }
    float gained = 0;
    for (int c = std::max(a, 0); c <= std::min(b, p.width - 1); ++c) {
      float take = p.h[c] * 0.35f;
      p.h[c] -= take;
      gained += take;
    }
    if (gained > 0) {
      float maxR = 16 * s;
      if (o.r[0] < maxR) o.r[0] = std::min(maxR, std::sqrt(o.r[0] * o.r[0] + gained * 0.25f / PI));
      p.active = 2;
    }
    float dec = (90 * s + 0.5f * std::fabs(o.roll)) * dt;
    o.roll = std::fabs(o.roll) <= dec ? 0 : o.roll - std::copysign(dec, o.roll);
    // bumping into others on the same pile
    for (auto& t : objs) {
      if (&t == &o || t.dead || t.pile != o.pile || t.kind != kStack) continue;
      float d = t.rel - o.rel, minD = o.r[0] + t.r[0] * 0.95f;
      if (std::fabs(d) >= minD || d * o.roll <= 0) continue;
      if (built(t) && t.n < 3 && t.n >= 1 && o.r[0] <= topR(t) && std::fabs(o.roll) > 30 * s) { hop(o, t); break; }
      if (t.n == 1 && built(t)) { t.roll += o.roll * 0.75f; o.roll *= 0.2f; o.rel = t.rel - std::copysign(minD, d); }
      else if (t.n >= 2 && std::fabs(o.roll) > 260 * s && o.r[0] > t.r[0] * 0.7f) { breakStack(t, o.roll * 0.5f, -150 * s); o.roll *= 0.4f; }
      else { o.roll = -o.roll * 0.3f; o.rel = t.rel - std::copysign(minD, d); }
      break;
    }
  }

  // ------------------------------------------------------------------------------------- snowplow
  void sendPlow() {
    if (plow.on || mons().empty()) return;
    int best = -1;
    float bestAvg = -1;
    for (int mi = 0; mi < (int)mons().size(); ++mi) {
      Pile* g = ground(mi);
      if (!g || !mons()[mi].active || !g->width) continue;
      float avg = g->volume() / g->width;
      if (avg > bestAvg) { bestAvg = avg; best = mi; }
    }
    if (best < 0) return;
    startPlow(best);
  }
  void startPlow(int mi) {
    const Monitor& m = mons()[mi];
    Pile* g = ground(mi);
    if (!g) return;
    // start from the end with more snow
    int n = std::max(1, g->width / 2);
    float left = 0, right = 0;
    for (int i = 0; i < n; ++i) { left += g->h[i]; right += g->h[g->width - 1 - i]; }
    plow = Plow{};
    plow.on = true;
    plow.mon = mi;
    plow.right = left >= right;
    plow.S = m.scale * 1.1f;
    plow.speed = 105 * m.scale;
    plow.x = plow.right ? m.r.l - 30 * plow.S : m.r.r + 30 * plow.S;
    plow.blade = plow.x + (plow.right ? 1 : -1) * 25 * plow.S;
  }

  void updatePlow(float dt) {
    for (int mi = 0; mi < (int)ms.size() && mi < (int)mons().size(); ++mi) {
      MonState& st = ms[mi];
      st.plowCooldown -= dt;
      st.plowCheck -= dt;
      if (st.plowCheck > 0) continue;
      st.plowCheck = 5;
      Pile* g = ground(mi);
      if (plow.on || st.plowCooldown > 0 || !set().snowplow || !set().pileTaskbar || !g || !g->width || !mons()[mi].active) continue;
      if (g->volume() / g->width >= 0.5f * g->maxH && rng.f() < 0.35f) startPlow(mi);
    }
    if (!plow.on) return;
    Pile* g = ground(plow.mon);
    if (!g || plow.mon >= (int)mons().size() || !mons()[plow.mon].active) { plow.on = false; return; }
    const Monitor& m = mons()[plow.mon];
    const float S = plow.S, s = m.scale, dir = plow.right ? 1.f : -1.f;
    plow.t += dt;
    plow.x += dir * plow.speed * dt;
    plow.blade = plow.x + dir * 25 * S;
    // clear everything under the plow and push it ahead of the blade as a heap
    float load = 0;
    int c0 = (int)std::floor(std::min(plow.blade, plow.x - dir * 22 * S) - g->x0);
    int c1 = (int)std::floor(std::max(plow.blade, plow.x - dir * 22 * S) - g->x0);
    for (int c = std::max(0, c0); c <= std::min(g->width - 1, c1); ++c) {
      float take = g->h[c] * 0.9f;
      g->h[c] -= take;
      load += take;
    }
    if (load > 0) {
      int front = (int)std::floor(plow.blade - g->x0) + (int)dir;
      int hw = std::max(3, (int)(9 * S));
      float wsum = 0;
      for (int k = 0; k < hw; ++k) wsum += hw - k;
      int sprays = 0;
      for (int k = 0; k < hw; ++k) {
        int c = front + (int)dir * k;
        float add = load * (hw - k) / wsum;
        if (c < 0 || c >= g->width) continue;  // pushed off the screen
        g->h[c] += add;
        float cap = 2.4f * g->maxH;
        if (g->h[c] > cap) {
          float extra = g->h[c] - cap;
          g->h[c] = cap;
          if (sprays < 1) { addClump(g->x0 + c, g->base - cap, dir * rng.r(80, 220) * s, -rng.r(150, 330) * s, rng.r(1.2f, 2.f) * s, kSnow); ++sprays; }
          (void)extra;
        }
      }
      g->active = 2;
    }
    // whatever is in the way gets pushed along, or knocked over
    for (auto& o : objs) {
      if (o.dead || o.pile != g->id) continue;
      float ahead = dir * (o.x - plow.blade);
      float reach = o.kind == kPresent ? 5 * s : o.r[0];
      if (ahead > reach || ahead < -40 * S) continue;
      if (o.kind == kPresent) toAir(o, dir * 220 * s, -260 * s);
      else if (o.n >= 2) breakStack(o, dir * 160 * s, -180 * s);
      else { o.rel = plow.blade - g->x0 + dir * (o.r[0] + 1); o.roll = 0; }
    }
    // exhaust
    plow.smoke += dt * 7;
    while (plow.smoke >= 1) {
      plow.smoke -= 1;
      addClump(plow.x + dir * 9 * S, g->base - 24 * S, -dir * rng.r(5, 15) * s, -rng.r(18, 32) * s, rng.r(1.2f, 2.f) * s, kSmoke, pm(115, 115, 125, 1), rng.r(1.2f, 1.8f));
    }
    if ((plow.right && plow.x > m.r.r + 40 * S) || (!plow.right && plow.x < m.r.l - 40 * S)) {
      plow.on = false;
      if (plow.mon < (int)ms.size()) ms[plow.mon].plowCooldown = 180;
    }
  }

  // ------------------------------------------------------------------------------------- decorations
  float decoS(int mi) const { return mons()[mi].scale * kDecoScale; }

  // Decorations stand on the taskbar's top edge; those with a flat top get a little pile of their own.
  void rebuildDecos() {
    for (auto it = piles.begin(); it != piles.end();) {
      if (!it->second->deco) { ++it; continue; }
      for (auto& o : objs) if (o.pile == it->first) toAir(o, 0, 0);
      it = piles.erase(it);
    }
    decoSt.clear();
    if (set().decorations && !mons().empty()) {
      for (size_t i = 0; i < layout_.decos.size(); ++i) {
        const Decoration& d = layout_.decos[i];
        int mi = d.monitor >= 0 && d.monitor < (int)mons().size() ? d.monitor : 0;
        const Monitor& m = mons()[mi];
        float S = decoS(mi);
        DecoSt st{std::clamp(d.kind, 0, kDecoCount - 1), mi, m.r.l + std::clamp(d.pos, 0.f, 1.f) * m.r.w(), 0};
        DecoGeom g = decoGeom(st.kind);
        if (g.roofW > 0) {
          auto p = std::make_unique<Pile>();
          p->id = kDecoTag | i;
          p->kind = Kind::Window;
          p->deco = true;
          p->mon = mi;
          p->scale = m.scale;
          p->maxH = (g.roofW >= 30 ? 8.f : 5.f) * m.scale;
          int w = std::max(2, (int)std::lround(g.roofW * S));
          p->x0 = std::round(st.x - w * 0.5f);
          p->base = std::round(m.groundY - g.roofY * S);
          resample(*p, w);
          if (g.roofW >= 30) makeIcicles(*p);
          if (Pile* gp = ground(mi)) { p->occ = gp->occ; p->z = gp->z; }
          st.pile = p->id;
          piles[p->id] = std::move(p);
        }
        decoSt.push_back(st);
      }
    }
    rebuildSurfaces();
  }

  // ------------------------------------------------------------------------------------- lights
  // Where a joint is now. state: 0 pinned, 1 loose (its window is gone), 2 hidden (its window is hidden).
  void jointPos(LightJoint& j, float* x, float* y, int* state) {
    *state = 0;
    if (j.window) {
      auto it = winRect.find(j.window);
      if (it != winRect.end()) {
        const Rect& r = it->second;
        j.x = r.l + j.fx * r.w();
        j.y = r.t + j.fy * r.h();
      } else {
        *state = std::find(keep_.begin(), keep_.end(), j.window) != keep_.end() ? 2 : 1;
      }
    }
    *x = j.x; *y = j.y;
  }
  static float ropeLength(float D, float slack) { return D * (1.003f + 0.25f * slack * slack) + 2; }

  void buildSpan(Span& sp, float ax, float ay, float bx, float by, float slack) {
    float s = scaleAt(ax, ay);
    float D = std::sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    float L = ropeLength(D, slack);
    int n = std::clamp((int)std::lround(L / (kRopeSeg * s)), 3, 240);
    sp.seg = L / n;
    float sag = std::sqrt(std::max(0.f, 3 * D * (L - D) / 8));  // a parabola about as long as the rope
    sp.p.resize(n + 1);
    for (int i = 0; i <= n; ++i) {
      float t = (float)i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t + 4 * sag * t * (1 - t);
      sp.p[i] = {x, y, x, y};
    }
  }
  void rebuildString(int i) {
    if (i < 0 || i >= (int)layout_.lights.size()) return;
    if ((int)lightSim.size() != (int)layout_.lights.size()) lightSim.resize(layout_.lights.size());
    LightString& L = layout_.lights[i];
    LightSim& sim = lightSim[i];
    sim.spans.assign(L.joints.size() > 1 ? L.joints.size() - 1 : 0, Span{});
    for (size_t k = 0; k + 1 < L.joints.size(); ++k) {
      float ax, ay, bx, by;
      int sa, sb;
      jointPos(L.joints[k], &ax, &ay, &sa);
      jointPos(L.joints[k + 1], &bx, &by, &sb);
      buildSpan(sim.spans[k], ax, ay, bx, by, L.slack);
    }
    lightOcc(i);
  }
  void rebuildLights() {
    lightSim.assign(layout_.lights.size(), LightSim{});
    for (int i = 0; i < (int)layout_.lights.size(); ++i) rebuildString(i);
  }
  // Lights hung from windows are hidden by windows in front of them; lights hung only from points on the
  // screen are like a garland on the glass, in front of everything.
  void lightOcc(int i) {
    LightSim& sim = lightSim[i];
    int front = 1 << 30;
    for (auto& j : layout_.lights[i].joints) {
      if (!j.window) continue;
      auto it = winZ.find(j.window);
      if (it != winZ.end()) front = std::min(front, it->second);
    }
    sim.occ.clear();
    sim.onTop = front == (1 << 30);
    if (sim.onTop) return;
    for (int k = 0; k < front && k < (int)zlist_.size(); ++k) sim.occ.push_back(zlist_[k].r);
  }

  void simulateLights(float dt) {
    if (!set().lights || lightSim.size() != layout_.lights.size()) return;
    float wx, wy;
    windVec(wx, wy);
    const bool brush = cValid && cHad && !ed.on && set().mouse && std::sqrt(cvx * cvx + cvy * cvy) > 60;
    const float dt2 = dt * dt;
    for (size_t i = 0; i < lightSim.size(); ++i) {
      LightString& L = layout_.lights[i];
      for (size_t k = 0; k < lightSim[i].spans.size() && k + 1 < L.joints.size(); ++k) {
        Span& sp = lightSim[i].spans[k];
        float ax, ay, bx, by;
        int sa, sb;
        jointPos(L.joints[k], &ax, &ay, &sa);
        jointPos(L.joints[k + 1], &bx, &by, &sb);
        sp.hidden = sa == 2 || sb == 2 || (sa == 1 && sb == 1);
        if (sp.hidden || sp.p.size() < 2) continue;
        sp.aPinned = sa == 0;
        sp.bPinned = sb == 0;
        const float s = scaleAt(ax, ay), g = 700 * s;
        const int n = (int)sp.p.size();
        int mi = monitorAt(ax, ay);
        float floorY = mi >= 0 ? (float)mons()[mi].groundY : 1e9f;
        for (int j = 0; j < n; ++j) {
          if ((j == 0 && sp.aPinned) || (j == n - 1 && sp.bPinned)) continue;
          RopePt& q = sp.p[j];
          float vx = (q.x - q.px) * 0.986f, vy = (q.y - q.py) * 0.986f;
          q.px = q.x; q.py = q.y;
          float sway = wx * s * 1.4f * (0.7f + 0.3f * std::sin(time * 1.9f + j * 0.35f));
          q.x += vx + sway * dt2;
          q.y += vy + (g + wy * s * 0.6f) * dt2;
          if (brush) {  // the mouse brushes the lights
            float dx = q.x - cx, dy = q.y - cy, R = 16 * s, d2 = dx * dx + dy * dy;
            if (d2 < R * R) { float k2 = 1 - std::sqrt(d2) / R; q.x += cvx * dt * 0.6f * k2; q.y += cvy * dt * 0.6f * k2; }
          }
          if (q.y > floorY) q.y = floorY;
        }
        if (sp.aPinned) sp.p[0] = {ax, ay, ax, ay};
        if (sp.bPinned) sp.p[n - 1] = {bx, by, bx, by};
        for (int it = 0; it < 10; ++it)
          for (int j = 0; j + 1 < n; ++j) {
            RopePt &a = sp.p[j], &b = sp.p[j + 1];
            bool pa = j == 0 && sp.aPinned, pb = j + 1 == n - 1 && sp.bPinned;
            if (pa && pb) continue;
            float dx = b.x - a.x, dy = b.y - a.y, d = std::sqrt(dx * dx + dy * dy) + 1e-4f;
            float diff = (d - sp.seg) / d;
            float ka = pa ? 0 : (pb ? 1 : 0.5f), kb = pb ? 0 : (pa ? 1 : 0.5f);
            a.x += dx * diff * ka; a.y += dy * diff * ka;
            b.x -= dx * diff * kb; b.y -= dy * diff * kb;
          }
      }
    }
  }

  // ------------------------------------------------------------------------------------- the editor
  int decoAt(float x, float y) const {
    for (int i = (int)decoSt.size() - 1; i >= 0; --i) {
      const DecoSt& d = decoSt[i];
      DecoGeom g = decoGeom(d.kind);
      float S = decoS(d.mon), gy = (float)mons()[d.mon].groundY, pad = 3 * mons()[d.mon].scale;
      if (x >= d.x - g.w * S / 2 - pad && x <= d.x + g.w * S / 2 + pad && y >= gy - g.h * S - pad && y <= gy + pad) return i;
    }
    return -1;
  }
  bool jointAt(float x, float y, int* si, int* ji) {
    float best = 1e30f, s = scaleAt(x, y), R = 9 * s;
    for (int i = 0; i < (int)layout_.lights.size(); ++i)
      for (int k = 0; k < (int)layout_.lights[i].joints.size(); ++k) {
        float jx, jy;
        int st;
        jointPos(layout_.lights[i].joints[k], &jx, &jy, &st);
        float d = (jx - x) * (jx - x) + (jy - y) * (jy - y);
        if (d < R * R && d < best) { best = d; *si = i; *ji = k; }
      }
    return best < 1e30f;
  }
  int stringAt(float x, float y) const {
    float s = scaleAt(x, y), R = 7 * s;
    for (int i = 0; i < (int)lightSim.size(); ++i)
      for (auto& sp : lightSim[i].spans) {
        if (sp.hidden) continue;
        for (auto& q : sp.p)
          if ((q.x - x) * (q.x - x) + (q.y - y) * (q.y - y) < R * R) return i;
      }
    return -1;
  }
  // A joint where the user clicked: on the app window under the pointer if there is one (snapping to its
  // edges and corners), otherwise on the screen.
  LightJoint attachJoint(float x, float y) const {
    LightJoint j;
    j.x = x; j.y = y;
    float s = scaleAt(x, y), snap = 8 * s;
    for (auto& w : zlist_) {
      if (w.kind != Kind::Window && w.kind != Kind::Occluder) continue;
      Rect r = w.r;
      bool in = x >= r.l - snap && x <= r.r + snap && y >= r.t - snap && y < r.b;
      if (!in) continue;
      if (w.kind != Kind::Window) break;  // something else is on top here: hang it on the screen
      j.window = w.id;
      j.fx = std::clamp((x - r.l) / std::max(1, r.w()), 0.f, 1.f);
      j.fy = std::clamp((y - r.t) / std::max(1, r.h()), 0.f, 1.f);
      if (std::fabs(y - r.t) < snap) j.fy = 0;
      if (std::fabs(x - r.l) < snap) j.fx = 0;
      if (std::fabs(x - r.r) < snap) j.fx = 1;
      j.x = r.l + j.fx * r.w();
      j.y = r.t + j.fy * r.h();
      break;
    }
    return j;
  }
  void updateHover() {
    ed.hover = kHoverNone;
    ed.hoverDeco = ed.hoverString = ed.hoverJoint = -1;
    if (ed.tool != kEditSelect) return;
    int si = -1, ji = -1;
    if (jointAt(ed.mx, ed.my, &si, &ji)) { ed.hover = kHoverJoint; ed.hoverString = si; ed.hoverJoint = ji; return; }
    int d = decoAt(ed.mx, ed.my);
    if (d >= 0) { ed.hover = kHoverDeco; ed.hoverDeco = d; return; }
    int st = stringAt(ed.mx, ed.my);
    if (st >= 0) { ed.hover = kHoverString; ed.hoverString = st; }
  }
  void moveDeco(int i, float x) {
    if (i < 0 || i >= (int)layout_.decos.size()) return;
    int mi = monitorAt(x, (float)(mons().empty() ? 0 : mons()[0].r.t + 1));
    for (int k = 0; k < (int)mons().size() && mi < 0; ++k) if (x >= mons()[k].r.l && x < mons()[k].r.r) mi = k;
    if (mi < 0) mi = layout_.decos[i].monitor;
    const Monitor& m = mons()[mi];
    layout_.decos[i].pos = std::clamp((x - m.r.l) / m.r.w(), 0.f, 1.f);
    if (mi != layout_.decos[i].monitor || i >= (int)decoSt.size()) { layout_.decos[i].monitor = mi; rebuildDecos(); return; }
    decoSt[i].x = m.r.l + layout_.decos[i].pos * m.r.w();
    if (Pile* p = pileById(decoSt[i].pile)) p->x0 = std::round(decoSt[i].x - p->width * 0.5f);
  }
  void finishBuilding() {
    if (!ed.building) return;
    ed.building = false;
    if (ed.sel >= 0 && ed.sel < (int)layout_.lights.size() && layout_.lights[ed.sel].joints.size() < 2) removeString(ed.sel);
  }
  void removeString(int i) {
    if (i < 0 || i >= (int)layout_.lights.size()) return;
    layout_.lights.erase(layout_.lights.begin() + i);
    if (i < (int)lightSim.size()) lightSim.erase(lightSim.begin() + i);
    ed.sel = -1; ed.selJoint = -1;
  }
  void removeJoint(int i, int k) {
    if (i < 0 || i >= (int)layout_.lights.size()) return;
    auto& J = layout_.lights[i].joints;
    if (k < 0 || k >= (int)J.size()) return;
    J.erase(J.begin() + k);
    if (J.size() < 2 && !(ed.building && ed.sel == i)) removeString(i);
    else rebuildString(i);
    ed.selJoint = -1;
  }
  void addString(std::vector<LightJoint> joints, float slack, int colors) {
    LightString L;
    L.joints = std::move(joints);
    L.slack = slack;
    L.colors = colors;
    layout_.lights.push_back(L);
    lightSim.resize(layout_.lights.size());
    rebuildString((int)layout_.lights.size() - 1);
  }
  void preset(int which) {
    if (mons().empty()) return;
    const Monitor& m = mons()[0];
    auto screen = [](float x, float y) { LightJoint j; j.x = x; j.y = y; return j; };
    float top = m.r.t + 1.f;
    switch (which) {
      case kPresetVillage:
        layout_.decos = villageLayout().decos;
        rebuildDecos();
        return;
      case kPresetGarland: {
        std::vector<LightJoint> J;
        for (int i = 0; i <= 5; ++i) J.push_back(screen(m.r.l + m.r.w() * i / 5.f, top));
        addString(J, 0.32f, ed.colors);
        return;
      }
      case kPresetCorners: {
        float w = (float)m.r.w();
        addString({screen(m.r.l + 1.f, top), screen(m.r.l + w * 0.11f, top), screen(m.r.l + w * 0.22f, top)}, 0.55f, ed.colors);
        addString({screen(m.r.r - w * 0.22f, top), screen(m.r.r - w * 0.11f, top), screen(m.r.r - 1.f, top)}, 0.55f, ed.colors);
        return;
      }
      case kPresetBetweenWindows: {
        std::vector<const Win*> ws;
        for (auto& w : zlist_) if (w.kind == Kind::Window && ws.size() < 6) ws.push_back(&w);
        std::sort(ws.begin(), ws.end(), [](const Win* a, const Win* b) { return a->r.l < b->r.l; });
        auto corner = [](const Win* w, float fx) { LightJoint j; j.window = w->id; j.fx = fx; j.fy = 0; j.x = w->r.l + fx * w->r.w(); j.y = (float)w->r.t; return j; };
        int made = 0;
        for (size_t i = 0; i + 1 < ws.size(); ++i)
          if (ws[i + 1]->r.l > ws[i]->r.l + 40) { addString({corner(ws[i], 1), corner(ws[i + 1], 0)}, 0.6f, ed.colors); ++made; }
        if (!made && !ws.empty()) addString({corner(ws[0], 0), corner(ws[0], 1)}, 0.18f, ed.colors);
        else if (!made) preset(kPresetGarland);
        return;
      }
    }
  }

  void editPointer(int ev, float x, float y) {
    if (!ed.on || mons().empty()) return;
    ed.mx = x; ed.my = y;
    switch (ev) {
      case kEditMove:
        if (ed.dragDeco >= 0) moveDeco(ed.dragDeco, x - ed.dragDX);
        else if (ed.dragJoint >= 0 && ed.dragString < (int)layout_.lights.size()) {
          LightJoint& j = layout_.lights[ed.dragString].joints[ed.dragJoint];
          j.window = 0; j.x = x; j.y = y;
          rebuildString(ed.dragString);
        }
        updateHover();
        break;
      case kEditDown:
        if (ed.tool == kEditDecoration) {
          int mi = monitorAt(x, y);
          if (mi < 0) mi = 0;
          const Monitor& m = mons()[mi];
          layout_.decos.push_back({ed.kind, mi, std::clamp((x - m.r.l) / m.r.w(), 0.f, 1.f)});
          rebuildDecos();
        } else if (ed.tool == kEditLights) {
          LightJoint j = attachJoint(x, y);
          if (!ed.building || ed.sel < 0 || ed.sel >= (int)layout_.lights.size()) {
            addString({j}, ed.slack, ed.colors);
            ed.sel = (int)layout_.lights.size() - 1;
            ed.building = true;
          } else {
            layout_.lights[ed.sel].joints.push_back(j);
            rebuildString(ed.sel);
          }
        } else {
          updateHover();
          ed.selJoint = -1;
          if (ed.hover == kHoverJoint) { ed.sel = ed.hoverString; ed.selJoint = ed.hoverJoint; ed.dragString = ed.hoverString; ed.dragJoint = ed.hoverJoint; }
          else if (ed.hover == kHoverDeco) { ed.dragDeco = ed.hoverDeco; ed.dragDX = x - decoSt[ed.hoverDeco].x; ed.sel = -1; }
          else if (ed.hover == kHoverString) ed.sel = ed.hoverString;
          else ed.sel = -1;
          if (ed.sel >= 0) { ed.slack = layout_.lights[ed.sel].slack; ed.colors = layout_.lights[ed.sel].colors; }
        }
        break;
      case kEditUp:
        if (ed.dragJoint >= 0 && ed.dragString < (int)layout_.lights.size()) {
          layout_.lights[ed.dragString].joints[ed.dragJoint] = attachJoint(x, y);
          rebuildString(ed.dragString);
        }
        ed.dragJoint = ed.dragString = ed.dragDeco = -1;
        updateHover();
        break;
      case kEditDouble:
        finishBuilding();
        break;
      case kEditRight:
        if (ed.building) finishBuilding();
        else if (ed.tool != kEditSelect) ed.tool = kEditSelect;
        else {
          updateHover();
          if (ed.hover == kHoverJoint) removeJoint(ed.hoverString, ed.hoverJoint);
          else if (ed.hover == kHoverDeco) { layout_.decos.erase(layout_.decos.begin() + ed.hoverDeco); rebuildDecos(); }
          else if (ed.hover == kHoverString) removeString(ed.hoverString);
          updateHover();
        }
        break;
      case kEditLeave:
        ed.mx = ed.my = -1e9f;
        ed.hover = kHoverNone;
        break;
    }
  }

  // ------------------------------------------------------------------------------------- spawning
  int targetFlakes(int mi) const {
    static const float base[4] = {80, 180, 340, 620};
    const Monitor& m = mons()[mi];
    float area = (float)m.r.w() * m.r.h() / (m.scale * m.scale) / (1920.f * 1080.f);
    return (int)(base[std::clamp(set().amount, 0, 3)] * area * (1 + 2.2f * storm));
  }

  void spawn(int mi) {
    const Monitor& m = mons()[mi];
    const float s = m.scale;
    Flake f{};
    f.depth = rng.f();
    float d = f.depth;
    switch (std::clamp(set().flakes, 0, 2)) {
      case 0: f.r = (0.7f + 1.2f * d) * s; break;
      case 1:
        f.r = (0.8f + 2.0f * d) * s;
        if (d > 0.72f && rng.f() < 0.45f) { f.crystal = 1; f.rbucket = (uint8_t)std::clamp((int)((d - 0.72f) / 0.28f * kBuckets), 0, kBuckets - 1); }
        break;
      default:
        f.r = (1.1f + 2.8f * d) * s;
        if (d > 0.55f && rng.f() < 0.6f) { f.crystal = 1; f.rbucket = (uint8_t)std::clamp((int)((d - 0.55f) / 0.45f * kBuckets), 0, kBuckets - 1); }
        break;
    }
    f.variant = (uint8_t)rng.i(kVariants);
    f.alpha = 0.5f + 0.48f * d;
    f.vy = (26 + 62 * d) * s * rng.r(0.85f, 1.15f) * (f.crystal ? 0.8f : 1.f);
    f.amp = rng.r(8, 30) * s;
    f.freq = rng.r(0.5f, 1.9f);
    f.phase = rng.r(0, 2 * PI);
    f.rot = rng.r(0, 2 * PI);
    f.rotV = rng.r(-0.8f, 0.8f);
    float rad = f.crystal ? kBucketR[f.rbucket] * s : f.r;
    f.x = m.r.l + rng.f() * m.r.w();
    f.y = m.r.t - rad - 2 - rng.f() * 30 * s;
    f.mon = (int16_t)mi;
    flakes.push_back(f);
  }

  // ------------------------------------------------------------------------------------- the mouse
  void mouse(float dt) {
    if (!set().mouse || !cValid) { cHad = false; return; }
    if (!cHad) { cpx = cx; cpy = cy; cvx = cvy = 0; cHad = true; return; }
    float ivx = (cx - cpx) / dt, ivy = (cy - cpy) / dt;
    cvx += (ivx - cvx) * 0.6f; cvy += (ivy - cvy) * 0.6f;
    float speed = std::sqrt(ivx * ivx + ivy * ivy);
    float s = scaleAt(cx, cy);
    // A fast flick through a pile knocks the snow off.
    if (speed > 1500 * s) {
      float len = std::sqrt((cx - cpx) * (cx - cpx) + (cy - cpy) * (cy - cpy));
      int steps = std::max(1, (int)(len / 3));
      for (auto& kv : piles) {
        Pile& p = *kv.second;
        if (!p.visible || p.width <= 0) continue;
        if (std::max(cx, cpx) < p.x0 || std::min(cx, cpx) > p.x0 + p.width) continue;
        if (std::max(cy, cpy) < p.base - p.maxH - 6 * s || std::min(cy, cpy) > p.base + 2) continue;
        for (int k = 0; k <= steps; ++k) {
          float x = cpx + (cx - cpx) * k / steps, y = cpy + (cy - cpy) * k / steps;
          int c = (int)(x - p.x0);
          if (c < 0 || c >= p.width) continue;
          if (y < p.surfaceY(c) - 3 * s || y > p.base + p.off(c) + 1) continue;
          if (p.hidden(x, y)) continue;
          int rad = (int)(5 * s);
          for (int i = std::max(0, c - rad); i < std::min(p.width, c + rad + 1); ++i) {
            float take = p.h[i] * 0.75f;
            if (take < 0.3f) continue;
            float yy = p.surfaceY(i);
            p.h[i] -= take;
            float cvol = 4.5f * s * s;
            for (float v = take; v > 0; v -= cvol)
              addClump(p.x0 + i, yy + rng.f() * take, ivx * 0.35f + rng.r(-60, 60) * s, ivy * 0.35f - rng.r(40, 200) * s, rng.r(0.9f, 1.6f) * s, kSnow);
          }
          p.active = 2;
        }
      }
    }
    // Snowballs roll when pushed; a fast flick knocks a snowman over or a present off.
    for (auto& o : objs) {
      if (o.dead || !o.pile) continue;
      Pile* p = pileById(o.pile);
      if (!p || !p->visible) continue;
      const float os = o.scale;
      if (o.kind == kPresent) {
        if (speed > 1500 * s && segNear(o.x, o.y - 5 * os, 9 * os)) toAir(o, ivx * 0.4f, std::min(ivy * 0.4f, 0.f) - 250 * os);
        continue;
      }
      float c[3];
      snowmanCentres(o.r, o.n, c);
      if (o.n == 1 && o.build < 0) {
        if (p->hidden(o.x, o.y - c[0])) continue;
        if (std::fabs(ivx) > 25 * os && segNear(o.x, o.y - c[0], o.r[0] + 3 * os) && (o.x - cpx) * ivx > 0) {
          float v = std::clamp(ivx * 0.85f, -750 * os, 750 * os);
          if (ivy < -900 * os) { toAir(o, v * 0.6f, ivy * 0.35f); continue; }  // flicked upwards: it flies
          if (std::fabs(v) > std::fabs(o.roll) || v * o.roll < 0) o.roll = v;
        }
      } else if (o.n >= 2 && speed > 1500 * s) {
        for (int i = 0; i < o.n; ++i)
          if (segNear(o.x, o.y - c[i], o.r[i] + 2 * os)) { breakStack(o, ivx * 0.4f, std::min(ivy * 0.3f, 0.f)); break; }
      }
    }
    cpx = cx; cpy = cy;
  }
  bool segNear(float px, float py, float r) const {
    float dx = cx - cpx, dy = cy - cpy, l2 = dx * dx + dy * dy;
    float t = l2 > 0 ? std::clamp(((px - cpx) * dx + (py - cpy) * dy) / l2, 0.f, 1.f) : 0.f;
    float qx = cpx + dx * t - px, qy = cpy + dy * t - py;
    return qx * qx + qy * qy < r * r;
  }

  // ------------------------------------------------------------------------------------- update
  void update(float dt) {
    if (mons().empty()) return;
    dt = std::clamp(dt, 0.f, 0.1f);
    time += dt;
    if (stormT > 0) stormT -= dt;
    storm += ((stormT > 0 ? 1.f : 0.f) - storm) * std::min(1.f, dt * 0.7f);
    if (storm < 0.001f) storm = 0;
    if (ms.size() != mons().size()) ms.resize(mons().size());

    mouse(dt);
    float wv, wy;
    windVec(wv, wy);
    const float fallK = 1 + 0.45f * storm;
    const bool stir = set().mouse && cValid && cHad;
    const float cspeed = std::sqrt(cvx * cvx + cvy * cvy);

    for (auto& m : ms) m.count = 0;
    for (size_t i = 0; i < flakes.size();) {
      Flake& f = flakes[i];
      const Monitor& m = mons()[f.mon];
      const float s = m.scale;
      f.phase += f.freq * dt;
      if (stir) {
        float dx = f.x - cx, dy = f.y - cy, R = 85 * s, d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          float d = std::sqrt(d2) + 0.01f, k = 1 - d / R;
          k *= k;
          if (cspeed > 40 * s) { float a = std::min(1.f, dt * 9 * k); f.ex += (cvx * 0.8f - f.ex) * a; f.ey += (cvy * 0.8f - f.ey) * a; }
          float rr = 30 * s;
          if (d < rr) { float push = 160 * s * (1 - d / rr) * dt * 8; f.ex += dx / d * push; f.ey += dy / d * push; }
        }
      }
      float decay = std::exp(-dt * 1.7f);
      f.ex *= decay; f.ey *= decay;
      float vx = wv * s * (0.4f + 0.8f * f.depth) + std::cos(f.phase) * f.amp * f.freq * 0.5f + f.ex;
      float vy = std::max(f.vy * fallK + wy * s * (0.4f + 0.6f * f.depth), 6 * s) + f.ey;
      float py = f.y;
      f.x += vx * dt; f.y += vy * dt; f.rot += f.rotV * dt;
      if (f.x < m.r.l || f.x >= m.r.r) {
        int nm = monitorAt(f.x, std::max(f.y, (float)m.r.t));
        if (nm >= 0 && mons()[nm].active) f.mon = (int16_t)nm;
        else f.x += (f.x < m.r.l ? 1 : -1) * m.r.w();
      }
      const Monitor& mm = mons()[f.mon];
      bool dead = false;
      if (f.depth > 0.45f && vy > 0) {
        int c;
        if (Pile* p = landing(f.x, py, f.y, &c)) {
          float r = f.crystal ? kBucketR[f.rbucket] * s * 0.55f : f.r;
          deposit(*p, c, PI * r * r * (p->kind == Kind::Taskbar ? 2.2f : 1.5f), r);
          dead = true;
        }
      }
      if (!dead && (f.y > mm.groundY + 2 || f.y < mm.r.t - 300 * s)) dead = true;
      if (dead) { f = flakes.back(); flakes.pop_back(); continue; }
      ms[f.mon].count++;
      ++i;
    }

    for (int mi = 0; mi < (int)mons().size(); ++mi) {
      if (!mons()[mi].active) continue;
      int target = targetFlakes(mi);
      MonState& st = ms[mi];
      st.spawnAcc += target * dt / 4.f;
      while (st.spawnAcc >= 1 && st.count < target) { spawn(mi); st.count++; st.spawnAcc -= 1; }
      if (st.spawnAcc > 3) st.spawnAcc = 3;
    }

    // clumps, glitter, drops, debris and smoke
    for (size_t i = 0; i < clumps.size();) {
      Clump& c = clumps[i];
      const Monitor& m = mons()[std::min<int>(c.mon, (int)mons().size() - 1)];
      const float s = m.scale;
      bool dead = false;
      c.life -= dt;
      float py = c.y;
      if (c.kind == kGlitter) {
        c.vx *= std::exp(-dt * 1.5f);
        c.vy += (30 * s - c.vy) * std::min(1.f, dt * 2);
        c.x += c.vx * dt; c.y += c.vy * dt;
        if (c.life <= 0) dead = true;
      } else if (c.kind == kSmoke) {
        c.vy *= std::exp(-dt * 0.8f);
        c.x += (c.vx + wv * s * 0.3f) * dt; c.y += c.vy * dt;
        if (c.life <= 0) dead = true;
      } else {
        c.vy += 980 * s * dt;
        c.vx *= std::exp(-dt * 0.6f);
        c.x += c.vx * dt + wv * s * 0.2f * dt; c.y += c.vy * dt;
        if (c.vy > 0) {
          int col;
          if (Pile* p = landing(c.x, py, c.y, &col)) {
            if (c.kind == kSnow) deposit(*p, col, PI * c.r * c.r * 0.8f, c.r);
            dead = true;
          }
        }
        if (c.life <= 0) dead = true;
      }
      if (!dead) {
        int nm = monitorAt(c.x, std::max(c.y, (float)m.r.t));
        if (nm >= 0) c.mon = (int16_t)nm;
        const Monitor& mm = mons()[c.mon];
        if (c.y > mm.groundY + 4 || c.x < mm.r.l - 50 || c.x > mm.r.r + 50 || c.y < mm.r.t - 1500) dead = true;
      }
      if (dead) { c = clumps.back(); clumps.pop_back(); continue; }
      ++i;
    }

    // piles: settle, icicles, melt very slowly, and now and then a snowball or a snowman
    meltAcc += dt;
    bool melt = meltAcc >= 1;
    for (auto& kv : piles) {
      Pile& p = *kv.second;
      p.sinceMove += dt;
      settle(p, dt);
      if (melt) {
        float m = 0.004f * p.scale * meltAcc;
        for (float& a : p.h) a = std::max(0.f, a - m);
      }
      p.check -= dt;
      if (p.check <= 0) { p.check = 1; autoSpawn(p); }
      if (p.kind == Kind::Window && p.visible && p.width > 0) {
        for (auto& ic : p.icicles) {
          int c = std::clamp((int)(ic.rel * p.width), 0, p.width - 1);
          bool thick = p.h[c] > 0.5f * p.maxH;
          if (set().icicles && thick) ic.len = std::min(ic.maxLen, ic.len + dt * 0.1f * p.scale);
          if (!thick && p.h[c] < 0.15f * p.maxH) ic.len = std::max(0.f, ic.len - dt * 0.3f * p.scale);
          if (ic.len > 3 * p.scale && set().icicles) {
            ic.drip -= dt;
            if (ic.drip <= 0) {
              ic.drip = rng.r(4, 14);
              float x = p.x0 + ic.rel * p.width;
              if (!p.hidden(x, p.base + ic.len)) addClump(x, p.base + p.off(c) + ic.len, 0, 10, 0.9f * p.scale, kDrop, pm(175, 215, 255, 0.85f), 8);
            }
          }
        }
      }
    }
    if (melt) meltAcc = 0;

    updateObjects(dt);
    updateSanta(dt);
    updatePlow(dt);
    simulateLights(dt);
  }

  uint32_t glitterColor() {
    switch (rng.i(4)) {
      case 0: return pm(255, 255, 255, 1);
      case 1: return pm(255, 236, 170, 1);
      case 2: return pm(255, 210, 110, 1);
      default: return pm(200, 230, 255, 1);
    }
  }

  // ------------------------------------------------------------------------------------- Santa
  void sendSanta() {
    if (santa.on || mons().empty()) return;
    int mi = 0;
    while (mi < (int)mons().size() && !mons()[mi].active) ++mi;
    if (mi >= (int)mons().size()) return;
    const Monitor& m = mons()[mi];
    int presents = 0;
    for (auto& o : objs) if (o.kind == kPresent) ++presents;
    santa = Santa{};
    santa.on = true;
    santa.mon = mi;
    santa.right = rng.f() < 0.5f;
    santa.S = m.scale * 1.35f;
    santa.y0 = m.r.t + m.r.h() * rng.r(0.08f, 0.2f);
    float half = 75 * santa.S;
    santa.x = santa.right ? m.r.l - half : m.r.r + half;
    santa.vx = (santa.right ? 1 : -1) * rng.r(230, 290) * m.scale;
    santa.dropped = !(set().presents && presents < kMaxPresents && rng.f() < 0.8f);
    santa.dropAt = m.r.l + m.r.w() * rng.r(0.25f, 0.75f);
  }

  void updateSanta(float dt) {
    if (!santa.on) return;
    if (santa.mon >= (int)mons().size() || !mons()[santa.mon].active) { santa.on = false; return; }
    const Monitor& m = mons()[santa.mon];
    const float S = santa.S, dir = santa.right ? 1.f : -1.f;
    santa.t += dt;
    santa.x += santa.vx * dt;
    float y = santaY();
    santa.glitter += dt * 45;
    while (santa.glitter >= 1) {
      santa.glitter -= 1;
      addClump(santa.x - dir * 66 * S + rng.r(-4, 4) * S, y + rng.r(-6, 14) * S, -dir * rng.r(10, 50) * S, rng.r(5, 40) * S, rng.r(0.5f, 1.2f) * S, kGlitter, glitterColor(), rng.r(1.f, 2.2f));
    }
    if (!santa.dropped && ((santa.right && santa.x >= santa.dropAt) || (!santa.right && santa.x <= santa.dropAt))) {
      santa.dropped = true;
      Obj g;
      g.kind = kPresent;
      g.x = santa.x - dir * 44 * S; g.y = y + 6 * S;
      g.vx = santa.vx * 0.3f; g.vy = -40 * m.scale;
      g.life = rng.r(180, 300);
      g.color = rng.i(5);
      g.scale = m.scale;
      g.fallFrom = g.y;
      objs.push_back(g);
    }
    float half = 80 * S;
    if ((santa.right && santa.x > m.r.r + half) || (!santa.right && santa.x < m.r.l - half)) santa.on = false;
  }
  float santaY() const { return santa.y0 + std::sin(santa.t * 1.7f) * 9 * santa.S + std::sin(santa.t * 0.6f + 1) * 6 * santa.S; }

  // ------------------------------------------------------------------------------------- drawing
  struct Painter {
    Target& t;
    int ox, oy;
    std::vector<Rect>& drawn;
    void mark(int l, int tp, int r, int b) {
      l = std::max(l, 0); tp = std::max(tp, 0); r = std::min(r, t.w); b = std::min(b, t.h);
      if (l < r && tp < b) drawn.push_back({l, tp, r, b});
    }
    // An anti-aliased round flake with a faint dark halo (so it still shows on white windows).
    void dot(float vx, float vy, float r, float a, uint32_t color = 0, float halo = 0.16f, const std::vector<Rect>* occ = nullptr) {
      float x = vx - ox, y = vy - oy;
      int x0 = (int)std::floor(x - r - 1.5f), x1 = (int)std::ceil(x + r + 1.5f);
      int y0 = (int)std::floor(y - r - 1.5f), y1 = (int)std::ceil(y + r + 1.5f);
      if (x1 <= 0 || y1 <= 0 || x0 >= t.w || y0 >= t.h) return;
      x0 = std::max(x0, 0); y0 = std::max(y0, 0); x1 = std::min(x1, t.w); y1 = std::min(y1, t.h);
      float hk = halo * a * std::min(1.f, r / 1.5f);
      for (int Y = y0; Y < y1; ++Y) {
        uint32_t* row = t.px + (size_t)Y * t.stride;
        float dy = Y + 0.5f - y;
        for (int X = x0; X < x1; ++X) {
          if (occ) { bool hid = false; for (auto& o : *occ) if (o.contains((float)(X + ox), (float)(Y + oy))) { hid = true; break; } if (hid) continue; }
          float dx = X + 0.5f - x, d = std::sqrt(dx * dx + dy * dy);
          float cov = std::clamp(r + 0.5f - d, 0.f, 1.f);
          float hcov = std::clamp(r + 1.3f - d, 0.f, 1.f) * hk;
          if (cov <= 0 && hcov <= 0) continue;
          if (hcov > 0) over(row + X, pm(25, 40, 70, hcov));
          if (cov > 0) over(row + X, color ? scaleA(color, (uint32_t)(cov * a * 256)) : pm(255, 255, 255, cov * a));
        }
      }
      mark(x0, y0, x1, y1);
    }
    static bool hiddenAt(const std::vector<Rect>* occ, float x, float y) {
      if (!occ) return false;
      for (auto& o : *occ) if (o.contains(x, y)) return true;
      return false;
    }
    // An anti-aliased line of width w (premultiplied colour c).
    void line(float ax, float ay, float bx, float by, float w, uint32_t c, const std::vector<Rect>* occ = nullptr) {
      float hw = w * 0.5f;
      int x0 = (int)std::floor(std::min(ax, bx) - hw - 1) - ox, x1 = (int)std::ceil(std::max(ax, bx) + hw + 1) - ox;
      int y0 = (int)std::floor(std::min(ay, by) - hw - 1) - oy, y1 = (int)std::ceil(std::max(ay, by) + hw + 1) - oy;
      x0 = std::max(x0, 0); y0 = std::max(y0, 0); x1 = std::min(x1, t.w); y1 = std::min(y1, t.h);
      if (x0 >= x1 || y0 >= y1) return;
      float dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      for (int Y = y0; Y < y1; ++Y)
        for (int X = x0; X < x1; ++X) {
          float px = X + 0.5f + ox, py = Y + 0.5f + oy;
          float tt = l2 > 0 ? std::clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0.f, 1.f) : 0.f;
          float qx = ax + dx * tt - px, qy = ay + dy * tt - py;
          float cov = std::clamp(hw + 0.5f - std::sqrt(qx * qx + qy * qy), 0.f, 1.f);
          if (cov <= 0 || hiddenAt(occ, px, py)) continue;
          over(t.px + (size_t)Y * t.stride + X, scaleA(c, (uint32_t)(cov * 256)));
        }
      mark(x0, y0, x1, y1);
    }
    // A thin anti-aliased line (about 1-1.6 px): points every half pixel, each spread over 4 pixels.
    void thinLine(float ax, float ay, float bx, float by, uint32_t c, const std::vector<Rect>* occ = nullptr) {
      float dx = bx - ax, dy = by - ay, len = std::sqrt(dx * dx + dy * dy);
      int n = std::max(1, (int)(len * 2));
      int minX = 1 << 30, minY = 1 << 30, maxX = -(1 << 30), maxY = -(1 << 30);
      for (int i = 0; i < n; ++i) {
        float px = ax + dx * (i + 0.5f) / n - ox - 0.5f, py = ay + dy * (i + 0.5f) / n - oy - 0.5f;
        int X = (int)std::floor(px), Y = (int)std::floor(py);
        if (X < 0 || Y < 0 || X + 1 >= t.w || Y + 1 >= t.h) continue;
        if (occ && hiddenAt(occ, px + ox, py + oy)) continue;
        float fx = px - X, fy = py - Y;
        const float k = 0.62f;  // two points per pixel of length
        uint32_t* row = t.px + (size_t)Y * t.stride + X;
        over(row, scaleA(c, (uint32_t)((1 - fx) * (1 - fy) * k * 256)));
        over(row + 1, scaleA(c, (uint32_t)(fx * (1 - fy) * k * 256)));
        over(row + t.stride, scaleA(c, (uint32_t)((1 - fx) * fy * k * 256)));
        over(row + t.stride + 1, scaleA(c, (uint32_t)(fx * fy * k * 256)));
        minX = std::min(minX, X); maxX = std::max(maxX, X + 2); minY = std::min(minY, Y); maxY = std::max(maxY, Y + 2);
      }
      if (minX <= maxX) mark(minX, minY, maxX, maxY);
    }
    // A soft round light: strongest in the middle, gone at radius R.
    void glow(float cx, float cy, float R, uint32_t rgb, float strength, const std::vector<Rect>* occ = nullptr) {
      int x0 = std::max(0, (int)std::floor(cx - R) - ox), x1 = std::min(t.w, (int)std::ceil(cx + R) - ox);
      int y0 = std::max(0, (int)std::floor(cy - R) - oy), y1 = std::min(t.h, (int)std::ceil(cy + R) - oy);
      if (x0 >= x1 || y0 >= y1 || strength <= 0) return;
      int r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255;
      float inv = 1.f / (R * R);
      for (int Y = y0; Y < y1; ++Y)
        for (int X = x0; X < x1; ++X) {
          float px = X + 0.5f + ox, py = Y + 0.5f + oy, d2 = ((px - cx) * (px - cx) + (py - cy) * (py - cy)) * inv;
          if (d2 >= 1 || hiddenAt(occ, px, py)) continue;
          float k = 1 - std::sqrt(d2);
          over(t.px + (size_t)Y * t.stride + X, pm(r, g, b, strength * k * k));
        }
      mark(x0, y0, x1, y1);
    }
    void rect(float l, float tp, float r, float b, uint32_t c) {
      int x0 = std::max(0, (int)std::lround(l) - ox), x1 = std::min(t.w, (int)std::lround(r) - ox);
      int y0 = std::max(0, (int)std::lround(tp) - oy), y1 = std::min(t.h, (int)std::lround(b) - oy);
      for (int Y = y0; Y < y1; ++Y)
        for (int X = x0; X < x1; ++X) over(t.px + (size_t)Y * t.stride + X, c);
      mark(x0, y0, x1, y1);
    }
    void outline(float l, float tp, float r, float b, float w, uint32_t c) {
      rect(l, tp, r, tp + w, c); rect(l, b - w, r, b, c); rect(l, tp + w, l + w, b - w, c); rect(r - w, tp + w, r, b - w, c);
    }
    // A sprite at (vx, vy) = its anchor. `occ` hides parts behind windows; `fromRow` reveals it bottom-up.
    void blit(const Sprite& s, float vx, float vy, float alpha = 1, const std::vector<Rect>* occ = nullptr, int fromRow = 0) {
      int X0 = (int)std::lround(vx) - s.ox - ox, Y0 = (int)std::lround(vy) - s.oy - oy;
      int x0 = std::max(0, -X0), y0 = std::max(fromRow, -Y0), x1 = std::min(s.w, t.w - X0), y1 = std::min(s.h, t.h - Y0);
      if (x0 >= x1 || y0 >= y1) return;
      uint32_t k = (uint32_t)(std::clamp(alpha, 0.f, 1.f) * 256);
      for (int y = y0; y < y1; ++y) {
        uint32_t* row = t.px + (size_t)(Y0 + y) * t.stride + X0;
        const uint32_t* src = s.px.data() + (size_t)y * s.w;
        for (int x = x0; x < x1; ++x) {
          uint32_t p = src[x];
          if (!(p >> 24)) continue;
          if (occ && !occ->empty()) {
            float gx = (float)(X0 + x + ox), gy = (float)(Y0 + y + oy);
            bool hid = false;
            for (auto& o : *occ) if (o.contains(gx, gy)) { hid = true; break; }
            if (hid) continue;
          }
          over(row + x, k >= 256 ? p : scaleA(p, k));
        }
      }
      mark(X0 + x0, Y0 + y0, X0 + x1, Y0 + y1);
    }
  };

  void clearRect(Target& t, const Rect& r) {
    for (int y = r.t; y < r.b; ++y) std::memset(t.px + (size_t)y * t.stride + r.l, 0, (size_t)(r.r - r.l) * 4);
  }

  void drawPile(Painter& P, const Pile& p, const Rect& mon) {
    if (!p.visible || p.width <= 0) return;
    if (p.x0 >= mon.r || p.x0 + p.width <= mon.l) return;
    if (p.base + 2.5f * p.maxH + 20 < mon.t || p.base - 2.5f * p.maxH - 4 > mon.b) return;
    const float s = p.scale;
    int c0 = std::max(0, mon.l - (int)p.x0), c1 = std::min(p.width, mon.r - (int)p.x0);
    int minX = 1 << 30, maxX = -(1 << 30), minY = 1 << 30, maxY = -(1 << 30);
    float hid[16];
    for (int c = c0; c < c1; ++c) {
      float hh = p.h[c];
      if (hh < 0.08f) continue;
      float gx = p.x0 + c;
      int nh = 0;
      for (auto& o : p.occ) if (gx >= o.l && gx < o.r && nh < 16) { hid[nh++] = (float)o.t; hid[nh++] = (float)o.b; }
      float bot = std::round(p.base + p.off(c));
      float top = bot - hh;
      int yTop = (int)std::floor(top);
      int X = (int)gx - P.ox;
      if (X < 0 || X >= P.t.w) continue;
      auto hidden = [&](int gy) { for (int k = 0; k < nh; k += 2) if (gy >= hid[k] && gy < hid[k + 1]) return true; return false; };
      for (int gy = yTop - 1; gy < (int)bot + 1; ++gy) {
        int Y = gy - P.oy;
        if (Y < 0 || Y >= P.t.h || hidden(gy)) continue;
        uint32_t* d = P.t.px + (size_t)Y * P.t.stride + X;
        if (gy == yTop - 1) { over(d, pm(110, 135, 170, 0.16f * std::min(1.f, hh / 2))); continue; }  // soft rim
        if (gy == (int)bot) { over(d, pm(10, 20, 40, 0.14f * std::min(1.f, hh / 3))); continue; }      // contact shadow
        float cov = gy == yTop ? (yTop + 1 - top) : 1.f;
        float depth = (gy + 0.5f - top) / std::max(1.f, hh);
        int r, g, b;
        if (gy + 0.5f - top < 1.4f * s) { r = 255; g = 255; b = 255; }
        else { float k = std::min(1.f, depth); r = (int)(250 - 34 * k); g = (int)(252 - 24 * k); b = (int)(255 - 8 * k); }
        over(d, pm(r, g, b, 0.97f * cov));
      }
      minX = std::min(minX, X); maxX = std::max(maxX, X);
      minY = std::min(minY, yTop - 1 - P.oy); maxY = std::max(maxY, (int)bot + 1 - P.oy);
    }
    if (minX <= maxX) P.mark(minX, minY, maxX + 1, maxY);
    // icicles hang over the window's top edge
    if (p.kind == Kind::Window) {
      for (auto& ic : p.icicles) {
        if (ic.len < 0.8f) continue;
        int c = std::clamp((int)(ic.rel * p.width), 0, p.width - 1);
        float cxv = p.x0 + ic.rel * p.width;
        float y0 = std::round(p.base + p.off(c));
        int L = (int)std::ceil(ic.len);
        int xa = (int)std::floor(cxv - ic.w), xb = (int)std::ceil(cxv + ic.w);
        for (int yy = 0; yy < L; ++yy) {
          float hw = ic.w * 0.5f * std::pow(1 - (yy + 0.5f) / ic.len, 1.2f);
          if (hw <= 0) break;
          int gy = (int)y0 + yy;
          int Y = gy - P.oy;
          if (Y < 0 || Y >= P.t.h) continue;
          for (int gx = xa; gx <= xb; ++gx) {
            int X = gx - P.ox;
            if (X < 0 || X >= P.t.w || p.hidden((float)gx, (float)gy)) continue;
            float dx = gx + 0.5f - cxv;
            float cov = std::clamp(hw + 0.5f - std::fabs(dx), 0.f, 1.f);
            if (cov <= 0) continue;
            bool hl = dx < -hw * 0.15f && dx > -hw * 0.9f;
            over(P.t.px + (size_t)Y * P.t.stride + X, hl ? pm(245, 252, 255, 0.85f * cov) : pm(190, 222, 250, 0.62f * cov));
          }
        }
        P.mark(xa - P.ox, (int)y0 - P.oy, xb + 1 - P.ox, (int)y0 + L - P.oy);
      }
    }
  }

  void drawObj(Painter& P, Obj& o, const Rect& mon, SpriteSet& sp) {
    const std::vector<Rect>* occ = nullptr;
    if (o.pile) {
      Pile* p = pileById(o.pile);
      if (!p || !p->visible) return;
      occ = &p->occ;
    }
    const float s = o.scale;
    if (o.kind == kPresent) {
      if (!mon.contains(o.x, o.y) && !mon.contains(o.x, o.y - 12 * s)) return;
      float fade = std::clamp((o.life - o.age) / 3.f, 0.f, 1.f);
      P.blit(sp.present[o.color % 5], o.x, o.y, fade, occ);
      return;
    }
    if (o.n <= 0) return;
    float c[3];
    snowmanCentres(o.r, o.n, c);
    float h = c[o.n - 1] + topR(o) * 2.6f;
    if (o.x + 40 * s < mon.l || o.x - 40 * s > mon.r || o.y < mon.t || o.y - h > mon.b) return;
    for (int i = 0; i < o.n; ++i)
      if (o.r[i] > 0.4f) P.blit(ballSprite(o.r[i]), o.x, o.y - c[i], 1, occ);
    if (o.n == 1 && o.build < 0 && o.r[0] > 2.5f * s) {  // a few specks show it rolling
      for (int k = 0; k < 3; ++k) {
        float a = o.spin + k * 2.094f;
        float px = o.x + std::cos(a) * o.r[0] * 0.55f, py = o.y - c[0] + std::sin(a) * o.r[0] * 0.55f;
        P.dot(px, py, std::max(0.5f, o.r[0] * 0.09f), 0.5f, pm(150, 172, 205, 1), 0, occ);
      }
    }
    if (decorated(o)) {
      int frame = o.waveT > 0 && ((int)(time * 5) & 1) ? 1 : 0;
      int key = o.n * 1000003 + (int)std::lround(o.r[0] * 2) * 9973 + (int)std::lround(o.r[1] * 2) * 131 + (int)std::lround(o.r[2] * 2) * 7 + o.hat * 3 + (o.right ? 1 : 0) + o.hatColor * 100;
      if (key != o.decorKey) {
        for (int f = 0; f < 2; ++f) o.decor[f] = makeSnowmanDecor(o.r, o.n, o.hat, o.hatColor, o.right, f);
        o.decorKey = key;
      }
      P.blit(o.decor[frame], o.x, o.y, 1, occ);
    }
  }

  const Sprite& decoSprite(SpriteSet& sp, int kind, int frame, float S) {
    auto& slot = sp.deco[kind][frame];
    if (slot.w == 0) slot = makeDecoration(kind, S, frame);
    return slot;
  }
  void drawDecos(Painter& P, int mi, SpriteSet& sp) {
    if (!set().decorations || decoSt.empty()) return;
    Pile* g = ground(mi);
    const std::vector<Rect>* occ = g ? &g->occ : nullptr;
    const Monitor& m = mons()[mi];
    const float S = decoS(mi);
    for (auto& d : decoSt) {
      if (d.mon != mi) continue;
      DecoGeom geo = decoGeom(d.kind);
      int frame = 0;
      if (d.kind == kDecoFir) frame = ((int)(time * 1.6f + d.x * 0.01f)) & 1;
      if (d.kind == kDecoLantern) frame = ((int)(time * 7 + d.x)) & 1;
      if (geo.glowR > 0) {
        float flick = d.kind == kDecoLantern ? 0.3f + 0.06f * std::sin(time * 13 + d.x) * std::sin(time * 7.3f) : 0.27f + 0.01f * std::sin(time * 50);
        P.blit(glowSprite(0xFFC878, geo.glowR * S), d.x, m.groundY - geo.glowY * S, flick, occ);
      }
      P.blit(decoSprite(sp, d.kind, frame, S), d.x, (float)m.groundY, 1, occ);
    }
  }
  void drawLights(Painter& P, const Rect& mon) {
    if (!set().lights || lightSim.size() != layout_.lights.size()) return;
    for (size_t i = 0; i < lightSim.size(); ++i) {
      const LightSim& sim = lightSim[i];
      const LightString& L = layout_.lights[i];
      const std::vector<Rect>* occ = sim.onTop ? nullptr : &sim.occ;
      bool sel = ed.on && (int)i == ed.sel;
      int bulb = 0;
      for (const Span& sp : sim.spans) {
        int n = (int)sp.p.size();
        if (sp.hidden || n < 2) { bulb += n / 2; continue; }
        float l = 1e9f, r = -1e9f, tp = 1e9f, b = -1e9f;
        for (auto& q : sp.p) { l = std::min(l, q.x); r = std::max(r, q.x); tp = std::min(tp, q.y); b = std::max(b, q.y); }
        if (r + 20 < mon.l || l - 20 > mon.r || b + 20 < mon.t || tp - 20 > mon.b) { bulb += n / 2; continue; }
        const float s = scaleAt(sp.p[0].x, sp.p[0].y);
        if (sel) for (int j = 0; j + 1 < n; ++j) P.line(sp.p[j].x, sp.p[j].y, sp.p[j + 1].x, sp.p[j + 1].y, 3.4f * s, pm(76, 141, 255, 0.55f));
        const uint32_t wire = pm(32, 44, 36, 0.9f);
        for (int j = 0; j + 1 < n; ++j) {
          if (s <= 1.5f) P.thinLine(sp.p[j].x, sp.p[j].y, sp.p[j + 1].x, sp.p[j + 1].y, wire, occ);
          else P.line(sp.p[j].x, sp.p[j].y, sp.p[j + 1].x, sp.p[j + 1].y, 1.1f * s, wire, occ);
        }
        for (int j = 1; j < n; j += 2) {
          uint32_t rgb = lightColor(L.colors, bulb);
          uint32_t h = (uint32_t)(i * 2654435761u) ^ (uint32_t)(bulb * 40503u);
          ++bulb;
          float tw = 0.72f + 0.28f * std::sin(time * (1.1f + (h % 7) * 0.2f) + (h % 97) * 0.37f);
          if (((h >> 3) + (uint32_t)(time * 2.5f)) % 41 == 0) tw *= 0.35f;  // now and then one blinks
          float x = sp.p[j].x, y = sp.p[j].y + 1.8f * s;
          if (Painter::hiddenAt(occ, x, y)) continue;
          P.blit(bulbSprite(rgb, s), x, y, 0.6f + 0.4f * tw);
        }
      }
    }
  }
  void drawEditor(Painter& P, int mi, SpriteSet& sp) {
    const Monitor& m = mons()[mi];
    const float s = m.scale;
    const uint32_t accent = pm(76, 141, 255, 1);
    // decorations: the one under the pointer gets a frame
    int hi = ed.dragDeco >= 0 ? ed.dragDeco : (ed.hover == kHoverDeco ? ed.hoverDeco : -1);
    if (hi >= 0 && hi < (int)decoSt.size() && decoSt[hi].mon == mi) {
      DecoGeom g = decoGeom(decoSt[hi].kind);
      float S = decoS(mi), pad = 4 * s;
      P.outline(decoSt[hi].x - g.w * S / 2 - pad, m.groundY - g.h * S - pad, decoSt[hi].x + g.w * S / 2 + pad, m.groundY + pad, 2 * s, accent);
    }
    // joints
    for (int i = 0; i < (int)layout_.lights.size(); ++i)
      for (int k = 0; k < (int)layout_.lights[i].joints.size(); ++k) {
        float x, y;
        int st;
        jointPos(layout_.lights[i].joints[k], &x, &y, &st);
        if (st == 2 || !m.r.contains(x, y)) continue;
        bool hot = (ed.hover == kHoverJoint && ed.hoverString == i && ed.hoverJoint == k) || (ed.sel == i && ed.selJoint == k);
        float r = (hot ? 5.5f : 4.2f) * s;
        P.dot(x, y, r + 1.4f * s, 1, i == ed.sel ? accent : pm(150, 160, 182, 1), 0.3f);
        P.dot(x, y, r, 1, pm(255, 255, 255, 1), 0);
        if (layout_.lights[i].joints[k].window) P.dot(x, y, 1.7f * s, 1, pm(60, 190, 120, 1), 0);  // hangs from a window
      }
    // while adding joints: where the lights will hang to the pointer
    if (ed.building && ed.sel >= 0 && ed.sel < (int)layout_.lights.size() && !layout_.lights[ed.sel].joints.empty() && ed.mx > -1e8f) {
      float ax, ay;
      int st;
      jointPos(layout_.lights[ed.sel].joints.back(), &ax, &ay, &st);
      float D = std::sqrt((ed.mx - ax) * (ed.mx - ax) + (ed.my - ay) * (ed.my - ay)), L = ropeLength(D, ed.slack);
      float sag = std::sqrt(std::max(0.f, 3 * D * (L - D) / 8));
      int n = std::max(2, (int)(L / (14 * s)));
      for (int i = 0; i <= n; ++i) {
        float tt = (float)i / n, x = ax + (ed.mx - ax) * tt, y = ay + (ed.my - ay) * tt + 4 * sag * tt * (1 - tt);
        uint32_t rgb = lightColor(ed.colors, i);
        P.dot(x, y, 1.8f * s, 0.6f, pm((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 1), 0);
      }
    }
    // placing a decoration: a ghost of it under the pointer
    if (ed.tool == kEditDecoration && ed.mx > -1e8f && monitorAt(ed.mx, ed.my) == mi)
      P.blit(decoSprite(sp, ed.kind, 0, decoS(mi)), ed.mx, (float)m.groundY, 0.55f);
  }

  Rect render(int mi, Target& t, bool fresh) {
    if (ms.size() != mons().size()) ms.resize(mons().size());
    if (mi < 0 || mi >= (int)mons().size()) return {};
    MonState& st = ms[mi];
    const Monitor& m = mons()[mi];
    Rect dirty;
    const Rect full{0, 0, t.w, t.h};
    if (fresh) st.drawn.clear();
    if (ed.on) {  // the screen is dimmed a little while decorating (and catches the mouse)
      const uint32_t dim = pm(8, 14, 30, 0.24f);
      for (int y = 0; y < t.h; ++y) std::fill(t.px + (size_t)y * t.stride, t.px + (size_t)y * t.stride + t.w, dim);
      st.drawn.clear();
      st.editDirty = true;
      dirty = full;
    } else if (st.editDirty) {
      for (int y = 0; y < t.h; ++y) std::memset(t.px + (size_t)y * t.stride, 0, (size_t)t.w * 4);
      st.drawn.clear();
      st.editDirty = false;
      dirty = full;
    }
    for (auto& r : st.drawn) { clearRect(t, r); dirty = unite(dirty, r); }
    st.drawn.clear();
    Painter P{t, m.r.l, m.r.t, st.drawn};
    const Rect mon = m.r;
    SpriteSet& sp = spritesFor(m.scale);

    for (auto& kv : piles) {  // windows first
      const Pile& p = *kv.second;
      if (p.kind == Kind::Window && !p.deco && set().pileWindows) drawPile(P, p, mon);
    }
    drawDecos(P, mi, sp);
    for (auto& kv : piles) {  // then the taskbar, and the snow on the decorations
      const Pile& p = *kv.second;
      if ((p.kind == Kind::Taskbar || p.deco) && set().pileTaskbar && p.mon == mi) drawPile(P, p, mon);
    }
    for (auto& o : objs) drawObj(P, o, mon, sp);
    drawLights(P, mon);
    if (plow.on && plow.mon == mi) {
      if (Pile* g = ground(mi)) {
        int frame = ((int)(plow.t * 10) & 1) | (((int)(plow.t * 3) & 1) << 1);
        P.blit(sp.plow[plow.right ? 1 : 0][frame], plow.x, g->base + std::sin(plow.t * 25) * 0.35f * m.scale, 1, &g->occ);
      }
    }
    // falling snow
    for (const Flake& f : flakes) {
      if (f.mon != mi) continue;
      if (f.crystal) {
        float a = std::fmod(f.rot, PI / 3);
        if (a < 0) a += PI / 3;
        int ai = (int)(a / (PI / 3) * kAngles) % kAngles;
        const Sprite& s = sp.crystals[((size_t)f.variant * kBuckets + f.rbucket) * kAngles + ai];
        P.blit(s, f.x, f.y, f.alpha);
      } else {
        P.dot(f.x, f.y, f.r, f.alpha);
      }
    }
    for (const Clump& c : clumps) {
      if (c.mon != mi) continue;
      switch (c.kind) {
        case kSnow: P.dot(c.x, c.y, c.r, 0.97f); break;
        case kIce: P.dot(c.x, c.y, c.r, 0.9f, pm(205, 232, 255, 1), 0.1f); break;
        case kDrop: P.dot(c.x, c.y, c.r, 0.85f, c.color, 0.08f); break;
        case kDebris: P.dot(c.x, c.y, c.r, 1, c.color, 0.f); break;
        case kSmoke: {
          float k = std::clamp(c.life / 1.6f, 0.f, 1.f);
          P.dot(c.x, c.y, c.r * (1 + (1 - k) * 1.8f), 0.32f * k, c.color, 0.f);
          break;
        }
        case kGlitter: {
          float tw = 0.55f + 0.45f * std::sin(time * 18 + c.x * 0.7f);
          P.dot(c.x, c.y, c.r, std::min(1.f, c.life) * tw, c.color, 0.f);
          break;
        }
      }
    }
    if (santa.on && santa.mon == mi) {
      int frame = (int)(santa.t * 9) & 3;
      P.blit(sp.santa[santa.right ? 1 : 0][frame], santa.x, santaY());
    }
    if (ed.on) drawEditor(P, mi, sp);
    for (auto& r : st.drawn) dirty = unite(dirty, r);
    return intersect(dirty, Rect{0, 0, t.w, t.h});
  }
};

// =========================================================================================== World
World::World() : d_(std::make_unique<Impl>(this)) {}
World::~World() = default;

void World::configure(const Settings& s) {
  bool windowsOff = set_.pileWindows && !s.pileWindows, taskbarOff = set_.pileTaskbar && !s.pileTaskbar;
  bool decorationsChanged = set_.decorations != s.decorations;
  set_ = s;
  if (windowsOff || taskbarOff)
    for (auto& kv : d_->piles) {
      Pile& p = *kv.second;
      if ((p.kind == Kind::Window && windowsOff) || (p.kind == Kind::Taskbar && taskbarOff)) std::fill(p.h.begin(), p.h.end(), 0.f);
    }
  auto& objs = d_->objs;
  objs.erase(std::remove_if(objs.begin(), objs.end(), [&](const Obj& o) { return (o.kind == kPresent && !s.presents) || (o.kind == kStack && !s.snowmen); }), objs.end());
  if (!s.snowplow) d_->plow.on = false;
  if (decorationsChanged) d_->rebuildDecos();
  d_->rebuildSurfaces();
}

void World::setMonitors(const std::vector<Monitor>& mons) {
  auto& D = *d_;
  std::vector<int> remap(mons_.size(), -1);
  for (size_t i = 0; i < mons_.size(); ++i)
    for (size_t j = 0; j < mons.size(); ++j)
      if (mons_[i].id == mons[j].id && mons_[i].r.l == mons[j].r.l && mons_[i].r.t == mons[j].r.t && mons_[i].r.w() == mons[j].r.w() &&
          mons_[i].r.h() == mons[j].r.h() && mons_[i].scale == mons[j].scale && mons[j].active)
        remap[i] = (int)j;
  for (size_t i = 0; i < D.flakes.size();) {
    int m = D.flakes[i].mon < (int)remap.size() ? remap[D.flakes[i].mon] : -1;
    if (m < 0) { D.flakes[i] = D.flakes.back(); D.flakes.pop_back(); continue; }
    D.flakes[i].mon = (int16_t)m;
    ++i;
  }
  for (size_t i = 0; i < D.clumps.size();) {
    int m = D.clumps[i].mon < (int)remap.size() ? remap[D.clumps[i].mon] : -1;
    if (m < 0) { D.clumps[i] = D.clumps.back(); D.clumps.pop_back(); continue; }
    D.clumps[i].mon = (int16_t)m;
    ++i;
  }
  // ground piles move with their monitor, and so does whatever sits on them
  std::vector<std::unique_ptr<Pile>> oldGround(mons_.size());
  std::vector<MonState> oldMs(mons_.size());
  for (size_t i = 0; i < mons_.size(); ++i) {
    auto it = D.piles.find(kGroundTag | i);
    if (it != D.piles.end()) { oldGround[i] = std::move(it->second); D.piles.erase(it); }
    if (i < D.ms.size()) oldMs[i] = D.ms[i];
  }
  std::unordered_map<uint64_t, uint64_t> groundMap;
  std::vector<MonState> nms(mons.size());
  for (size_t j = 0; j < mons.size(); ++j) {
    int from = -1;
    for (size_t i = 0; i < mons_.size(); ++i) if (mons_[i].id == mons[j].id) from = (int)i;
    std::unique_ptr<Pile> g = from >= 0 && oldGround[from] ? std::move(oldGround[from]) : std::make_unique<Pile>();
    if (from >= 0) groundMap[kGroundTag | (uint64_t)from] = kGroundTag | j;
    g->id = kGroundTag | j;
    g->kind = Kind::Taskbar;
    g->mon = (int)j;
    g->scale = mons[j].scale;
    g->maxH = 11.f * mons[j].scale;
    g->x0 = (float)mons[j].r.l;
    g->base = (float)mons[j].groundY;
    D.resample(*g, mons[j].r.w());
    D.piles[g->id] = std::move(g);
    if (from >= 0) { nms[j].plowCheck = oldMs[from].plowCheck; nms[j].plowCooldown = oldMs[from].plowCooldown; }
  }
  for (auto& o : D.objs) {
    if (!(o.pile & kGroundTag) || (o.pile & ~0xFFFFull) != kGroundTag) continue;
    auto it = groundMap.find(o.pile);
    if (it != groundMap.end()) o.pile = it->second;
    else o.dead = true;
  }
  D.objs.erase(std::remove_if(D.objs.begin(), D.objs.end(), [](const Obj& o) { return o.dead; }), D.objs.end());
  for (size_t i = 0; i < D.ms.size() && i < nms.size(); ++i) nms[i].editDirty = D.ms[i].editDirty;
  D.ms = std::move(nms);
  mons_ = mons;
  D.santa.on = false;
  D.plow.on = false;
  D.rebuildDecos();
}

void World::setWindows(const std::vector<Win>& z, const std::vector<uint64_t>& keep) {
  auto& D = *d_;
  D.zlist_ = z;
  D.keep_ = keep;
  D.winRect.clear();
  D.winZ.clear();
  for (size_t i = 0; i < z.size(); ++i) { D.winRect[z[i].id] = z[i].r; D.winZ[z[i].id] = (int)i; }
  for (auto& kv : D.piles) if (kv.second->kind == Kind::Window && !kv.second->deco) kv.second->seen = false;
  for (size_t i = 0; i < z.size(); ++i) {
    const Win& w = z[i];
    if (w.kind != Kind::Window) continue;
    auto& slot = D.piles[w.id];
    float sc = D.scaleAt((float)w.r.l + w.r.w() * 0.5f, (float)w.r.t + 1);
    if (!slot) {
      slot = std::make_unique<Pile>();
      Pile& p = *slot;
      p.id = w.id; p.kind = Kind::Window;
      p.x0 = (float)w.r.l; p.base = (float)w.r.t;
      p.scale = sc;
      p.maxH = 16.f * sc;
      D.resample(p, w.r.w());
      D.makeIcicles(p);
    }
    Pile& p = *slot;
    p.seen = true;
    p.visible = true;
    p.z = (int)i;
    p.corner = w.corner;
    float dx = w.r.l - p.x0, dy = w.r.t - p.base;
    if (dx != 0 || dy != 0) {
      float dt = std::max(p.sinceMove, 1.f / 120);
      float vx = dt < 0.25f ? dx / dt : 0, vy = dt < 0.25f ? dy / dt : 0;
      float speed = std::sqrt(vx * vx + vy * vy), pspeed = std::sqrt(p.vx * p.vx + p.vy * p.vy);
      const float s = p.scale;
      float frac = 0;
      if (speed > 1100 * s) frac = std::min(0.5f, (speed - 1100 * s) / (3000 * s));
      bool reversal = (vx * p.vx + vy * p.vy) < 0 && speed > 300 * s && pspeed > 300 * s;
      if (reversal) frac = std::max(frac, 0.35f);
      if (frac > 0.01f) D.shed(p, frac, vx * 0.5f, vy * 0.5f);
      p.vx = vx; p.vy = vy;
      p.x0 = (float)w.r.l; p.base = (float)w.r.t;
      p.sinceMove = 0;
    } else if (p.sinceMove > 0.25f) {
      p.vx = p.vy = 0;
    }
    if (w.r.w() != p.width) {
      int old = p.width;
      float k = old ? (float)w.r.w() / old : 1.f;
      D.resample(p, w.r.w());
      if (old) for (auto& ic : p.icicles) ic.len *= 0.5f;
      for (auto& o : D.objs) if (o.pile == p.id) o.rel *= k;  // things on top keep their place
      p.scale = sc; p.maxH = 16.f * sc;
    }
  }
  // windows that went away: closed, minimised or maximised windows drop their snow
  for (auto it = D.piles.begin(); it != D.piles.end();) {
    Pile& p = *it->second;
    if (p.kind != Kind::Window || p.deco || p.seen) { ++it; continue; }
    if (std::find(keep.begin(), keep.end(), p.id) != keep.end()) { p.visible = false; ++it; continue; }
    if (p.visible) D.shed(p, 1.f, 0, 60 * p.scale);
    for (auto& o : D.objs) if (o.pile == p.id) D.toAir(o, 0, 0);
    it = D.piles.erase(it);
  }
  // what is in front of each pile
  for (auto& kv : D.piles) {
    Pile& p = *kv.second;
    if (p.deco) continue;
    p.occ.clear();
    if (p.width <= 0) continue;
    int zi = p.z;
    if (p.kind == Kind::Taskbar) {
      zi = -1;
      uint64_t tb = p.mon < (int)mons_.size() ? mons_[p.mon].taskbar : 0;
      for (size_t i = 0; i < z.size(); ++i) if (tb && z[i].id == tb) zi = (int)i;
      p.z = zi < 0 ? -1 : zi;
      if (zi < 0) continue;  // no taskbar: the snow on the floor of the screen is in front of everything
    }
    // tall enough for snowmen standing on the pile
    Rect band{(int)p.x0, (int)(p.base - p.maxH - 90 * p.scale), (int)p.x0 + p.width, (int)(p.base + 18 * p.scale)};
    for (int i = 0; i < zi && i < (int)z.size(); ++i) {
      if (z[i].id == p.id) continue;
      Rect o = intersect(z[i].r, band);
      if (!o.empty()) p.occ.push_back(o);
    }
  }
  for (auto& kv : D.piles) {  // decorations are as far forward as the taskbar they stand on
    Pile& p = *kv.second;
    if (!p.deco) continue;
    if (Pile* g = D.ground(p.mon)) { p.occ = g->occ; p.z = g->z; }
  }
  if (D.lightSim.size() != D.layout_.lights.size()) D.rebuildLights();
  for (int i = 0; i < (int)D.lightSim.size(); ++i) D.lightOcc(i);
  D.rebuildSurfaces();
}

void World::setCursor(float x, float y, bool valid) { d_->cx = x; d_->cy = y; d_->cValid = valid; }
void World::update(float dt) { d_->update(dt); }
Rect World::render(int mi, Target& t, bool fresh) { return d_->render(mi, t, fresh); }
void World::sendSanta() { d_->sendSanta(); }
void World::sendPlow() { d_->sendPlow(); }
void World::snowstorm(float seconds) { d_->stormT = std::max(d_->stormT, seconds); }
bool World::santaFlying() const { return d_->santa.on; }

void World::dropSnowball(float x, float y, float radius) {
  auto& D = *d_;
  D.objs.push_back(D.newBall(x, y, radius, D.scaleAt(x, y)));
}

void World::shakeAll() {
  auto& D = *d_;
  for (auto& kv : D.piles) {
    Pile& p = *kv.second;
    D.shed(p, 1.f, D.rng.r(-120, 120) * p.scale, -D.rng.r(50, 200) * p.scale);
  }
  for (auto& o : D.objs) if (o.pile) D.toAir(o, D.rng.r(-150, 150) * o.scale, -D.rng.r(150, 350) * o.scale);
  for (auto& o : D.objs) o.fallFrom -= 400 * o.scale;  // snowmen thrown up like that fall apart when they land
}

void World::clearAll() {
  auto& D = *d_;
  for (auto& kv : D.piles) {
    std::fill(kv.second->h.begin(), kv.second->h.end(), 0.f);
    for (auto& ic : kv.second->icicles) ic.len = 0;
  }
  D.clumps.clear();
  D.objs.clear();
}

void World::setLayout(const Layout& l) {
  d_->layout_ = l;
  d_->ed.sel = -1;
  d_->ed.building = false;
  d_->rebuildDecos();
  d_->rebuildLights();
}
const Layout& World::layout() const { return d_->layout_; }

void World::editBegin() {
  auto& E = d_->ed;
  E.saved = d_->layout_;
  E.on = true;
  E.tool = kEditSelect;
  E.sel = E.selJoint = -1;
  E.building = false;
  E.dragDeco = E.dragJoint = E.dragString = -1;
}
void World::editEnd(bool keep) {
  auto& D = *d_;
  D.finishBuilding();
  if (!keep) { D.layout_ = D.ed.saved; D.rebuildDecos(); D.rebuildLights(); }
  float slack = D.ed.slack;
  int colors = D.ed.colors;
  D.ed = World::Impl::Editor{};
  D.ed.slack = slack;
  D.ed.colors = colors;
}
void World::editTool(int tool, int kind) {
  auto& D = *d_;
  D.finishBuilding();
  D.ed.tool = std::clamp(tool, 0, 2);
  D.ed.kind = std::clamp(kind, 0, kDecoCount - 1);
  if (tool != kEditSelect) D.ed.sel = -1;
  D.updateHover();
}
void World::editPointer(int ev, float x, float y) { d_->editPointer(ev, x, y); }
void World::editKey(int key) {
  auto& D = *d_;
  auto& E = D.ed;
  if (key == kEditEnter) D.finishBuilding();
  else if (key == kEditEscape) {
    if (E.building) D.finishBuilding();
    else if (E.tool != kEditSelect) E.tool = kEditSelect;
    else E.sel = E.selJoint = -1;
  } else if (key == kEditDelete && E.sel >= 0) {
    if (E.selJoint >= 0) D.removeJoint(E.sel, E.selJoint);
    else D.removeString(E.sel);
    E.building = false;
  }
}
void World::editSlack(float v) {
  auto& D = *d_;
  D.ed.slack = std::clamp(v, 0.f, 1.f);
  if (D.ed.sel >= 0 && D.ed.sel < (int)D.layout_.lights.size()) { D.layout_.lights[D.ed.sel].slack = D.ed.slack; D.rebuildString(D.ed.sel); }
}
void World::editColors(int c) {
  auto& D = *d_;
  D.ed.colors = std::clamp(c, 0, kLightColorCount - 1);
  if (D.ed.sel >= 0 && D.ed.sel < (int)D.layout_.lights.size()) D.layout_.lights[D.ed.sel].colors = D.ed.colors;
}
void World::editPreset(int p) { d_->finishBuilding(); d_->preset(p); }
void World::editClear() {
  auto& D = *d_;
  D.layout_ = Layout{};
  D.ed.sel = D.ed.selJoint = -1;
  D.ed.building = false;
  D.rebuildDecos();
  D.rebuildLights();
}
EditInfo World::editInfo() const {
  const auto& E = d_->ed;
  EditInfo i;
  i.on = E.on;
  i.tool = E.tool;
  i.decoKind = E.kind;
  i.building = E.building;
  i.selString = E.sel;
  i.slack = E.slack;
  i.colors = E.colors;
  i.hover = E.hover;
  i.dragging = E.dragDeco >= 0 || E.dragJoint >= 0;
  return i;
}

Stats World::stats() const {
  Stats s;
  s.flakes = (int)d_->flakes.size();
  s.clumps = (int)d_->clumps.size();
  s.piles = (int)d_->piles.size();
  s.objects = (int)d_->objs.size();
  for (auto& kv : d_->piles) s.pileVolume += kv.second->volume();
  return s;
}

}  // namespace snow
