// Snowfall engine. Coordinates are virtual-screen pixels (y down). Snow falls in front of everything and
// comes to rest on the top edges of app windows and on the taskbar. Each window's pile is a height per pixel
// column that settles like real snow, moves with the window, and falls off when the window is shaken,
// minimised or closed. Windows stacked in front hide the piles of windows behind them.
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

namespace {

constexpr float PI = 3.14159265358979f;
constexpr uint64_t kGroundTag = 0x5157000000000000ull;  // ground pile ids: tag | monitor index
constexpr int kMaxClumps = 3000;
constexpr int kMaxPresents = 6;

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

enum ClumpKind : uint8_t { kSnow, kGlitter, kDrop, kIce, kDebris };
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
  bool visible = true, seen = true;
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

struct Present {
  float x, y, vx, vy, age, life, rel;
  uint64_t pile;               // 0 while falling
  int color, mon;
};

struct Snowman {
  bool present = false;
  float rel = 0, build = 0, waveT = 0, nextWave = 15, cooldown = 25, check = 0;
};

struct Santa {
  bool on = false, right = true, dropped = true;
  int mon = 0;
  float x = 0, y0 = 0, t = 0, vx = 0, S = 1, dropAt = 0, glitter = 0;
};

struct SpriteSet {
  std::vector<Sprite> crystals;  // [variant][bucket][angle]
  Sprite santa[2][4], snowman[2], present[5];
};
constexpr int kVariants = 3, kBuckets = 4, kAngles = 8;
constexpr float kBucketR[kBuckets] = {3.2f, 4.3f, 5.4f, 6.6f};

struct MonState {
  std::vector<Rect> drawn;
  int count = 0;
  float spawnAcc = 0;
  Snowman sm;
};

}  // namespace

