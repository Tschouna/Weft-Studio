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
  float windX = 0.25f; // the wind: direction and strength, -1..1 (x right, y down), length up to 1
  float windY = 0.f;
  int flakes = 1;      // 0 small, 1 mixed, 2 big and fluffy
  bool pileWindows = true;
  bool pileTaskbar = true;
  bool icicles = true;
  bool mouse = true;
  bool snowmen = true;   // snowballs and snowmen on windows and the taskbar
  bool snowplow = true;  // a snowplow clears the taskbar now and then
  bool presents = true;
  bool overWindows = false; // false: falling snow (and the taskbar village) is on the desktop, behind every
                            // window; only the snow piled on top of windows shows. true: in front of everything
  bool decorations = true;  // the little houses, lamps and trees on the taskbar
  bool lights = true;       // strings of lights
};

// ------------------------------------------------------------------------------------- the layout
// What the user arranged: decorations standing on the taskbar and strings of lights.
enum DecoKind : int {
  kDecoHouse, kDecoHydrant, kDecoLamp, kDecoLantern, kDecoPine, kDecoFir, kDecoPresentRed, kDecoPresentBlue,
  kDecoBench, kDecoStall, kDecoSnowman, kDecoCandyCane, kDecoCount
};
const char* decoName(int kind);
struct Decoration {
  int kind = 0;
  int monitor = 0;     // index into the monitor list
  float pos = 0.5f;    // 0..1 across that monitor
};
// A joint on a window follows the window (fx, fy: where on its frame, 0..1); x, y is where it was last seen,
// and where a joint without a window hangs.
struct LightJoint {
  uint64_t window = 0;
  float fx = 0, fy = 0;
  float x = 0, y = 0;
};
enum LightColors : int { kLightsWarm, kLightsMulti, kLightsCool, kLightsRedGreen, kLightsGold, kLightsBlue, kLightColorCount };
const char* lightColorsName(int colors);
uint32_t lightColor(int colors, int index);  // 0xRRGGBB of bulb `index` in a string
struct LightString {
  std::vector<LightJoint> joints;
  float slack = 0.4f;  // 0 taut .. 1 droopy
  int colors = kLightsWarm;
};
struct Layout {
  std::vector<Decoration> decos;
  std::vector<LightString> lights;
};
Layout villageLayout();  // the default: a little village at both ends of the taskbar

// Editing the layout right on the desktop.
enum EditTool : int { kEditSelect, kEditDecoration, kEditLights };
enum EditPointer : int { kEditMove, kEditDown, kEditUp, kEditDouble, kEditRight, kEditLeave };
enum EditKey : int { kEditEnter, kEditEscape, kEditDelete };
enum Preset : int { kPresetVillage, kPresetGarland, kPresetCorners, kPresetBetweenWindows, kPresetCount };
enum EditHover : int { kHoverNone, kHoverDeco, kHoverJoint, kHoverString };
struct EditInfo {
  bool on = false;
  int tool = kEditSelect, decoKind = 0;
  bool building = false;   // adding joints to a new string
  int selString = -1;      // the selected string of lights, or -1
  float slack = 0.4f;
  int colors = 0;
  int hover = kHoverNone;
  bool dragging = false;
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

  void setLayout(const Layout& l);
  const Layout& layout() const;  // with the last known positions of joints on windows

  void editBegin();
  void editEnd(bool keep);            // keep=false puts the layout back as it was
  void editTool(int tool, int decoKind = 0);
  void editPointer(int event, float x, float y);
  void editKey(int key);
  void editSlack(float slack);        // for the selected string, and new ones
  void editColors(int colors);
  void editPreset(int preset);
  void editClear();
  EditInfo editInfo() const;

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
// Decorations, anchored at the middle of their base. Sizes in "units" (1 unit = scale px).
struct DecoGeom {
  float w, h;          // size
  float roofW, roofY;  // a flat top snow can settle on: its width and height above the ground (0: none)
  float glowY, glowR;  // a warm light: its height and reach (0: none)
};
DecoGeom decoGeom(int kind);
Sprite makeDecoration(int kind, float scale, int frame);
Sprite makeLightsIcon(float size);
// Heights of the ball centres above the snow a snowman stands on (y up), shared by drawing and physics.
inline void snowmanCentres(const float r[3], int n, float c[3]) {
  c[0] = r[0] * 0.92f;
  for (int i = 1; i < 3; ++i) c[i] = i < n ? c[i - 1] + (r[i - 1] + r[i]) * 0.82f : c[i - 1];
}
// A square app icon (snowflake on a blue disc), premultiplied BGRA, for the tray and the .ico file.
std::vector<uint32_t> makeIcon(int size);

}  // namespace snow
