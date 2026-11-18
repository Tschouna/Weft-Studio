// The little pictures: snow crystals, the snowman, Santa's sleigh, presents and the app icon. They are drawn
// once per screen scale with a tiny supersampling rasterizer, so no image files ship with the app.
#include "engine.h"
#include <cmath>
#include <algorithm>

namespace snow {
namespace {

struct Col { float r, g, b, a; };
constexpr float PI = 3.14159265358979f;

// A supersampled canvas in "logical" units: x0..x0+w, y0..y0+h, drawn at `scale` pixels per unit.
class Canvas {
 public:
  Canvas(float x0, float y0, float w, float h, float scale, int ss = 4)
      : x0_(x0), y0_(y0), s_(scale), ss_(ss) {
    W_ = std::max(1, (int)std::ceil(w * scale));
    H_ = std::max(1, (int)std::ceil(h * scale));
    buf_.assign((size_t)W_ * ss_ * H_ * ss_ * 4, 0.f);
  }

  template <class Inside>
  void fill(float bx0, float by0, float bx1, float by1, Col c, Inside inside) {
    const float k = s_ * ss_;
    int X0 = std::max(0, (int)std::floor((bx0 - x0_) * k)), X1 = std::min(W_ * ss_, (int)std::ceil((bx1 - x0_) * k) + 1);
    int Y0 = std::max(0, (int)std::floor((by0 - y0_) * k)), Y1 = std::min(H_ * ss_, (int)std::ceil((by1 - y0_) * k) + 1);
    const float pr = c.r * c.a, pg = c.g * c.a, pb = c.b * c.a, ia = 1.f - c.a;
    for (int Y = Y0; Y < Y1; ++Y) {
      float y = y0_ + (Y + 0.5f) / k;
      float* row = &buf_[((size_t)Y * W_ * ss_) * 4];
      for (int X = X0; X < X1; ++X) {
        float x = x0_ + (X + 0.5f) / k;
        if (!inside(x, y)) continue;
        float* p = row + (size_t)X * 4;
        p[0] = pr + p[0] * ia; p[1] = pg + p[1] * ia; p[2] = pb + p[2] * ia; p[3] = c.a + p[3] * ia;
      }
    }
  }