// =========================================================================================== Impl
struct World::Impl {
  World* w;
  Rng rng;
  float time = 0, storm = 0, stormT = 0, meltAcc = 0;
  float windSeed[4];
  std::vector<Flake> flakes;
  std::vector<Clump> clumps;
  std::vector<Present> presents;
  std::unordered_map<uint64_t, std::unique_ptr<Pile>> piles;
  std::vector<Pile*> surfaces;  // piles snow can land on, topmost window first
  std::vector<MonState> ms;
  std::map<int, std::unique_ptr<SpriteSet>> sprites;
  Santa santa;
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
      for (int f = 0; f < 4; ++f) { p->santa[1][f] = makeSanta(scale * 1.35f, f, true); p->santa[0][f] = makeSanta(scale * 1.35f, f, false); }
      p->snowman[0] = makeSnowman(scale, 0);
      p->snowman[1] = makeSnowman(scale, 1);
      for (int c = 0; c < 5; ++c) p->present[c] = makePresent(scale * 1.5f, c);
    }
    return *p;
  }

  // ------------------------------------------------------------------------------------- wind
  float wind() const {
    static const float base[3] = {0, 20, 64}, gust[3] = {7, 24, 70};
    int k = std::clamp(set().wind, 0, 2);
    float t = time;
    float wv = base[k] * (0.3f + 0.7f * std::sin(t * 0.013f + windSeed[0]));
    wv += gust[k] * (0.55f * std::sin(t * 0.17f + windSeed[1]) + 0.3f * std::sin(t * 0.41f + windSeed[2]) + 0.15f * std::sin(t * 1.1f + windSeed[3]));
    wv += storm * 70.f * (0.6f + 0.4f * std::sin(t * 0.23f));
    return wv;
  }

  // ------------------------------------------------------------------------------------- piles
  Pile* ground(int mi) {
    auto it = piles.find(kGroundTag | (uint64_t)mi);
    return it == piles.end() ? nullptr : it->second.get();
  }

  void rebuildSurfaces() {
    surfaces.clear();
    for (auto& kv : piles) {
      Pile* p = kv.second.get();
      if (!p->visible || p->width <= 0) continue;
      if (p->kind == Kind::Taskbar && !set().pileTaskbar) continue;
      if (p->kind == Kind::Window && !set().pileWindows) continue;
      if (p->kind == Kind::Taskbar && (p->mon >= (int)mons().size() || !mons()[p->mon].active)) continue;
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

  // Shake `frac` of the snow off a pile, flung with (vx, vy).
  void shed(Pile& p, float frac, float vx, float vy) {
    if (!p.visible || p.width <= 0) return;
    frac = std::clamp(frac, 0.f, 1.f);
    float total = p.volume() * frac;
    if (total < 0.5f) return;
    const float s = p.scale;
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
    if (frac > 0.3f) {
      for (auto& ic : p.icicles) {
        if (ic.len > 2) {
          float x = p.x0 + ic.rel * p.width;
          for (int k = 0; k < 3; ++k) addClump(x + rng.r(-1, 1), p.base + ic.len * (k + 0.5f) / 3, vx * 0.6f + rng.r(-30, 30) * s, vy * 0.5f + rng.r(-60, 0) * s, 1.1f * s, kIce);
        }
        ic.len = 0;
      }
      for (auto& g : presents) {
        if (g.pile != p.id) continue;
        g.pile = 0; g.vx = vx * 0.6f + rng.r(-40, 40) * s; g.vy = vy * 0.6f - rng.r(80, 200) * s;
      }
      if (p.kind == Kind::Taskbar) breakSnowman(p.mon);
    }
    p.active = 2;
  }

  void deposit(Pile& p, int c, float vol, float r) {
    if (c < 0 || c >= p.width) return;
    float fill = p.h[c] / p.maxH;
    float k = 1.f - fill * fill;
    if (k <= 0.02f) k = 0.02f;
    vol *= k;
    int rad = 1 + (int)std::ceil(r * 1.2f);
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
    const float s = 0.85f;  // steepest slope snow will hold, px per px
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
      // a little diffusion rounds the surface off, like real fresh snow
      if (pass == 0) {
        float prev = h[0];
        for (int i = 1; i < n - 1; ++i) {
          float cur = h[i];
          h[i] = cur + 0.07f * (prev + h[i + 1] - 2 * cur);
          prev = cur;
        }
      }
      if (p.kind == Kind::Window) {  // the ends of a window: snow slides off and drips
        const float e = 0.9f;
        if (h[0] > e) { float m = (h[0] - e) * 0.5f; h[0] -= m; p.lostL += m; }
        if (h[n - 1] > e) { float m = (h[n - 1] - e) * 0.5f; h[n - 1] -= m; p.lostR += m; }
      }
    }
    float cv = 3.2f * p.scale * p.scale;
    if (p.lostL > cv) { p.lostL -= cv; if (!p.hidden(p.x0, p.base)) addClump(p.x0 - 0.5f, p.base + p.corner * 0.6f, -rng.r(4, 26) * p.scale, rng.r(0, 20), 1.1f * p.scale, kSnow); }
    if (p.lostR > cv) { p.lostR -= cv; if (!p.hidden(p.x0 + p.width, p.base)) addClump(p.x0 + p.width + 0.5f, p.base + p.corner * 0.6f, rng.r(4, 26) * p.scale, rng.r(0, 20), 1.1f * p.scale, kSnow); }
  }

  // Where does something falling from (x, y0) to (x, y1) land? Picks the first exposed surface it crosses.
  Pile* landing(float x, float y0, float y1, int* col) {
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
    if (best && best->kind == Kind::Window) {
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

  // ------------------------------------------------------------------------------------- snowman
  void breakSnowman(int mi) {
    if (mi < 0 || mi >= (int)ms.size()) return;
    Snowman& sm = ms[mi].sm;
    Pile* g = ground(mi);
    if (!sm.present || !g) { sm.present = false; return; }
    const float s = g->scale;
    float x = g->x0 + sm.rel;
    int c = std::clamp((int)sm.rel, 0, g->width - 1);
    float by = g->surfaceY(c);
    for (int i = 0; i < 70; ++i) {
      float yy = by - rng.f() * 40 * s * sm.build;
      addClump(x + rng.r(-9, 9) * s, yy, rng.r(-160, 160) * s, rng.r(-320, -60) * s, rng.r(1.2f, 2.4f) * s, kSnow);
    }
    for (int i = 0; i < 8; ++i) addClump(x + rng.r(-4, 4) * s, by - 30 * s, rng.r(-140, 140) * s, rng.r(-300, -100) * s, 1.2f * s, kDebris, pm(25, 25, 30, 1));
    for (int i = 0; i < 3; ++i) addClump(x + rng.r(-4, 4) * s, by - 30 * s, rng.r(-140, 140) * s, rng.r(-300, -100) * s, 1.3f * s, kDebris, pm(245, 130, 30, 1));
    for (int i = 0; i < 5; ++i) addClump(x + rng.r(-4, 4) * s, by - 26 * s, rng.r(-140, 140) * s, rng.r(-300, -100) * s, 1.3f * s, kDebris, pm(205, 35, 40, 1));
    sm.present = false;
    sm.cooldown = 60;
  }

  void updateSnowman(int mi, float dt) {
    Snowman& sm = ms[mi].sm;
    Pile* g = ground(mi);
    if (!g || !set().snowman || !set().pileTaskbar) { sm.present = false; return; }
    if (!mons()[mi].active) return;
    sm.cooldown -= dt;
    if (!sm.present) {
      sm.check -= dt;
      if (sm.check > 0 || sm.cooldown > 0) return;
      sm.check = 2;
      // he is built at whichever end of the taskbar has more snow, once it is deep enough there
      int n = std::max(1, g->width / 5);
      float left = 0, right = 0;
      for (int i = 0; i < n; ++i) { left += g->h[i]; right += g->h[g->width - 1 - i]; }
      left /= n; right /= n;
      if (std::max(left, right) < 0.5f * g->maxH) return;
      sm.present = true;
      sm.build = 0;
      float f = left >= right ? rng.r(0.05f, 0.17f) : rng.r(0.83f, 0.95f);
      sm.rel = f * g->width;
      sm.nextWave = rng.r(8, 20);
      return;
    }
    sm.build = std::min(1.f, sm.build + dt / 2.5f);
    {
      int c = std::clamp((int)sm.rel, 0, g->width - 1);
      if (g->h[c] < 0.12f * g->maxH) { breakSnowman(mi); return; }  // the snow under him was swept away
    }
    // waves now and then, when Santa flies over, and when the mouse comes to say hello
    sm.nextWave -= dt;
    float x = g->x0 + sm.rel, y = g->base - 20 * g->scale;
    bool near = cValid && std::fabs(cx - x) < 40 * g->scale && std::fabs(cy - y) < 40 * g->scale;
    if (sm.nextWave <= 0 || near || (santa.on && santa.mon == mi)) { sm.waveT = std::max(sm.waveT, 1.6f); if (sm.nextWave <= 0) sm.nextWave = rng.r(12, 28); }
    sm.waveT = std::max(0.f, sm.waveT - dt);
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
      // presents get knocked off; the snowman falls apart
      for (auto& g : presents) {
        if (!g.pile) continue;
        float sc = scaleAt(g.x, g.y);
        if (segNear(g.x, g.y - 5 * sc, 9 * sc)) { g.pile = 0; g.vx = ivx * 0.4f; g.vy = std::min(ivy * 0.4f, 0.f) - 250 * sc; }
      }
      for (int mi = 0; mi < (int)ms.size(); ++mi) {
        Pile* g = ground(mi);
        if (!g || !ms[mi].sm.present) continue;
        if (segNear(g->x0 + ms[mi].sm.rel, g->base - 20 * g->scale, 16 * g->scale)) breakSnowman(mi);
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
    const float wv = wind();
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
      float vy = f.vy * fallK + f.ey;
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

    // clumps, glitter, drops and debris: thrown things with gravity
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
      } else {
        c.vy += 980 * s * dt;
        c.vx *= std::exp(-dt * 0.6f);
        c.x += c.vx * dt + wv * s * 0.2f * dt; c.y += c.vy * dt;
        if (c.vy > 0 && c.kind != kDrop && c.kind != kDebris) {
          int col;
          if (Pile* p = landing(c.x, py, c.y, &col)) {
            if (c.kind == kSnow) deposit(*p, col, PI * c.r * c.r * 0.8f, c.r);
            dead = true;
          }
        } else if (c.vy > 0) {
          int col;
          if (landing(c.x, py, c.y, &col)) dead = true;
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

    // piles: settle, icicles, melt very slowly
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
      if (p.kind == Kind::Window && p.visible) {
        for (auto& ic : p.icicles) {
          int c = std::clamp((int)(ic.rel * p.width), 0, std::max(0, p.width - 1));
          if (p.width == 0) continue;
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

    for (int mi = 0; mi < (int)ms.size(); ++mi) updateSnowman(mi, dt);
    updatePresents(dt);
    updateSanta(dt);
  }

  // ------------------------------------------------------------------------------------- presents
  void updatePresents(float dt) {
    for (size_t i = 0; i < presents.size();) {
      Present& g = presents[i];
      bool dead = false;
      g.age += dt;
      float s = scaleAt(g.x, g.y);
      if (g.pile) {
        auto it = piles.find(g.pile);
        if (it == piles.end() || !it->second->visible) { g.pile = 0; g.vx = 0; g.vy = 0; }
        else {
          Pile& p = *it->second;
          int c = std::clamp((int)g.rel, 0, std::max(0, p.width - 1));
          if (g.rel > p.width) g.rel = (float)c;
          g.x = p.x0 + g.rel;
          g.y = p.width ? p.surfaceY(c) + 1.5f * s : p.base;
        }
      } else {
        float py = g.y;
        g.vy += 900 * s * dt;
        g.x += g.vx * dt; g.y += g.vy * dt;
        g.vx *= std::exp(-dt * 0.5f);
        if (g.vy > 0) {
          int col;
          if (Pile* p = landing(g.x, py, g.y, &col)) { g.pile = p->id; g.rel = (float)col; g.vx = g.vy = 0; }
        }
        int m = monitorAt(g.x, g.y);
        if (m < 0 && monitorAt(g.x, g.y - 2000) < 0) dead = true;
        if (m >= 0 && g.y > mons()[m].groundY + 30) dead = true;
      }
      if (g.age > g.life) {  // vanishes in a puff of glitter
        for (int k = 0; k < 24; ++k) addClump(g.x + rng.r(-5, 5) * s, g.y - rng.r(0, 9) * s, rng.r(-60, 60) * s, rng.r(-90, 0) * s, rng.r(0.6f, 1.3f) * s, kGlitter, glitterColor(), rng.r(0.8f, 1.6f));
        dead = true;
      }
      if (dead) { g = presents.back(); presents.pop_back(); continue; }
      ++i;
    }
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
    santa = Santa{};
    santa.on = true;
    santa.mon = mi;
    santa.right = rng.f() < 0.5f;
    santa.S = m.scale * 1.35f;
    santa.y0 = m.r.t + m.r.h() * rng.r(0.08f, 0.2f);
    float half = 75 * santa.S;
    santa.x = santa.right ? m.r.l - half : m.r.r + half;
    santa.vx = (santa.right ? 1 : -1) * rng.r(230, 290) * m.scale;
    santa.dropped = !(set().presents && (int)presents.size() < kMaxPresents && rng.f() < 0.8f);
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
    // glitter trail from the back of the sleigh
    santa.glitter += dt * 45;
    while (santa.glitter >= 1) {
      santa.glitter -= 1;
      addClump(santa.x - dir * 66 * S + rng.r(-4, 4) * S, y + rng.r(-6, 14) * S, -dir * rng.r(10, 50) * S, rng.r(5, 40) * S, rng.r(0.5f, 1.2f) * S, kGlitter, glitterColor(), rng.r(1.f, 2.2f));
    }
    if (!santa.dropped && ((santa.right && santa.x >= santa.dropAt) || (!santa.right && santa.x <= santa.dropAt))) {
      santa.dropped = true;
      Present g{};
      g.x = santa.x - dir * 44 * S; g.y = y + 6 * S;
      g.vx = santa.vx * 0.3f; g.vy = -40 * m.scale;
      g.life = rng.r(180, 300);
      g.color = rng.i(5);
      g.mon = santa.mon;
      presents.push_back(g);
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
    void dot(float vx, float vy, float r, float a, uint32_t color = 0, float halo = 0.16f) {
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
    if (p.base + p.maxH + 20 < mon.t || p.base - p.maxH - 4 > mon.b) return;
    const float s = p.scale;
    int c0 = std::max(0, mon.l - (int)p.x0), c1 = std::min(p.width, mon.r - (int)p.x0);
    int minX = 1 << 30, maxX = -(1 << 30), minY = 1 << 30, maxY = -(1 << 30);
    float hid[16];
    for (int c = c0; c < c1; ++c) {
      float hh = p.h[c];
      if (hh < 0.08f) continue;
      float gx = p.x0 + c;
      // windows in front, at this column
      int nh = 0;
      for (auto& o : p.occ) if (gx >= o.l && gx < o.r && nh < 16) { hid[nh++] = (float)o.t; hid[nh++] = (float)o.b; }
      float bot = std::round(p.base + p.off(c));
      float top = bot - hh;
      int yTop = (int)std::floor(top);
      int X = (int)gx - P.ox;
      if (X < 0 || X >= P.t.w) continue;
      auto hidden = [&](int gy) { for (int k = 0; k < nh; k += 2) if (gy >= hid[k] && gy < hid[k + 1]) return true; return false; };
      // soft rim above the snow, so a white pile still has an edge on a white background
      for (int gy = yTop - 1; gy < (int)bot + 1; ++gy) {
        int Y = gy - P.oy;
        if (Y < 0 || Y >= P.t.h || hidden(gy)) continue;
        uint32_t* d = P.t.px + (size_t)Y * P.t.stride + X;
        if (gy == yTop - 1) { over(d, pm(110, 135, 170, 0.16f * std::min(1.f, hh / 2))); continue; }
        if (gy == (int)bot) { over(d, pm(10, 20, 40, 0.14f * std::min(1.f, hh / 3))); continue; }  // contact shadow
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

  Rect render(int mi, Target& t, bool fresh) {
    if (ms.size() != mons().size()) ms.resize(mons().size());
    if (mi < 0 || mi >= (int)mons().size()) return {};
    MonState& st = ms[mi];
    const Monitor& m = mons()[mi];
    Rect dirty;
    if (fresh) st.drawn.clear();
    for (auto& r : st.drawn) { clearRect(t, r); dirty = unite(dirty, r); }
    st.drawn.clear();
    Painter P{t, m.r.l, m.r.t, st.drawn};
    const Rect mon = m.r;
    SpriteSet& sp = spritesFor(m.scale);

    for (auto& kv : piles) {
      const Pile& p = *kv.second;
      if (p.kind == Kind::Window && !set().pileWindows) continue;
      if (p.kind == Kind::Taskbar && (!set().pileTaskbar || p.mon != mi)) continue;
      drawPile(P, p, mon);
    }
    // the snowman and presents sit in the snow
    if (Pile* g = ground(mi); g && st.sm.present && g->width) {
      int c = std::clamp((int)st.sm.rel, 0, g->width - 1);
      bool wave = st.sm.waveT > 0 && ((int)(time * 5) & 1);
      const Sprite& s = sp.snowman[wave ? 1 : 0];
      int fromRow = (int)((1 - st.sm.build) * s.h);
      P.blit(s, g->x0 + st.sm.rel, g->surfaceY(c) + 2 * g->scale, 1, &g->occ, fromRow);
    }
    for (auto& g : presents) {
      if (!mon.contains(g.x, g.y) && !mon.contains(g.x, g.y - 12)) continue;
      const std::vector<Rect>* occ = nullptr;
      if (g.pile) { auto it = piles.find(g.pile); if (it != piles.end()) occ = &it->second->occ; }
      float fade = std::clamp((g.life - g.age) / 3.f, 0.f, 1.f);
      P.blit(sp.present[g.color % 5], g.x, g.y, fade, occ);
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
    for (auto& r : st.drawn) dirty = unite(dirty, r);
    return intersect(dirty, Rect{0, 0, t.w, t.h});
  }
};

// =========================================================================================== World
World::World() : d_(std::make_unique<Impl>(this)) {}
World::~World() = default;

void World::configure(const Settings& s) {
  bool windowsOff = set_.pileWindows && !s.pileWindows, taskbarOff = set_.pileTaskbar && !s.pileTaskbar;
  set_ = s;
  if (windowsOff || taskbarOff)
    for (auto& kv : d_->piles) {
      Pile& p = *kv.second;
      if ((p.kind == Kind::Window && windowsOff) || (p.kind == Kind::Taskbar && taskbarOff)) std::fill(p.h.begin(), p.h.end(), 0.f);
    }
  if (!s.presents) d_->presents.clear();
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
  // ground piles move with their monitor; snowmen too
  std::vector<std::unique_ptr<Pile>> oldGround(mons_.size());
  std::vector<Snowman> oldSm(mons_.size());
  for (size_t i = 0; i < mons_.size(); ++i) {
    auto it = D.piles.find(kGroundTag | i);
    if (it != D.piles.end()) { oldGround[i] = std::move(it->second); D.piles.erase(it); }
    if (i < D.ms.size()) oldSm[i] = D.ms[i].sm;
  }
  std::vector<MonState> nms(mons.size());
  for (size_t j = 0; j < mons.size(); ++j) {
    int from = -1;
    for (size_t i = 0; i < mons_.size(); ++i) if (mons_[i].id == mons[j].id) from = (int)i;
    std::unique_ptr<Pile> g = from >= 0 && oldGround[from] ? std::move(oldGround[from]) : std::make_unique<Pile>();
    g->id = kGroundTag | j;
    g->kind = Kind::Taskbar;
    g->mon = (int)j;
    g->scale = mons[j].scale;
    g->maxH = 11.f * mons[j].scale;
    g->x0 = (float)mons[j].r.l;
    g->base = (float)mons[j].groundY;
    D.resample(*g, mons[j].r.w());
    D.piles[g->id] = std::move(g);
    if (from >= 0) nms[j].sm = oldSm[from];
  }
  D.ms = std::move(nms);
  mons_ = mons;
  if (D.santa.on) D.santa.on = false;
  D.rebuildSurfaces();
}

void World::setWindows(const std::vector<Win>& z, const std::vector<uint64_t>& keep) {
  auto& D = *d_;
  for (auto& kv : D.piles) if (kv.second->kind == Kind::Window) kv.second->seen = false;
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
      p.maxH = 15.f * sc;
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
      D.resample(p, w.r.w());
      if (old) for (auto& ic : p.icicles) ic.len *= 0.5f;
      p.scale = sc; p.maxH = 15.f * sc;
    }
  }
  // windows that went away: closed, minimised or maximised windows drop their snow
  for (auto it = D.piles.begin(); it != D.piles.end();) {
    Pile& p = *it->second;
    if (p.kind != Kind::Window || p.seen) { ++it; continue; }
    if (std::find(keep.begin(), keep.end(), p.id) != keep.end()) { p.visible = false; ++it; continue; }
    if (p.visible) D.shed(p, 1.f, 0, 60 * p.scale);
    for (auto& g : D.presents) if (g.pile == p.id) { g.pile = 0; g.vx = 0; g.vy = 0; }
    it = D.piles.erase(it);
  }
  // what is in front of each pile
  for (auto& kv : D.piles) {
    Pile& p = *kv.second;
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
    Rect band{(int)p.x0, (int)(p.base - p.maxH - 4), (int)p.x0 + p.width, (int)(p.base + 18 * p.scale)};
    for (int i = 0; i < zi && i < (int)z.size(); ++i) {
      if (z[i].id == p.id) continue;
      Rect o = intersect(z[i].r, band);
      if (!o.empty()) p.occ.push_back(o);
    }
  }
  D.rebuildSurfaces();
}

void World::setCursor(float x, float y, bool valid) { d_->cx = x; d_->cy = y; d_->cValid = valid; }
void World::update(float dt) { d_->update(dt); }
Rect World::render(int mi, Target& t, bool fresh) { return d_->render(mi, t, fresh); }
void World::sendSanta() { d_->sendSanta(); }
void World::snowstorm(float seconds) { d_->stormT = std::max(d_->stormT, seconds); }
bool World::santaFlying() const { return d_->santa.on; }

void World::shakeAll() {
  auto& D = *d_;
  for (auto& kv : D.piles) {
    Pile& p = *kv.second;
    D.shed(p, 1.f, D.rng.r(-120, 120) * p.scale, -D.rng.r(50, 200) * p.scale);
  }
  for (int mi = 0; mi < (int)D.ms.size(); ++mi) D.breakSnowman(mi);
}

void World::clearAll() {
  auto& D = *d_;
  for (auto& kv : D.piles) {
    std::fill(kv.second->h.begin(), kv.second->h.end(), 0.f);
    for (auto& ic : kv.second->icicles) ic.len = 0;
  }
  D.clumps.clear();
  D.presents.clear();
  for (auto& m : D.ms) { m.sm.present = false; m.sm.cooldown = 30; }
}

Stats World::stats() const {
  Stats s;
  s.flakes = (int)d_->flakes.size();
  s.clumps = (int)d_->clumps.size();
  s.piles = (int)d_->piles.size();
  s.objects = (int)d_->presents.size();
  for (auto& kv : d_->piles) s.pileVolume += kv.second->volume();
  return s;
}

}  // namespace snow
