// Snowfall engine: everything that does not touch Windows. Snow, the piles on windows and the taskbar,
// icicles, the snowman, Santa and his presents, all simulated in virtual-screen pixels and drawn into
// premultiplied BGRA buffers. The Windows layer (win_main.cpp) feeds it windows, monitors and the mouse.
#pragma once
#include <cstdint>
#include <vector>
#include <unordered_map>
#include <memory>

namespace snow {

struct Rect {
  int l = 0, t = 0, r = 0, b = 0;
  int w() const { return r - l; }
  int h() const { return b - t; }
  bool empty() const { return r <= l || b <= t; }
  bool contains(float x, float y) const { return x >= l && x < r && y >= t && y < b; }
  bool intersects(const Rect& o) const { return l < o.r && o.l < r && t < o.b && o.t < b; }
};
Rect unite(const Rect& a, const Rect& b);
Rect intersect(const Rect& a, const Rect& b);

enum class Kind : uint8_t {
  Occluder,  // hides snow behind it, but snow does not land on it (menus, popups, topmost overlays)
  Window,    // an app window: snow lands on its top edge
  Taskbar,   // snow lands on its top edge as the "ground" of its monitor
};

// One top-level window, in Z-order (index 0 is the topmost).
struct Win {
  uint64_t id = 0;
  Rect r;
  Kind kind = Kind::Occluder;
  int corner = 0;  // radius of the rounded top corners, px
};

struct Monitor {
  uint64_t id = 0;
  Rect r;              // whole monitor, virtual-screen px
  int groundY = 0;     // where snow comes to rest: the taskbar's top edge, or the bottom of the screen
  uint64_t taskbar = 0;// id of the taskbar window at the bottom of this monitor, 0 if none
  float scale = 1.f;   // DPI scale (1 = 96 dpi)
  bool active = true;  // false while a full-screen app covers it
};

struct Settings {
  int amount = 1;      // 0 light, 1 steady, 2 heavy, 3 blizzard
  int wind = 1;        // 0 calm, 1 breeze, 2 stormy
  int flakes = 1;      // 0 small, 1 mixed, 2 big and fluffy
  bool pileWindows = true;
  bool pileTaskbar = true;
  bool icicles = true;
  bool mouse = true;
  bool snowmen = true;   // snowballs and snowmen on windows and the taskbar
  bool snowplow = true;  // a snowplow clears the taskbar now and then
  bool presents = true;
};

// A premultiplied BGRA (0xAARRGGBB) image owned by the caller.
struct Target {
  uint32_t* px = nullptr;
  int w = 0, h = 0, stride = 0;  // stride in pixels
};

struct Stats {
  int flakes = 0, clumps = 0, piles = 0, objects = 0;
  float pileVolume = 0;
};

struct Sprite {
  int w = 0, h = 0, ox = 0, oy = 0;  // ox, oy: anchor inside the sprite
  std::vector<uint32_t> px;           // premultiplied BGRA
};

class World {
 public:
  World();
  ~World();
  void configure(const Settings& s);
  const Settings& settings() const { return set_; }

  void setMonitors(const std::vector<Monitor>& mons);
  const std::vector<Monitor>& monitors() const { return mons_; }

  // The full window list, topmost first. Piles whose window is missing from the list fall off, unless the
  // window is in `keep` (hidden for now, for instance on another virtual desktop).
  void setWindows(const std::vector<Win>& zorder, const std::vector<uint64_t>& keep);

  void setCursor(float x, float y, bool valid);
  void update(float dt);

  // Draws monitor `mi` into t. Pass fresh=true when the buffer is new (all zero). Returns the part of the
  // buffer that changed since the last call (empty if nothing changed).
  Rect render(int mi, Target& t, bool fresh);

  // Fun things, from the tray menu and hotkeys.
  void sendSanta();
  void sendPlow();
  void snowstorm(float seconds);
  void dropSnowball(float x, float y, float radius);  // a snowball falls from (x, y)
  void shakeAll();
  void clearAll();

  Stats stats() const;
  bool santaFlying() const;

  struct Impl;
 private:
  std::unique_ptr<Impl> d_;
  Settings set_;
  std::vector<Monitor> mons_;
};

// Sprites (sprites.cpp), rendered once per DPI scale.
Sprite makeCrystal(float radius, float angle, int variant);
Sprite makeSanta(float scale, int frame, bool facingRight);
Sprite makePresent(float scale, int color);
Sprite makeBall(float radius);
Sprite makeSnowmanDecor(const float radii[3], int balls, int hat, int hatColor, bool facingRight, int frame);
Sprite makeSnowplow(float scale, int frame, bool facingRight);
// Heights of the ball centres above the snow a snowman stands on (y up), shared by drawing and physics.
inline void snowmanCentres(const float r[3], int n, float c[3]) {
  c[0] = r[0] * 0.92f;
  for (int i = 1; i < 3; ++i) c[i] = i < n ? c[i - 1] + (r[i - 1] + r[i]) * 0.82f : c[i - 1];
}
// A square app icon (snowflake on a blue disc), premultiplied BGRA, for the tray and the .ico file.
std::vector<uint32_t> makeIcon(int size);

}  // namespace snow
