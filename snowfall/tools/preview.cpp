// Preview harness (Linux/macOS, not shipped): runs the engine on a pretend desktop and writes screenshots,
// so the look and the per-frame cost can be checked without Windows.
//   g++ -O2 -std=c++17 -Isrc src/engine.cpp src/sprites.cpp tools/preview.cpp -o preview && ./preview out/
#include "engine.h"
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

using namespace snow;

struct FakeWin { Rect r; uint32_t title, body; };

static void fill(std::vector<uint32_t>& img, int W, int H, Rect r, uint32_t c) {
  for (int y = std::max(0, r.t); y < std::min(r.b, H); ++y)
    for (int x = std::max(0, r.l); x < std::min(r.r, W); ++x) img[(size_t)y * W + x] = c;
}

static void save(const std::string& path, const std::vector<uint32_t>& desk, const std::vector<uint32_t>& ov, int W, Rect crop) {
  FILE* f = std::fopen((path + ".ppm").c_str(), "wb");
  if (!f) return;
  std::fprintf(f, "P6\n%d %d\n255\n", crop.w(), crop.h());
  for (int y = crop.t; y < crop.b; ++y)
    for (int x = crop.l; x < crop.r; ++x) {
      uint32_t d = desk[(size_t)y * W + x], s = ov[(size_t)y * W + x];
      int a = s >> 24;
      unsigned char px[3];
      for (int k = 0; k < 3; ++k) {
        int sh = 16 - 8 * k;
        int dc = (d >> sh) & 255, sc = (s >> sh) & 255;
        px[k] = (unsigned char)std::min(255, sc + dc * (255 - a) / 255);
      }
      std::fwrite(px, 1, 3, f);
    }
  std::fclose(f);
  if (std::system(("convert " + path + ".ppm " + path + ".png 2>/dev/null && rm " + path + ".ppm").c_str()) != 0) { /* keep the .ppm */ }
}

