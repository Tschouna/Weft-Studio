// Preview harness (Linux/macOS, not shipped): runs the engine on a pretend desktop and writes screenshots,
// so the look and the per-frame cost can be checked without Windows.
//   g++ -O2 -std=c++17 -Isrc src/engine.cpp src/sprites.cpp tools/preview.cpp -o preview && ./preview out/
#include "engine.h"
#include <chrono>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

using namespace snow;

struct FakeWin { Rect r; uint32_t title, body; bool dark; };

static void fill(std::vector<uint32_t>& img, int W, Rect r, uint32_t c) {
  for (int y = std::max(0, r.t); y < std::min(r.b, (int)(img.size() / W)); ++y)
    for (int x = std::max(0, r.l); x < std::min(r.r, W); ++x) img[(size_t)y * W + x] = c;
}

static void save(const std::string& path, const std::vector<uint32_t>& desk, const std::vector<uint32_t>& ov, int W, int H, Rect crop) {
  FILE* f = std::fopen((path + ".ppm").c_str(), "wb");
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
  std::system(("convert " + path + ".ppm " + path + ".png && rm " + path + ".ppm").c_str());
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
      {{980, 300, 1700, 820}, 0xFF202020, 0xFF2B2B2B, true},   // dark app in front
      {{260, 180, 1160, 760}, 0xFFF3F3F3, 0xFFFFFFFF, false},  // light window behind it
      {{120, 520, 700, 940}, 0xFFE8EEF6, 0xFFFAFAFA, false},   // further back
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
      fill(desk, W, r, wins[i].body);
      fill(desk, W, {r.l, r.t, r.r, r.t + 32}, wins[i].title);
    }
    fill(desk, W, {0, H - TB, W, H}, 0xFF1C2333);
  };
  Target t{ov.data(), W, H, W};

  const float dt = 1.f / 30;
  double upd = 0, ren = 0;
  long frames = 0;
  auto run = [&](float seconds, int dragFrom = 0, int dragTo = 0, bool shake = false) {
    int n = (int)(seconds / dt);
    for (int i = 0; i < n; ++i) {
      if (dragFrom != dragTo || shake) {
        float f = (float)i / n;
        int x = shake ? (int)(std::sin(f * 40) * 120) : (int)(dragFrom + (dragTo - dragFrom) * f);
        w.setWindows(zlist(x), {});
      }
      w.setCursor(700 + i * 9.f, 400, true);
      auto a = std::chrono::steady_clock::now();
      w.update(dt);
      auto b = std::chrono::steady_clock::now();
      Rect d = w.render(0, t, frames == 0);
      auto c = std::chrono::steady_clock::now();
      upd += std::chrono::duration<double, std::milli>(b - a).count();
      ren += std::chrono::duration<double, std::milli>(c - b).count();
      ++frames;
      (void)d;
    }
  };

  run(20);
  paintDesk(0); save(out + "01-start", desk, ov, W, H, {0, 0, W, H});
  run(160);
  w.sendSanta();
  run(3.5f);
  paintDesk(0); save(out + "02-piles", desk, ov, W, H, {0, 0, W, H});
  save(out + "03-zoom", desk, ov, W, H, {180, 120, 1250, 560});
  run(240);
  paintDesk(0); save(out + "04-later", desk, ov, W, H, {0, 0, W, H});
  save(out + "05-zoom-later", desk, ov, W, H, {900, 230, 1760, 420});
  save(out + "06-taskbar", desk, ov, W, H, {0, 880, 960, 1080});
  save(out + "08-snowman", desk, ov, W, H, {0, 900, 480, 1080});
  {
    // sprite sheet at 2x
    std::vector<Sprite> sp = {makeSnowman(2, 0), makeSnowman(2, 1), makePresent(3, 0), makePresent(3, 1), makePresent(3, 2), makeSanta(2.4f, 0, true), makeSanta(2.4f, 1, false),
                              makeCrystal(13, 0, 0), makeCrystal(13, 0.3f, 1), makeCrystal(13, 0.5f, 2)};
    int SW = 0, SH = 0;
    for (auto& p : sp) { SW += p.w + 10; SH = std::max(SH, p.h); }
    std::vector<uint32_t> d((size_t)SW * SH, 0xFF3A5A8A), o((size_t)SW * SH, 0);
    int x = 0;
    for (auto& p : sp) {
      for (int yy = 0; yy < p.h; ++yy) for (int xx = 0; xx < p.w; ++xx) o[(size_t)yy * SW + x + xx] = p.px[(size_t)yy * p.w + xx];
      x += p.w + 10;
    }
    save(out + "09-sprites", d, o, SW, SH, {0, 0, SW, SH});
    auto ic = makeIcon(64);
    std::vector<uint32_t> d2(64 * 64, 0xFFFFFFFF);
    save(out + "10-icon", d2, ic, 64, 64, {0, 0, 64, 64});
  }
  Stats st = w.stats();
  std::printf("flakes %d clumps %d piles %d presents %d volume %.0f\n", st.flakes, st.clumps, st.piles, st.objects, st.pileVolume);
  std::printf("avg update %.3f ms, avg render %.3f ms over %ld frames\n", upd / frames, ren / frames, frames);
  run(0.6f, 0, 0, true);  // shake the front window
  paintDesk((int)(std::sin(40.f) * 120)); save(out + "07-shake", desk, ov, W, H, {600, 150, 1920, 1080});
  st = w.stats();
  std::printf("after shake: clumps %d volume %.0f\n", st.clumps, st.pileVolume);
  return 0;
}