  void circle(float cx, float cy, float r, Col c) {
    fill(cx - r, cy - r, cx + r, cy + r, c, [=](float x, float y) { return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r; });
  }
  void ellipse(float cx, float cy, float rx, float ry, Col c, float ang = 0) {
    float ca = std::cos(ang), sa = std::sin(ang), m = std::max(rx, ry);
    fill(cx - m, cy - m, cx + m, cy + m, c, [=](float x, float y) {
      float dx = x - cx, dy = y - cy, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
      return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1.f;
    });
  }
  void rect(float l, float t, float r, float b, Col c) {
    fill(l, t, r, b, c, [=](float x, float y) { return x >= l && x <= r && y >= t && y <= b; });
  }
  // A line with round ends.
  void line(float ax, float ay, float bx, float by, float width, Col c) {
    float hw = width * 0.5f, dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    fill(std::min(ax, bx) - hw, std::min(ay, by) - hw, std::max(ax, bx) + hw, std::max(ay, by) + hw, c, [=](float x, float y) {
      float t = len2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0.f;
      t = std::clamp(t, 0.f, 1.f);
      float px = ax + dx * t - x, py = ay + dy * t - y;
      return px * px + py * py <= hw * hw;
    });
  }
  void poly(std::vector<std::pair<float, float>> pts, Col c) {
    float l = 1e9f, t = 1e9f, r = -1e9f, b = -1e9f;
    for (auto& p : pts) { l = std::min(l, p.first); r = std::max(r, p.first); t = std::min(t, p.second); b = std::max(b, p.second); }
    fill(l, t, r, b, c, [&pts](float x, float y) {
      bool in = false;
      for (size_t i = 0, j = pts.size() - 1; i < pts.size(); j = i++) {
        float xi = pts[i].first, yi = pts[i].second, xj = pts[j].first, yj = pts[j].second;
        if ((yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) in = !in;
      }
      return in;
    });
  }

  // Box-filters the supersamples down to premultiplied BGRA pixels.
  Sprite finish(float anchorX, float anchorY, bool mirror = false) const {
    Sprite s;
    s.w = W_; s.h = H_;
    s.ox = (int)std::lround((anchorX - x0_) * s_);
    s.oy = (int)std::lround((anchorY - y0_) * s_);
    if (mirror) s.ox = W_ - 1 - s.ox;
    s.px.assign((size_t)W_ * H_, 0);
    const float n = 1.f / (ss_ * ss_);
    for (int y = 0; y < H_; ++y)
      for (int x = 0; x < W_; ++x) {
        float a[4] = {0, 0, 0, 0};
        for (int j = 0; j < ss_; ++j)
          for (int i = 0; i < ss_; ++i) {
            const float* p = &buf_[(((size_t)(y * ss_ + j)) * W_ * ss_ + (x * ss_ + i)) * 4];
            a[0] += p[0]; a[1] += p[1]; a[2] += p[2]; a[3] += p[3];
          }
        auto q = [&](float v) { return (uint32_t)std::clamp((int)std::lround(v * n * 255.f), 0, 255); };
        uint32_t A = q(a[3]), R = std::min(q(a[0]), A), G = std::min(q(a[1]), A), B = std::min(q(a[2]), A);
        int dx = mirror ? W_ - 1 - x : x;
        s.px[(size_t)y * W_ + dx] = (A << 24) | (R << 16) | (G << 8) | B;
      }
    return s;
  }

 private:
  float x0_, y0_, s_;
  int ss_, W_, H_;
  std::vector<float> buf_;
};

const Col kWhite{1, 1, 1, 1};

// Six arms with side branches, in one of three styles.
void drawCrystal(Canvas& c, float cx, float cy, float R, float ang, int variant, Col col, float grow) {
  float w = std::max(0.55f, R * 0.16f) + grow;
  for (int k = 0; k < 6; ++k) {
    float a = ang + k * PI / 3, ca = std::cos(a), sa = std::sin(a);
    float ex = cx + ca * R, ey = cy + sa * R;
    c.line(cx, cy, ex, ey, w, col);
    if (variant == 0) {           // fern branches
      for (float f : {0.5f, 0.78f}) {
        float bx = cx + ca * R * f, by = cy + sa * R * f, L = R * (f < 0.6f ? 0.34f : 0.22f);
        for (float s : {-1.f, 1.f}) {
          float b = a + s * PI / 3;
          c.line(bx, by, bx + std::cos(b) * L, by + std::sin(b) * L, w * 0.85f, col);
        }
      }
    } else if (variant == 1) {    // plate tips
      c.circle(ex, ey, R * 0.13f + grow * 0.5f, col);
      float bx = cx + ca * R * 0.55f, by = cy + sa * R * 0.55f, L = R * 0.25f;
      for (float s : {-1.f, 1.f}) { float b = a + s * PI / 2.6f; c.line(bx, by, bx + std::cos(b) * L, by + std::sin(b) * L, w * 0.8f, col); }
    } else {                      // simple star with a hexagon heart
      float bx = cx + ca * R * 0.7f, by = cy + sa * R * 0.7f, L = R * 0.28f;
      for (float s : {-1.f, 1.f}) { float b = a + s * PI / 4; c.line(bx, by, bx + std::cos(b) * L, by + std::sin(b) * L, w * 0.8f, col); }
    }
  }
  std::vector<std::pair<float, float>> hex;
  for (int k = 0; k < 6; ++k) { float a = ang + k * PI / 3 + PI / 6; hex.push_back({cx + std::cos(a) * R * 0.2f, cy + std::sin(a) * R * 0.2f}); }
  c.poly(hex, col);
}

}  // namespace

Sprite makeCrystal(float R, float ang, int variant) {
  float pad = 2.f;
  Canvas c(-R - pad, -R - pad, 2 * R + 2 * pad, 2 * R + 2 * pad, 1.f, 4);
  drawCrystal(c, 0, 0, R, ang, variant, Col{0.12f, 0.2f, 0.35f, 0.22f}, 1.1f);  // soft dark halo: visible on white too
  drawCrystal(c, 0, 0, R, ang, variant, Col{0.97f, 0.985f, 1.f, 0.96f}, 0.f);
  return c.finish(0, 0);
}

// ------------------------------------------------------------------------------------------- snowballs and snowmen
// A shaded snowball of radius r pixels, anchored at its centre.
Sprite makeBall(float r) {
  float pad = 2.f;
  Canvas c(-r - pad, -r - pad, 2 * (r + pad), 2 * (r + pad), 1.f, 4);
  c.circle(0, 0, r + 0.75f, Col{0.4f, 0.48f, 0.62f, 0.85f});            // edge, so it shows on white
  c.circle(0, 0, r, Col{0.8f, 0.86f, 0.96f, 1});                          // shadow side
  c.circle(-r * 0.16f, -r * 0.18f, r * 0.8f, Col{0.95f, 0.97f, 1.f, 1});
  c.circle(-r * 0.3f, -r * 0.34f, r * 0.42f, kWhite);                    // highlight
  return c.finish(0, 0);
}

// Everything on a snowman except the balls: face, hat, scarf, buttons, stick arms. r[0] is the bottom ball;
// the sprite's anchor is where the bottom ball sits on the snow, so it lines up with snowmanCentres().
// hat: 0 Santa hat, 1 top hat, 2 bobble hat. frame 1 waves.
Sprite makeSnowmanDecor(const float r[3], int n, int hat, int hatColor, bool facingRight, int frame) {
  float c[3];
  snowmanCentres(r, n, c);
  const int t = n - 1;
  const float rt = r[t], ct = -c[t];                 // top ball: radius and centre (y down)
  const int bi = n >= 3 ? 1 : 0;                     // ball the arms and buttons go on
  const float rb = r[bi], cb = -c[bi];
  const float f = facingRight ? 1.f : -1.f;
  float W = std::max(r[0], rb * 2.3f) + 4, top = ct - rt * 2.2f - 3;
  Canvas cv(-W, top, 2 * W, -top + 3, 1.f, 4);
  const Col coal{0.1f, 0.1f, 0.12f, 1}, stick{0.42f, 0.27f, 0.13f, 1}, carrot{0.98f, 0.5f, 0.1f, 1};
  const Col red{0.82f, 0.13f, 0.14f, 1}, redD{0.62f, 0.07f, 0.08f, 1}, white{0.98f, 0.98f, 0.98f, 1};
  static const Col hatCols[] = {{0.82f, 0.13f, 0.14f, 1}, {0.15f, 0.55f, 0.3f, 1}, {0.2f, 0.42f, 0.85f, 1}, {0.55f, 0.3f, 0.75f, 1}};
  // stick arms
  float aw = std::max(0.9f, rb * 0.13f);
  for (float sd : {-1.f, 1.f}) {
    float sx = sd * rb * 0.8f, sy = cb - rb * 0.15f;
    bool wave = frame == 1 && sd == f;
    float ex = sd * rb * (wave ? 1.65f : 2.05f), ey = cb - rb * (wave ? 1.75f : 0.85f);
    cv.line(sx, sy, ex, ey, aw, stick);
    float mx = sx + (ex - sx) * 0.7f, my = sy + (ey - sy) * 0.7f;
    cv.line(mx, my, mx + sd * rb * 0.25f, my - rb * 0.42f, aw * 0.8f, stick);
  }
  // buttons
  if (n >= 3)
    for (float k : {-0.38f, 0.02f, 0.42f}) cv.circle(f * rb * 0.08f, cb + rb * k, std::max(0.6f, rb * 0.1f), coal);
  // scarf at the neck
  {
    float ny = ct + rt * 0.9f;
    cv.ellipse(0, ny, rt * 1.08f, std::max(1.f, rt * 0.3f), red);
    float tx = -f * rt * 0.45f;
    cv.poly({{tx - rt * 0.22f, ny}, {tx + rt * 0.26f, ny}, {tx + rt * 0.34f - f * rt * 0.12f, ny + rt * 1.1f}, {tx - rt * 0.16f - f * rt * 0.12f, ny + rt * 1.12f}}, red);
    cv.line(tx - rt * 0.18f - f * rt * 0.1f, ny + rt * 0.9f, tx + rt * 0.3f - f * rt * 0.1f, ny + rt * 0.88f, std::max(0.5f, rt * 0.1f), Col{1, 1, 1, 0.8f});
  }
  // face, turned a little towards where he looks
  float ex0 = f * rt * 0.14f;
  cv.circle(ex0 - rt * 0.3f, ct - rt * 0.16f, std::max(0.55f, rt * 0.12f), coal);
  cv.circle(ex0 + rt * 0.3f, ct - rt * 0.16f, std::max(0.55f, rt * 0.12f), coal);
  cv.poly({{f * rt * 0.12f, ct + rt * 0.02f}, {f * rt * 0.12f, ct + rt * 0.26f}, {f * rt * 1.05f, ct + rt * 0.16f}}, carrot);
  for (int i = 0; i < 5; ++i) {
    float a = PI * (0.22f + 0.14f * i);
    cv.circle(ex0 + std::cos(a) * rt * 0.42f, ct + rt * 0.2f + std::sin(a) * rt * 0.3f, std::max(0.4f, rt * 0.07f), coal);
  }
  // hat
  if (hat == 0) {  // Santa hat: a tall cone leaning back, its tip flopping down behind
    float by = ct - rt * 0.6f, ax = -f * rt * 0.15f, ay = by - rt * 1.3f;
    cv.poly({{-rt * 0.9f, by}, {rt * 0.9f, by}, {ax, ay}}, red);
    cv.poly({{rt * 0.2f, by}, {rt * 0.9f, by}, {ax, ay}}, redD);
    cv.line(ax, ay + rt * 0.05f, -f * rt * 0.95f, by - rt * 0.72f, rt * 0.4f, red);
    cv.circle(-f * rt * 1.0f, by - rt * 0.66f, rt * 0.3f, white);
    cv.line(-rt * 0.95f, by, rt * 0.95f, by, rt * 0.46f, white);
  } else if (hat == 1) {  // top hat
    cv.rect(-rt * 1.0f, ct - rt * 0.8f, rt * 1.0f, ct - rt * 0.6f, coal);
    cv.rect(-rt * 0.64f, ct - rt * 1.85f, rt * 0.64f, ct - rt * 0.7f, coal);
    cv.rect(-rt * 0.64f, ct - rt * 1.0f, rt * 0.64f, ct - rt * 0.8f, red);
  } else {  // bobble hat
    Col hc = hatCols[hatColor % 4];
    std::vector<std::pair<float, float>> dome;
    for (int i = 0; i <= 12; ++i) { float a = PI + PI * i / 12; dome.push_back({std::cos(a) * rt * 0.9f, ct - rt * 0.55f + std::sin(a) * rt * 0.85f}); }
    cv.poly(dome, hc);
    cv.rect(-rt * 0.95f, ct - rt * 0.72f, rt * 0.95f, ct - rt * 0.45f, white);
    cv.circle(0, ct - rt * 1.45f, rt * 0.3f, white);
  }
  return cv.finish(0, 0);
}

// The little snowplow: yellow, with tracks, a flashing light and a blade. Anchor: bottom centre of the tracks.
Sprite makeSnowplow(float scale, int frame, bool facingRight) {
  Canvas c(-24, -36, 52, 38, scale, 4);
  const Col track{0.16f, 0.16f, 0.18f, 1}, trackIn{0.3f, 0.3f, 0.34f, 1}, wheel{0.64f, 0.65f, 0.69f, 1};
  const Col yellow{0.98f, 0.77f, 0.13f, 1}, yellowD{0.85f, 0.6f, 0.06f, 1}, glass{0.62f, 0.83f, 0.96f, 1}, dark{0.2f, 0.2f, 0.22f, 1};
  const Col steel{0.74f, 0.77f, 0.82f, 1}, steelD{0.5f, 0.53f, 0.58f, 1};
  // exhaust pipe and the cab
  c.rect(8.f, -23.f, 10.f, -16.f, dark);
  c.rect(-15.f, -27.f, 1.5f, -9.f, yellow);
  c.rect(-12.5f, -25.f, -1.f, -17.f, glass);
  c.poly({{-12.5f, -25.f}, {-8.5f, -25.f}, {-12.5f, -20.f}}, Col{1, 1, 1, 0.45f});
  c.rect(-16.f, -28.2f, 2.5f, -26.6f, yellowD);
  // engine
  c.rect(1.f, -17.f, 14.5f, -9.f, yellow);
  c.rect(1.f, -13.6f, 14.5f, -12.6f, yellowD);
  c.rect(-19.f, -10.f, 15.f, -8.f, dark);
  // flashing light
  c.rect(-8.6f, -30.f, -5.4f, -28.f, dark);
  bool on = frame & 2;
  if (on) c.circle(-7.f, -31.f, 5.f, Col{1, 0.55f, 0.1f, 0.3f});
  c.circle(-7.f, -31.f, 1.9f, on ? Col{1, 0.62f, 0.12f, 1} : Col{0.7f, 0.36f, 0.08f, 1});
  // tracks and wheels
  c.line(-19.f, -4.5f, 13.f, -4.5f, 9.f, track);
  c.line(-19.f, -4.5f, 13.f, -4.5f, 6.4f, trackIn);
  for (float x : {-17.f, -9.f, -1.f, 7.f}) {
    c.circle(x, -4.5f, 2.6f, wheel);
    float a = (frame & 1) * 0.785f + x;
    c.line(x - std::cos(a) * 2.f, -4.5f - std::sin(a) * 2.f, x + std::cos(a) * 2.f, -4.5f + std::sin(a) * 2.f, 0.6f, dark);
    c.circle(x, -4.5f, 0.9f, dark);
  }
  // blade
  c.line(13.f, -9.f, 19.f, -6.5f, 1.6f, dark);
  c.line(13.f, -5.f, 19.f, -3.5f, 1.4f, dark);
  c.poly({{18.f, -15.f}, {21.5f, -16.f}, {25.f, -0.5f}, {19.5f, 0.f}}, steel);
  c.line(21.5f, -16.f, 25.f, -0.5f, 0.9f, steelD);
  return c.finish(0, 0, !facingRight);
}

// ------------------------------------------------------------------------------------------- present
Sprite makePresent(float scale, int color) {
  static const Col box[] = {{0.85f, 0.15f, 0.17f, 1}, {0.13f, 0.6f, 0.3f, 1}, {0.2f, 0.42f, 0.86f, 1}, {0.55f, 0.27f, 0.75f, 1}, {0.93f, 0.72f, 0.2f, 1}};
  static const Col rib[] = {{1, 0.85f, 0.3f, 1}, {0.95f, 0.2f, 0.2f, 1}, {1, 1, 1, 1}, {1, 0.85f, 0.3f, 1}, {0.85f, 0.12f, 0.15f, 1}};
  const Col b = box[color % 5], r = rib[color % 5];
  Canvas c(-1, -1, 12, 12, scale, 4);
  Col dark{b.r * 0.7f, b.g * 0.7f, b.b * 0.7f, 1};
  c.rect(0.8f, 4, 9.2f, 10, b);
  c.rect(0.8f, 8.6f, 9.2f, 10, dark);
  c.rect(0.2f, 2.6f, 9.8f, 4.6f, dark);
  c.rect(4.3f, 2.6f, 5.7f, 10, r);
  c.ellipse(3.4f, 1.7f, 1.9f, 1.1f, r, 0.35f);
  c.ellipse(6.6f, 1.7f, 1.9f, 1.1f, r, -0.35f);
  c.circle(5, 2.2f, 0.8f, r);
  return c.finish(5, 10);
}

// ------------------------------------------------------------------------------------------- Santa
namespace {
void reindeer(Canvas& c, float X, float phase, bool lead) {
  const Col fur{0.56f, 0.36f, 0.2f, 1}, legC{0.4f, 0.25f, 0.13f, 1}, belly{0.8f, 0.64f, 0.46f, 1}, antler{0.47f, 0.32f, 0.16f, 1};
  float bob = -std::cos(phase * 2) * 0.6f;
  // far legs (darker), then body, then near legs
  for (int pass = 0; pass < 2; ++pass) {
    Col lc = pass == 0 ? Col{0.3f, 0.19f, 0.1f, 1} : legC;
    float off = pass == 0 ? 0.7f : 0.f;
    float af = 0.85f * std::sin(phase + off), ab = 0.85f * std::sin(phase + PI + off);
    float hx[2] = {X + 5.f, X + 18.f}, a[2] = {ab, af};
    for (int i = 0; i < 2; ++i) {
      float kx = hx[i] + std::sin(a[i]) * 4.6f, ky = 30 + bob + std::cos(a[i]) * 4.6f;
      float bend = a[i] * (i == 0 ? -0.6f : 0.9f);
      float fx = kx + std::sin(a[i] + bend) * 4.6f, fy = ky + std::cos(a[i] + bend) * 4.6f;
      c.line(hx[i], 29 + bob, kx, ky, 1.7f, lc);
      c.line(kx, ky, fx, fy, 1.4f, lc);
      c.circle(fx, fy, 0.9f, Col{0.15f, 0.1f, 0.06f, 1});
    }
    if (pass == 0) {
      c.circle(X + 2.2f, 24.2f + bob, 1.7f, Col{0.96f, 0.94f, 0.9f, 1});
      c.ellipse(X + 12, 27 + bob, 10.5f, 5.2f, fur);
      c.ellipse(X + 12.5f, 29.3f + bob, 7.f, 2.4f, belly);
      c.poly({{X + 17.5f, 24.5f + bob}, {X + 23.5f, 15.f + bob}, {X + 27.f, 17.f + bob}, {X + 22.f, 28.f + bob}}, fur);
      // antlers
      c.line(X + 25.6f, 13.f + bob, X + 23.4f, 5.5f + bob, 0.9f, antler);
      c.line(X + 24.3f, 8.6f + bob, X + 20.8f, 7.f + bob, 0.8f, antler);
      c.line(X + 23.8f, 6.6f + bob, X + 26.2f, 3.8f + bob, 0.8f, antler);
      c.line(X + 27.4f, 13.f + bob, X + 28.4f, 6.f + bob, 0.8f, Col{0.55f, 0.39f, 0.2f, 1});
      c.line(X + 28.f, 8.6f + bob, X + 30.6f, 7.4f + bob, 0.7f, Col{0.55f, 0.39f, 0.2f, 1});
      c.ellipse(X + 27.3f, 15.6f + bob, 4.1f, 2.8f, fur, 0.25f);
      c.ellipse(X + 24.4f, 13.3f + bob, 1.6f, 0.8f, legC, -0.6f);
      c.circle(X + 27.8f, 14.6f + bob, 0.55f, Col{0.08f, 0.06f, 0.05f, 1});
      if (lead) {
        c.circle(X + 31.3f, 17.f + bob, 4.2f, Col{1, 0.2f, 0.15f, 0.22f});
        c.circle(X + 31.3f, 17.f + bob, 1.8f, Col{0.96f, 0.1f, 0.1f, 1});
        c.circle(X + 30.8f, 16.4f + bob, 0.55f, Col{1, 0.8f, 0.8f, 1});
      } else {
        c.circle(X + 31.f, 17.f + bob, 1.2f, Col{0.22f, 0.13f, 0.08f, 1});
      }
      // harness
      c.line(X + 6.f, 23.6f + bob, X + 19.f, 23.6f + bob, 1.4f, Col{0.75f, 0.12f, 0.12f, 1});
      c.circle(X + 12.f, 23.8f + bob, 0.9f, Col{1, 0.85f, 0.3f, 1});
    }
  }
}
}  // namespace

Sprite makeSanta(float scale, int frame, bool facingRight) {
  Canvas c(-6, -3, 140, 48, scale, 4);
  const float phase = frame * PI / 2;
  const Col red{0.8f, 0.12f, 0.13f, 1}, redD{0.6f, 0.07f, 0.08f, 1}, gold{0.9f, 0.72f, 0.28f, 1}, fur{0.98f, 0.98f, 0.98f, 1};
  const Col rope{0.33f, 0.2f, 0.1f, 1};
  // traces from the sleigh to the reindeer
  c.line(43, 25, 64, 26, 0.9f, rope);
  c.line(84, 25.5f, 96, 26, 0.9f, rope);
  reindeer(c, 60, phase, false);
  reindeer(c, 92, phase + PI / 2, true);
  c.line(31.5f, 21.5f, 72.f, 23.8f, 0.6f, rope);  // reins
  // sack and presents behind Santa
  c.rect(8.5f, 3.f, 13.5f, 8.5f, Col{0.15f, 0.6f, 0.3f, 1});
  c.rect(10.4f, 3.f, 11.6f, 8.5f, Col{1, 0.85f, 0.3f, 1});
  c.circle(6.5f, 14.f, 7.4f, Col{0.55f, 0.34f, 0.17f, 1});
  c.circle(5.3f, 12.4f, 5.5f, Col{0.64f, 0.42f, 0.22f, 1});
  // Santa
  c.circle(20.f, 21.f, 7.6f, red);
  c.line(22.f, 19.5f, 30.5f, 21.5f, 3.6f, red);
  c.line(28.6f, 21.f, 29.8f, 21.3f, 3.6f, fur);
  c.circle(31.7f, 21.6f, 1.9f, Col{0.14f, 0.14f, 0.16f, 1});
  c.circle(21.f, 11.5f, 4.7f, Col{0.97f, 0.8f, 0.68f, 1});
  c.ellipse(22.6f, 15.f, 4.6f, 4.2f, fur);
  c.ellipse(24.2f, 12.9f, 2.4f, 0.9f, fur, -0.2f);
  c.circle(25.6f, 12.f, 1.05f, Col{0.92f, 0.55f, 0.5f, 1});
  c.circle(23.4f, 10.4f, 0.55f, Col{0.1f, 0.08f, 0.08f, 1});
  c.poly({{16.2f, 9.6f}, {26.f, 9.2f}, {22.4f, 4.6f}, {17.f, 2.8f}, {11.5f, 4.4f}}, red);
  c.circle(11.f, 4.6f, 2.1f, fur);
  c.line(16.6f, 9.8f, 25.8f, 9.3f, 2.8f, fur);
  // sleigh body over Santa's lap
  c.poly({{-1.f, 15.f}, {2.f, 36.f}, {34.f, 36.f}, {41.f, 31.f}, {45.f, 25.f}, {43.f, 21.f}, {39.5f, 22.5f}, {36.5f, 27.f}, {9.f, 27.f}, {5.5f, 15.5f}}, red);
  c.poly({{1.5f, 31.f}, {2.f, 36.f}, {34.f, 36.f}, {38.f, 33.f}}, redD);
  c.line(5.5f, 15.5f, 9.f, 27.f, 1.2f, gold);
  c.line(9.f, 27.f, 36.5f, 27.f, 1.2f, gold);
  c.line(36.5f, 27.f, 39.5f, 22.5f, 1.2f, gold);
  c.circle(43.f, 22.6f, 1.6f, gold);
  c.line(12, 31.5f, 30, 31.5f, 0.7f, Col{1, 0.85f, 0.4f, 0.7f});
  // runner
  c.line(8.f, 35.5f, 8.f, 40.f, 1.4f, gold); c.line(30.f, 35.5f, 30.f, 40.f, 1.4f, gold);
  c.line(-3.f, 40.5f, 39.f, 40.5f, 1.6f, gold);
  c.line(39.f, 40.5f, 45.f, 37.f, 1.6f, gold);
  c.line(45.f, 37.f, 46.f, 32.5f, 1.6f, gold);
  c.circle(44.8f, 32.f, 1.4f, gold);
  return c.finish(64, 22, !facingRight);
}

// ------------------------------------------------------------------------------------------- decorations
DecoGeom decoGeom(int kind) {
  switch (kind) {
    case kDecoHouse:       return {38, 44, 38, 40.5f, 0, 0};
    case kDecoHydrant:     return {13, 17, 6, 15.7f, 0, 0};
    case kDecoLamp:        return {14, 50, 6, 47.5f, 42.3f, 42};
    case kDecoLantern:     return {10, 18, 5, 15.5f, 7.5f, 20};
    case kDecoPine:        return {28, 42, 0, 0, 0, 0};
    case kDecoFir:         return {28, 47, 0, 0, 0, 0};
    case kDecoPresentRed:
    case kDecoPresentBlue: return {16, 17, 15, 11.8f, 0, 0};
    case kDecoBench:       return {32, 17, 29, 8.6f, 0, 0};
    case kDecoStall:       return {46, 42, 44, 40.5f, 0, 0};
    case kDecoSnowman:     return {30, 46, 0, 0, 0, 0};
    case kDecoCandyCane:   return {12, 27, 0, 0, 0, 0};
  }
  return {10, 10, 0, 0, 0, 0};
}

namespace {
const Col kSnow{0.95f, 0.97f, 1.f, 1};
const Col kWarm{1.f, 0.84f, 0.45f, 1};

void drawTree(Canvas& c, bool decorated, int frame) {
  const Col trunk{0.4f, 0.26f, 0.15f, 1};
  Col green = decorated ? Col{0.1f, 0.38f, 0.22f, 1} : Col{0.16f, 0.43f, 0.31f, 1};
  Col greenD = decorated ? Col{0.06f, 0.27f, 0.15f, 1} : Col{0.1f, 0.31f, 0.23f, 1};
  c.rect(-1.8f, -5.5f, 1.8f, 0, trunk);
  struct Tier { float b, t, w; } tiers[] = {{-4, -21, 13.5f}, {-15, -32, 10.5f}, {-26, -43, 7.5f}};
  for (auto& T : tiers) {
    c.poly({{-T.w, T.b}, {T.w, T.b}, {0, T.t}}, green);
    c.poly({{0.6f, T.t + 1}, {T.w, T.b}, {0.6f, T.b}}, greenD);
    float k = decorated ? 0.25f : 0.45f;  // how far down the snow reaches
    float yk = T.t + (T.b - T.t) * k;
    c.poly({{0, T.t}, {T.w * k * 1.05f, yk}, {T.w * 0.3f, yk + 1.2f}, {0, yk - 0.4f}, {-T.w * 0.35f, yk + 1.f}, {-T.w * k * 1.05f, yk}}, kSnow);
    c.line(-T.w + 1.2f, T.b - 0.4f, T.w - 1.2f, T.b - 0.4f, decorated ? 0.8f : 1.5f, kSnow);
  }
  if (decorated) {
    static const Col orn[] = {{0.92f, 0.15f, 0.15f, 1}, {1, 0.8f, 0.25f, 1}, {0.3f, 0.55f, 1, 1}, {0.85f, 0.3f, 0.75f, 1}};
    const float pos[][2] = {{-7, -8}, {5, -10}, {-2, -14}, {8.5f, -6}, {-4.5f, -20}, {4, -22}, {-1, -27}, {2.5f, -33}, {-3, -36}};
    for (int i = 0; i < 9; ++i) {
      c.circle(pos[i][0], pos[i][1], 1.5f, orn[i % 4]);
      c.circle(pos[i][0] - 0.45f, pos[i][1] - 0.45f, 0.5f, Col{1, 1, 1, 0.7f});
    }
    // little lights along two garlands
    for (int g = 0; g < 2; ++g)
      for (int i = 0; i < 6; ++i) {
        float t = i / 5.f;
        float x = -10.f + 20.f * t + (g ? -2 : 1), y = (g ? -18 : -7) - 8.f * t + (g ? 2 : 0) * std::sin(t * 3);
        bool on = ((i + g + frame) % 2) == 0;
        if (on) c.circle(x, y, 2.2f, Col{1, 0.85f, 0.45f, 0.35f});
        c.circle(x, y, 0.8f, on ? Col{1, 0.93f, 0.65f, 1} : Col{0.75f, 0.6f, 0.35f, 1});
      }
    // star
    std::vector<std::pair<float, float>> star;
    for (int i = 0; i < 10; ++i) { float a = -PI / 2 + i * PI / 5, r = i % 2 ? 1.5f : 3.4f; star.push_back({std::cos(a) * r, -44.f + std::sin(a) * r}); }
    c.circle(0, -44, 5, Col{1, 0.85f, 0.35f, frame ? 0.35f : 0.22f});
    c.poly(star, Col{1, 0.82f, 0.25f, 1});
  }
}
}  // namespace

Sprite makeDecoration(int kind, float scale, int frame) {
  DecoGeom g = decoGeom(kind);
  if (kind == kDecoPresentRed || kind == kDecoPresentBlue) return makePresent(scale * 1.6f, kind == kDecoPresentRed ? 0 : 2);
  if (kind == kDecoSnowman) {
    float r[3] = {10.f * scale, 7.6f * scale, 5.6f * scale}, c[3];
    snowmanCentres(r, 3, c);
    Sprite d = makeSnowmanDecor(r, 3, 0, 0, true, frame);
    Sprite out = d;
    std::fill(out.px.begin(), out.px.end(), 0u);
    auto put = [&](const Sprite& s, int ax, int ay) {
      for (int y = 0; y < s.h; ++y)
        for (int x = 0; x < s.w; ++x) {
          int X = ax - s.ox + x, Y = ay - s.oy + y;
          if (X < 0 || Y < 0 || X >= out.w || Y >= out.h) continue;
          uint32_t p = s.px[(size_t)y * s.w + x], &q = out.px[(size_t)Y * out.w + X];
          uint32_t a = p >> 24, res = 0;
          for (int k = 0; k < 32; k += 8) res |= std::min(255u, ((p >> k) & 255) + ((q >> k) & 255) * (255 - a) / 255) << k;
          q = res;
        }
    };
    for (int i = 0; i < 3; ++i) put(makeBall(r[i]), d.ox, d.oy - (int)std::lround(c[i]));
    put(d, d.ox, d.oy);
    return out;
  }
  Canvas c(-g.w / 2 - 4, -g.h - 6, g.w + 8, g.h + 8, scale, 4);
  switch (kind) {
    case kDecoHouse: {
      const Col brick{0.6f, 0.27f, 0.2f, 1}, mortar{0.72f, 0.4f, 0.32f, 0.35f}, trim{0.92f, 0.86f, 0.76f, 1}, dark{0.36f, 0.16f, 0.12f, 1};
      c.rect(-18, -38, 18, 0, brick);
      for (float y = -36; y < 0; y += 3.2f) c.rect(-18, y, 18, y + 0.35f, mortar);
      c.rect(-19.5f, -40.5f, 19.5f, -37.5f, dark);
      c.rect(-19, -37.6f, 19, -36.8f, Col{0.28f, 0.12f, 0.09f, 1});
      auto window = [&](float cx, float ty) {
        c.circle(cx, ty + 3.7f, 6.5f, Col{1, 0.8f, 0.4f, 0.16f});
        c.rect(cx - 3.7f, ty - 0.7f, cx + 3.7f, ty + 8.1f, trim);
        c.rect(cx - 3, ty, cx + 3, ty + 7.4f, kWarm);
        c.rect(cx - 3, ty + 4, cx + 3, ty + 7.4f, Col{1, 0.74f, 0.32f, 1});
        c.rect(cx - 0.3f, ty, cx + 0.3f, ty + 7.4f, Col{0.5f, 0.3f, 0.18f, 1});
        c.rect(cx - 3, ty + 3.5f, cx + 3, ty + 3.9f, Col{0.5f, 0.3f, 0.18f, 1});
        c.rect(cx - 4, ty + 8, cx + 4, ty + 9, kSnow);  // snow on the sill
      };
      for (float cx : {-11.5f, 0.f, 11.5f}) { window(cx, -34.5f); window(cx, -23.5f); }
      window(-11.5f, -12.5f);
      window(11.5f, -12.5f);
      // door with a wreath, and steps
      c.circle(0, -11.5f, 3.9f, Col{0.13f, 0.42f, 0.24f, 1});
      c.rect(-3.9f, -11.5f, 3.9f, 0, Col{0.13f, 0.42f, 0.24f, 1});
      c.circle(0, -8.4f, 2.3f, Col{0.1f, 0.55f, 0.22f, 1});
      c.circle(0, -8.4f, 1.25f, Col{0.13f, 0.42f, 0.24f, 1});
      c.circle(-0.6f, -6.6f, 0.7f, Col{0.9f, 0.15f, 0.15f, 1}); c.circle(0.6f, -6.6f, 0.7f, Col{0.9f, 0.15f, 0.15f, 1});
      c.circle(2.4f, -4.6f, 0.45f, Col{1, 0.82f, 0.3f, 1});
      c.rect(-6, -1.3f, 6, 0, Col{0.72f, 0.72f, 0.75f, 1});
      c.rect(-6, -1.6f, 6, -1.2f, kSnow);
      break;
    }
    case kDecoHydrant: {
      const Col red{0.86f, 0.14f, 0.13f, 1}, redD{0.6f, 0.07f, 0.07f, 1};
      c.rect(-5, -2.4f, 5, 0, redD);
      c.rect(-3.5f, -11.8f, 3.5f, -2.2f, red);
      c.circle(0, -12.2f, 3.4f, red);
      c.rect(-4.3f, -12.4f, 4.3f, -11, redD);
      c.rect(-1.6f, -15.7f, 1.6f, -14.6f, redD);
      c.rect(-6.2f, -8.8f, -3.3f, -6.3f, redD);
      c.rect(3.3f, -8.8f, 6.2f, -6.3f, redD);
      c.circle(0, -6.8f, 1.5f, redD);
      c.rect(-2.5f, -11, -1.6f, -3, Col{1, 0.55f, 0.5f, 0.55f});
      break;
    }
    case kDecoLamp: {
      const Col pole{0.16f, 0.18f, 0.22f, 1};
      c.rect(-3.5f, -3.5f, 3.5f, 0, pole);
      c.rect(-2.3f, -6, 2.3f, -3.5f, pole);
      c.line(0, -6, 0, -38.5f, 1.9f, pole);
      c.rect(-2.5f, -39.8f, 2.5f, -38.2f, pole);
      c.poly({{-4.3f, -39.6f}, {4.3f, -39.6f}, {5.7f, -45.2f}, {-5.7f, -45.2f}}, pole);
      c.poly({{-3.3f, -40.4f}, {3.3f, -40.4f}, {4.4f, -44.4f}, {-4.4f, -44.4f}}, Col{1, 0.88f, 0.55f, 1});
      c.rect(-0.3f, -44.4f, 0.3f, -40.4f, pole);
      c.poly({{-6.6f, -45.2f}, {6.6f, -45.2f}, {3, -47.5f}, {-3, -47.5f}}, pole);
      break;
    }
    case kDecoLantern: {
      const Col frm{0.15f, 0.15f, 0.17f, 1};
      c.rect(-4.5f, -2, 4.5f, 0, frm);
      c.rect(-3.9f, -13, 3.9f, -2, frm);
      c.rect(-2.9f, -12, 2.9f, -3, Col{1, 0.78f, 0.4f, 1});
      if (frame == 0) { c.ellipse(0, -6.4f, 1.3f, 2.5f, Col{1, 0.96f, 0.72f, 1}); c.ellipse(0, -6, 0.75f, 1.5f, Col{1, 1, 0.95f, 1}); }
      else { c.ellipse(0.25f, -6.7f, 1.1f, 2.8f, Col{1, 0.96f, 0.72f, 1}); c.ellipse(0.2f, -6.2f, 0.65f, 1.6f, Col{1, 1, 0.95f, 1}); }
      c.rect(-1.9f, -12, -1.4f, -3, frm); c.rect(1.4f, -12, 1.9f, -3, frm);
      c.poly({{-4.7f, -13}, {4.7f, -13}, {2.5f, -15.5f}, {-2.5f, -15.5f}}, frm);
      c.line(-1.5f, -15.5f, -1.3f, -17.6f, 0.7f, frm); c.line(1.5f, -15.5f, 1.3f, -17.6f, 0.7f, frm);
      c.line(-1.3f, -17.6f, 1.3f, -17.6f, 0.7f, frm);
      break;
    }
    case kDecoPine: drawTree(c, false, frame); break;
    case kDecoFir: drawTree(c, true, frame); break;
    case kDecoBench: {
      const Col wood{0.56f, 0.36f, 0.2f, 1}, woodD{0.42f, 0.26f, 0.14f, 1}, iron{0.15f, 0.15f, 0.17f, 1};
      c.line(-12.4f, -7, -13, -15.6f, 1.3f, iron); c.line(12.4f, -7, 13, -15.6f, 1.3f, iron);
      c.rect(-14.5f, -15.8f, 14.5f, -14.2f, wood);
      c.rect(-14.5f, -16.5f, 14.5f, -15.8f, kSnow);
      c.rect(-14.5f, -12.9f, 14.5f, -11.4f, wood);
      c.rect(-13.2f, -7.2f, -11.8f, 0, iron); c.rect(11.8f, -7.2f, 13.2f, 0, iron);
      c.rect(-15.5f, -8.6f, 15.5f, -7, wood);
      c.rect(-15.5f, -7.2f, 15.5f, -6.5f, woodD);
      c.line(-14.5f, -11, -14.5f, -7.6f, 1.2f, iron); c.line(14.5f, -11, 14.5f, -7.6f, 1.2f, iron);
      break;
    }
    case kDecoStall: {
      const Col wood{0.58f, 0.37f, 0.2f, 1}, woodD{0.43f, 0.26f, 0.13f, 1}, red{0.8f, 0.13f, 0.15f, 1}, white{0.97f, 0.95f, 0.92f, 1};
      c.rect(-20, -34, -17.8f, 0, woodD); c.rect(17.8f, -34, 20, 0, woodD);
      c.rect(-17.8f, -30, 17.8f, -15.5f, Col{0.24f, 0.14f, 0.09f, 1});
      for (float x = -16; x <= 16; x += 4) {  // little lights inside
        c.circle(x, -28.6f, 1.9f, Col{1, 0.85f, 0.45f, 0.3f});
        c.circle(x, -28.6f, 0.8f, Col{1, 0.92f, 0.6f, 1});
      }
      c.circle(-12, -17.2f, 2, Col{0.9f, 0.2f, 0.2f, 1});
      c.circle(-7, -17.6f, 2.4f, Col{1, 0.8f, 0.25f, 1});
      c.rect(-3, -19.6f, 2, -15.5f, Col{0.2f, 0.5f, 0.85f, 1});
      c.rect(-0.8f, -19.6f, -0.2f, -15.5f, Col{1, 0.9f, 0.5f, 1});
      c.circle(6.5f, -17.2f, 2, Col{0.15f, 0.55f, 0.3f, 1});
      c.rect(10, -18.6f, 15.5f, -15.5f, Col{0.85f, 0.55f, 0.25f, 1});
      c.rect(-21, -14, 21, 0, wood);
      for (float x = -17; x < 21; x += 4.2f) c.rect(x, -14, x + 0.45f, 0, Col{0.43f, 0.26f, 0.13f, 0.6f});
      c.rect(-22, -15.6f, 22, -13.6f, woodD);
      for (int i = 0; i < 8; ++i) {  // striped, scalloped awning
        float x = -22 + i * 5.5f;
        Col col = i % 2 ? white : red;
        c.rect(x, -37.4f, x + 5.5f, -30, col);
        c.circle(x + 2.75f, -30, 2.75f, col);
      }
      c.rect(-23, -40.5f, 23, -37.2f, Col{0.6f, 0.08f, 0.1f, 1});
      break;
    }
    case kDecoCandyCane: {
      std::vector<std::pair<float, float>> pts;
      for (float y = 0; y >= -19.f; y -= 1.f) pts.push_back({2.5f, y});
      for (int i = 1; i <= 12; ++i) { float a = PI * i / 12; pts.push_back({-1.f + std::cos(a) * 3.5f, -19.f - std::sin(a) * 3.5f}); }
      for (float y = -19.f; y <= -15.f; y += 1.f) pts.push_back({-4.5f, y});
      for (size_t i = 0; i + 1 < pts.size(); ++i) c.line(pts[i].first, pts[i].second, pts[i + 1].first, pts[i + 1].second, 3.3f, Col{0.45f, 0.08f, 0.08f, 0.5f});
      for (size_t i = 0; i + 1 < pts.size(); ++i)
        c.line(pts[i].first, pts[i].second, pts[i + 1].first, pts[i + 1].second, 2.6f, (i / 2) % 2 ? Col{0.97f, 0.97f, 0.97f, 1} : Col{0.86f, 0.12f, 0.14f, 1});
      break;
    }
  }
  return c.finish(0, 0);
}

// A little string of lights, for the decorating toolbar.
Sprite makeLightsIcon(float size) {
  float k = size / 40.f;
  Canvas c(-20, -20, 40, 40, k, 4);
  std::vector<std::pair<float, float>> pts;
  for (int i = 0; i <= 20; ++i) { float t = i / 20.f; pts.push_back({-18 + 36 * t, -10 + 18 * 4 * t * (1 - t) * 0.6f}); }
  for (size_t i = 0; i + 1 < pts.size(); ++i) c.line(pts[i].first, pts[i].second, pts[i + 1].first, pts[i + 1].second, 1.2f, Col{0.55f, 0.6f, 0.55f, 1});
  static const Col bulbs[] = {{1, 0.3f, 0.3f, 1}, {0.35f, 0.85f, 0.45f, 1}, {0.4f, 0.6f, 1, 1}, {1, 0.8f, 0.3f, 1}};
  for (int i = 1; i < 20; i += 3) {
    Col b = bulbs[(i / 3) % 4];
    c.circle(pts[i].first, pts[i].second + 2.6f, 4.5f, Col{b.r, b.g, b.b, 0.3f});
    c.circle(pts[i].first, pts[i].second + 2.6f, 2.3f, b);
  }
  return c.finish(0, 0);
}

// ------------------------------------------------------------------------------------------- icon
std::vector<uint32_t> makeIcon(int size) {
  float s = size / 32.f;
  Canvas c(0, 0, 32, 32, s, size <= 24 ? 6 : 4);
  c.circle(16, 16, 15.6f, Col{0.1f, 0.25f, 0.55f, 1});
  c.circle(16, 15.2f, 14.6f, Col{0.2f, 0.46f, 0.86f, 1});
  c.circle(13, 11, 9.f, Col{0.4f, 0.64f, 0.98f, 0.35f});
  float R = 11.f;
  float w = size <= 16 ? 2.2f : 1.9f;
  for (int k = 0; k < 6; ++k) {
    float a = -PI / 2 + k * PI / 3, ca = std::cos(a), sa = std::sin(a);
    c.line(16, 16, 16 + ca * R, 16 + sa * R, w, kWhite);
    if (size >= 20) {
      float bx = 16 + ca * R * 0.6f, by = 16 + sa * R * 0.6f;
      for (float sg : {-1.f, 1.f}) { float b = a + sg * PI / 3; c.line(bx, by, bx + std::cos(b) * 3.6f, by + std::sin(b) * 3.6f, w * 0.85f, kWhite); }
    }
  }
  c.circle(16, 16, 2.4f, kWhite);
  Sprite sp = c.finish(0, 0);
  return sp.px;
}

}  // namespace snow
