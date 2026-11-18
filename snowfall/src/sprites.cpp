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

// ------------------------------------------------------------------------------------------- snowman
Sprite makeSnowman(float scale, int frame) {
  Canvas c(-1, -4, 32, 47, scale, 4);
  const Col outline{0.42f, 0.5f, 0.64f, 0.9f}, shade{0.84f, 0.89f, 0.97f, 1}, coal{0.12f, 0.12f, 0.15f, 1};
  const Col stick{0.42f, 0.27f, 0.14f, 1}, red{0.8f, 0.14f, 0.15f, 1}, carrot{0.97f, 0.5f, 0.12f, 1};
  // stick arms behind the body
  c.line(9.5f, 20, 2.5f, 14, 1.1f, stick); c.line(4.6f, 15.8f, 3.4f, 12.6f, 0.9f, stick);
  if (frame == 0) { c.line(20.5f, 20, 27.5f, 15.5f, 1.1f, stick); c.line(25.6f, 16.7f, 27.4f, 13.6f, 0.9f, stick); }
  else            { c.line(20.5f, 19, 25.5f, 9.5f, 1.1f, stick);  c.line(24.4f, 11.6f, 27.8f, 10.6f, 0.9f, stick); }
  struct Ball { float y, r; } balls[] = {{33.f, 9.f}, {20.5f, 6.8f}, {10.5f, 5.f}};
  for (auto& b : balls) c.circle(15, b.y, b.r + 0.7f, outline);
  for (auto& b : balls) { c.circle(15, b.y, b.r, shade); c.circle(15 - b.r * 0.16f, b.y - b.r * 0.18f, b.r * 0.8f, kWhite); }
  // scarf
  c.ellipse(15, 15.7f, 5.8f, 1.7f, red);
  c.poly({{16.8f, 15.6f}, {19.6f, 15.4f}, {20.4f, 21.4f}, {18.2f, 21.6f}}, red);
  c.line(18.4f, 19.6f, 20.2f, 19.4f, 0.5f, Col{1, 1, 1, 0.8f});
  // face
  c.circle(13.2f, 9.3f, 0.8f, coal); c.circle(16.8f, 9.3f, 0.8f, coal);
  c.poly({{15.f, 10.9f}, {15.f, 12.3f}, {21.f, 11.9f}}, carrot);
  for (int i = 0; i < 5; ++i) { float a = PI * (0.25f + 0.125f * i); c.circle(15 + std::cos(a) * 2.6f, 11.4f + std::sin(a) * 2.2f, 0.42f, coal); }
  // buttons
  c.circle(15, 18.6f, 0.75f, coal); c.circle(15, 21.8f, 0.75f, coal); c.circle(15, 25.2f, 0.8f, coal);
  // top hat
  c.rect(9.3f, 5.0f, 20.7f, 6.6f, coal);
  c.rect(11.4f, -3.0f, 18.6f, 5.4f, coal);
  c.rect(11.4f, 2.8f, 18.6f, 4.4f, red);
  c.line(12.4f, -2.2f, 12.4f, 2.0f, 0.5f, Col{1, 1, 1, 0.18f});
  return c.finish(15, 42);
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