int main(int argc, char** argv) {
  std::string out = argc > 1 ? argv[1] : "out/";
  const int W = 1920, H = 1080, TB = 48;
  World w;
  Settings s;
  s.amount = 2;
  w.configure(s);
  Monitor m;
  m.id = 1; m.r = {0, 0, W, H}; m.groundY = H - TB; m.taskbar = 99; m.scale = 1;
  w.setMonitors({m});

  std::vector<FakeWin> wins = {
      {{980, 300, 1700, 820}, 0xFF202020, 0xFF2B2B2B},   // dark app in front
      {{260, 180, 1160, 760}, 0xFFF3F3F3, 0xFFFFFFFF},   // light window behind it
      {{120, 520, 700, 940}, 0xFFE8EEF6, 0xFFFAFAFA},    // further back
  };
  auto zlist = [&](int dragX) {
    std::vector<Win> z;
    z.push_back({99, {0, H - TB, W, H}, Kind::Taskbar, 0});
    for (size_t i = 0; i < wins.size(); ++i) {
      Rect r = wins[i].r;
      if (i == 0) { r.l += dragX; r.r += dragX; }
      z.push_back({100 + i, r, Kind::Window, 8});
    }
    return z;
  };
  w.setWindows(zlist(0), {});

  std::vector<uint32_t> desk((size_t)W * H), ov((size_t)W * H, 0);
  auto paintDesk = [&](int dragX) {
    for (int y = 0; y < H; ++y) {
      uint32_t c = 0xFF000000 | ((uint32_t)(40 + y * 30 / H) << 16) | ((uint32_t)(70 + y * 40 / H) << 8) | (uint32_t)(110 + y * 50 / H);
      for (int x = 0; x < W; ++x) desk[(size_t)y * W + x] = c;
    }
    for (int i = (int)wins.size() - 1; i >= 0; --i) {
      Rect r = wins[i].r;
      if (i == 0) { r.l += dragX; r.r += dragX; }
      fill(desk, W, H, r, wins[i].body);
      fill(desk, W, H, {r.l, r.t, r.r, r.t + 32}, wins[i].title);
    }
    fill(desk, W, H, {0, H - TB, W, H}, 0xFF1C2333);
  };
  Target t{ov.data(), W, H, W};

  const float dt = 1.f / 30;
  double upd = 0, ren = 0;
  long frames = 0;
  // cursor: a path to follow this run (from -> to), or none
  float c0x = 0, c0y = 0, c1x = 0, c1y = 0;
  bool cursorOn = false;
  auto frame = [&](float f /*0..1 through this run*/, int dragX, bool drag) {
    if (drag) w.setWindows(zlist(dragX), {});
    if (cursorOn) w.setCursor(c0x + (c1x - c0x) * f, c0y + (c1y - c0y) * f, true);
    else w.setCursor(0, 0, false);
    auto a = std::chrono::steady_clock::now();
    w.update(dt);
    auto b = std::chrono::steady_clock::now();
    w.render(0, t, frames == 0);
    auto c = std::chrono::steady_clock::now();
    upd += std::chrono::duration<double, std::milli>(b - a).count();
    ren += std::chrono::duration<double, std::milli>(c - b).count();
    ++frames;
  };
  auto run = [&](float seconds, bool shake = false) {
    int n = std::max(1, (int)(seconds / dt));
    for (int i = 0; i < n; ++i) frame((float)i / n, shake ? (int)(std::sin(i * 0.9f) * 120) : 0, shake);
  };
  auto push = [&](float x0, float x1, float y, float seconds) {  // the mouse sweeps across
    c0x = x0; c1x = x1; c0y = c1y = y; cursorOn = true;
    run(seconds);
    cursorOn = false;
    run(0.1f);
  };
  auto shot = [&](const std::string& name, Rect crop) { paintDesk(0); save(out + name, desk, ov, W, crop); };

  run(20);
  shot("01-start", {0, 0, W, H});
  run(100);
  // build a snowman by hand: a big ball, then roll smaller ones into it
  w.dropSnowball(560, 120, 9);
  w.dropSnowball(660, 120, 6.5f);
  run(1.5f);
  shot("02-balls", {420, 100, 820, 220});
  push(720, 600, 170, 0.15f);  // push the smaller ball left, into the big one
  run(1.5f);
  w.dropSnowball(700, 120, 4.8f);
  run(1.5f);
  push(760, 640, 172, 0.15f);
  run(2);
  shot("03-snowman-built", {420, 60, 820, 220});
  // roll a ball along the dark window and off its end
  w.dropSnowball(1250, 200, 3);
  run(1.5f);
  push(1200, 1320, 293, 0.12f);
  run(0.6f);
  shot("04-rolling", {1150, 220, 1750, 340});
  run(4);
  w.sendSanta();
  run(60);
  shot("05-later", {0, 0, W, H});
  w.sendPlow();
  run(7);
  shot("06-plow", {0, 860, 1100, 1080});
  run(14);
  shot("07-plow-later", {700, 860, 1920, 1080});
  Stats st = w.stats();
  std::printf("flakes %d clumps %d piles %d objects %d volume %.0f\n", st.flakes, st.clumps, st.piles, st.objects, st.pileVolume);
  std::printf("avg update %.3f ms, avg render %.3f ms over %ld frames\n", upd / frames, ren / frames, frames);
  run(120);
  shot("08-much-later", {0, 0, W, H});
  run(0.6f, true);  // shake the front window
  shot("09-shake", {600, 150, 1920, 1080});
  st = w.stats();
  std::printf("after shake: clumps %d objects %d volume %.0f\n", st.clumps, st.objects, st.pileVolume);
  {
    // sprite sheet at 3x
    float r3[3] = {27, 20, 14}, r2[3] = {24, 17, 0};
    std::vector<std::pair<Sprite, std::vector<std::pair<Sprite, float>>>> men;
    std::vector<Sprite> sp = {makeBall(20), makeSnowplow(3, 0, true), makeSnowplow(3, 2, false), makePresent(4, 1), makeSanta(2.4f, 0, true)};
    // snowmen: balls + decoration, composited by hand like the engine does
    auto man = [&](const float* r, int n, int hat, int color, bool right, int fr) {
      float c[3]; snowmanCentres(r, n, c);
      Sprite d = makeSnowmanDecor(r, n, hat, color, right, fr);
      int Wd = d.w, Hd = d.h;
      Sprite outS; outS.w = Wd; outS.h = Hd; outS.ox = d.ox; outS.oy = d.oy; outS.px.assign((size_t)Wd * Hd, 0);
      auto put = [&](const Sprite& s, int ax, int ay) {
        for (int y = 0; y < s.h; ++y) for (int x = 0; x < s.w; ++x) {
          int X = ax - s.ox + x, Y = ay - s.oy + y;
          if (X < 0 || Y < 0 || X >= Wd || Y >= Hd) continue;
          uint32_t p = s.px[(size_t)y * s.w + x], &q = outS.px[(size_t)Y * Wd + X];
          uint32_t a = p >> 24;
          uint32_t res = 0;
          for (int k = 0; k < 32; k += 8) { uint32_t pc = (p >> k) & 255, qc = (q >> k) & 255; res |= std::min(255u, pc + qc * (255 - a) / 255) << k; }
          q = res;
        }
      };
      for (int i = 0; i < n; ++i) put(makeBall(r[i]), d.ox, d.oy - (int)std::lround(c[i]));
      put(d, d.ox, d.oy);
      return outS;
    };
    sp.insert(sp.begin(), {man(r3, 3, 0, 0, true, 0), man(r3, 3, 1, 0, false, 1), man(r2, 2, 2, 2, true, 0), man(r3, 3, 2, 1, false, 0)});
    int SW = 0, SH = 0;
    for (auto& p : sp) { SW += p.w + 12; SH = std::max(SH, p.h); }
    std::vector<uint32_t> d((size_t)SW * SH, 0xFF3A5A8A), o((size_t)SW * SH, 0);
    int x = 0;
    for (auto& p : sp) {
      for (int yy = 0; yy < p.h; ++yy) for (int xx = 0; xx < p.w; ++xx) o[(size_t)(SH - p.h + yy) * SW + x + xx] = p.px[(size_t)yy * p.w + xx];
      x += p.w + 12;
    }
    save(out + "10-sprites", d, o, SW, {0, 0, SW, SH});
  }
  return 0;
}
