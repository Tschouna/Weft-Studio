// Snowfall for Windows: the part that talks to Windows.
//  - One see-through, click-through, always-on-top layered window per screen; the engine draws into a DIB
//    and only the part that changed is handed to the compositor (UpdateLayeredWindowIndirect + dirty rect).
//  - The desktop's top-level windows are read in Z-order and kept up to date from WinEvent hooks, so piles
//    follow windows as they move without polling every window every frame.
//  - It goes to sleep (no drawing, drawing buffers freed) while paused, while the PC is locked or the screen
//    is off, and on a screen showing a full-screen game or video. It runs in Windows' efficiency mode.
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <windowsx.h>
#include <shellapi.h>
#include <shellscalingapi.h>
#include <dwmapi.h>
#include <wtsapi32.h>
#include <psapi.h>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <cwchar>
#include <string>
#include <vector>
#include "engine.h"
#include "resource.h"

#define SNOWFALL_VERSION L"1.0.0"

// Constants that older SDK headers may not have.
#ifndef CREATE_WAITABLE_TIMER_HIGH_RESOLUTION
#define CREATE_WAITABLE_TIMER_HIGH_RESOLUTION 0x00000002
#endif
#ifndef EVENT_OBJECT_CLOAKED
#define EVENT_OBJECT_CLOAKED 0x8017
#define EVENT_OBJECT_UNCLOAKED 0x8018
#endif
static const DWORD kDwmExtendedFrameBounds = 9, kDwmCloaked = 14, kDwmTransitionsForceDisabled = 3, kDwmCornerPreference = 33;
static const GUID kDisplayState = {0x6fe69556, 0x704a, 0x47a0, {0x8f, 0x24, 0xc2, 0x8d, 0x93, 0x6f, 0xda, 0x47}};

namespace {

const wchar_t* kMsgClass = L"SnowfallTray";
const wchar_t* kOverlayClass = L"SnowfallOverlay";
const UINT WM_APP_TRAY = WM_APP + 1, WM_APP_SECOND = WM_APP + 2;
enum : UINT {
  ID_PAUSE = 100,
  ID_AMOUNT0 = 110, ID_WIND0 = 120, ID_FLAKES0 = 130,
  ID_PILE_WIN = 140, ID_PILE_TASKBAR, ID_ICICLES, ID_MOUSE, ID_SNOWMEN, ID_PRESENTS, ID_PLOW, ID_PLOW_NOW,
  ID_SANTA0 = 150, ID_SANTA_NOW = 155,
  ID_STORM = 160, ID_SHAKE,
  ID_ALLSCREENS = 170, ID_FULLSCREEN, ID_STARTUP, ID_FPS0 = 175,
  ID_ABOUT = 180, ID_QUIT,
};
enum { HK_PAUSE = 1, HK_STORM, HK_SANTA, HK_PLOW };

// ---------------------------------------------------------------------------------------- settings
struct AppSettings {
  snow::Settings eng;
  int santa = 1;        // 0 never, 1 now and then, 2 often
  int fps = 1;          // 0 light (30), 1 smooth but 30 on battery, 2 always smooth (60)
  bool allScreens = true, fullscreenPause = true, paused = false, welcomed = false;
};
AppSettings S;
std::wstring gIni;

std::wstring appDataDir() {
  wchar_t buf[MAX_PATH] = {};
  DWORD n = GetEnvironmentVariableW(L"APPDATA", buf, MAX_PATH);
  std::wstring d = (n && n < MAX_PATH) ? std::wstring(buf) : std::wstring(L".");
  d += L"\\Snowfall";
  CreateDirectoryW(d.c_str(), nullptr);
  return d;
}
int iniInt(const wchar_t* key, int def) { return (int)GetPrivateProfileIntW(L"Snowfall", key, def, gIni.c_str()); }
void iniPut(const wchar_t* key, int v) { WritePrivateProfileStringW(L"Snowfall", key, std::to_wstring(v).c_str(), gIni.c_str()); }

void loadSettings() {
  gIni = appDataDir() + L"\\settings.ini";
  S.eng.amount = std::clamp(iniInt(L"Amount", 1), 0, 3);
  S.eng.wind = std::clamp(iniInt(L"Wind", 1), 0, 2);
  S.eng.flakes = std::clamp(iniInt(L"Flakes", 1), 0, 2);
  S.eng.pileWindows = iniInt(L"PileOnWindows", 1) != 0;
  S.eng.pileTaskbar = iniInt(L"PileOnTaskbar", 1) != 0;
  S.eng.icicles = iniInt(L"Icicles", 1) != 0;
  S.eng.mouse = iniInt(L"Mouse", 1) != 0;
  S.eng.snowmen = iniInt(L"Snowmen", 1) != 0;
  S.eng.snowplow = iniInt(L"Snowplow", 1) != 0;
  S.eng.presents = iniInt(L"Presents", 1) != 0;
  S.santa = std::clamp(iniInt(L"Santa", 1), 0, 2);
  S.fps = std::clamp(iniInt(L"Animation", 1), 0, 2);
  S.allScreens = iniInt(L"AllScreens", 1) != 0;
  S.fullscreenPause = iniInt(L"PauseForFullScreen", 1) != 0;
  S.paused = iniInt(L"Paused", 0) != 0;
  S.welcomed = iniInt(L"Welcomed", 0) != 0;
}
void saveSettings() {
  iniPut(L"Amount", S.eng.amount); iniPut(L"Wind", S.eng.wind); iniPut(L"Flakes", S.eng.flakes);
  iniPut(L"PileOnWindows", S.eng.pileWindows); iniPut(L"PileOnTaskbar", S.eng.pileTaskbar);
  iniPut(L"Icicles", S.eng.icicles); iniPut(L"Mouse", S.eng.mouse); iniPut(L"Snowmen", S.eng.snowmen); iniPut(L"Snowplow", S.eng.snowplow);
  iniPut(L"Presents", S.eng.presents); iniPut(L"Santa", S.santa); iniPut(L"Animation", S.fps);
  iniPut(L"AllScreens", S.allScreens); iniPut(L"PauseForFullScreen", S.fullscreenPause);
  iniPut(L"Paused", S.paused); iniPut(L"Welcomed", S.welcomed);
}

// Start with Windows: a value under HKCU\...\Run.
const wchar_t* kRunKey = L"Software\\Microsoft\\Windows\\CurrentVersion\\Run";
std::wstring exePath() {
  wchar_t p[MAX_PATH * 2] = {};
  GetModuleFileNameW(nullptr, p, (DWORD)std::size(p));
  return p;
}
std::wstring runCommand() { return L"\"" + exePath() + L"\" --autostart"; }
bool startupEnabled(std::wstring* current = nullptr) {
  HKEY k;
  if (RegOpenKeyExW(HKEY_CURRENT_USER, kRunKey, 0, KEY_READ, &k) != ERROR_SUCCESS) return false;
  wchar_t buf[MAX_PATH * 2 + 32] = {};
  DWORD type = 0, size = sizeof(buf) - sizeof(wchar_t);
  bool ok = RegQueryValueExW(k, L"Snowfall", nullptr, &type, (BYTE*)buf, &size) == ERROR_SUCCESS && type == REG_SZ;
  RegCloseKey(k);
  if (ok && current) *current = buf;
  return ok;
}
void setStartup(bool on) {
  HKEY k;
  if (RegOpenKeyExW(HKEY_CURRENT_USER, kRunKey, 0, KEY_SET_VALUE, &k) != ERROR_SUCCESS) return;
  if (on) {
    std::wstring cmd = runCommand();
    RegSetValueExW(k, L"Snowfall", 0, REG_SZ, (const BYTE*)cmd.c_str(), (DWORD)((cmd.size() + 1) * sizeof(wchar_t)));
  } else {
    RegDeleteValueW(k, L"Snowfall");
  }
  RegCloseKey(k);
}

// ---------------------------------------------------------------------------------------- state
HINSTANCE gInst;
HWND gMsgWnd;
snow::World gWorld;
DWORD gPid;
bool gWin11 = false;
bool gLocked = false, gDisplayOff = false, gOnBattery = false;
bool gWinDirty = true, gMonDirty = true;
std::vector<HWND> gMoved;
std::vector<snow::Win> gZ;     // last window list, topmost first
std::vector<HWND> gZh;
std::vector<uint64_t> gKeep;
UINT gTaskbarCreated = 0;
bool gHotkeys[5] = {};
NOTIFYICONDATAW gNid = {};
double gNextSanta = 0;
LARGE_INTEGER gFreq;

double now() {
  LARGE_INTEGER t;
  QueryPerformanceCounter(&t);
  return (double)t.QuadPart / (double)gFreq.QuadPart;
}

struct Overlay {
  HMONITOR mon = nullptr;
  RECT rc{};
  HWND hwnd = nullptr;
  HDC dc = nullptr;
  HBITMAP bmp = nullptr, old = nullptr;
  uint32_t* bits = nullptr;
  bool fresh = true, shown = false;
  int w() const { return rc.right - rc.left; }
  int h() const { return rc.bottom - rc.top; }
};
std::vector<Overlay> gOv;  // parallel to gWorld.monitors()

struct MonRec { HMONITOR h; RECT rc, work; float scale; bool primary; };

// ---------------------------------------------------------------------------------------- overlays
LRESULT CALLBACK overlayProc(HWND h, UINT m, WPARAM w, LPARAM l) {
  switch (m) {
    case WM_NCHITTEST: return HTTRANSPARENT;
    case WM_MOUSEACTIVATE: return MA_NOACTIVATE;
    case WM_DPICHANGED: gMonDirty = true; return 0;  // keep our size: we are sized in physical pixels
    case WM_ERASEBKGND: return 1;
  }
  return DefWindowProcW(h, m, w, l);
}

void freeBuffer(Overlay& o) {
  if (o.dc) {
    SelectObject(o.dc, o.old);
    DeleteObject(o.bmp);
    DeleteDC(o.dc);
  }
  o.dc = nullptr; o.bmp = o.old = nullptr; o.bits = nullptr;
  o.fresh = true;
}
void hideOverlay(Overlay& o) {
  if (o.hwnd && o.shown) ShowWindow(o.hwnd, SW_HIDE);
  o.shown = false;
  freeBuffer(o);
}
void destroyOverlay(Overlay& o) {
  freeBuffer(o);
  if (o.hwnd) DestroyWindow(o.hwnd);
  o.hwnd = nullptr;
  o.shown = false;
}
bool ensureBuffer(Overlay& o) {
  if (o.bits) return true;
  if (!o.hwnd) {
    o.hwnd = CreateWindowExW(WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                             kOverlayClass, L"Snowfall", WS_POPUP, o.rc.left, o.rc.top, o.w(), o.h(), nullptr, nullptr, gInst, nullptr);
    if (!o.hwnd) return false;
    BOOL on = TRUE;
    DwmSetWindowAttribute(o.hwnd, kDwmTransitionsForceDisabled, &on, sizeof on);
    int noRound = 1;  // DWMWCP_DONOTROUND
    DwmSetWindowAttribute(o.hwnd, kDwmCornerPreference, &noRound, sizeof noRound);
  }
  BITMAPINFO bi = {};
  bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
  bi.bmiHeader.biWidth = o.w();
  bi.bmiHeader.biHeight = -o.h();  // top-down
  bi.bmiHeader.biPlanes = 1;
  bi.bmiHeader.biBitCount = 32;
  bi.bmiHeader.biCompression = BI_RGB;
  HDC screen = GetDC(nullptr);
  o.dc = CreateCompatibleDC(screen);
  void* bits = nullptr;
  o.bmp = CreateDIBSection(screen, &bi, DIB_RGB_COLORS, &bits, nullptr, 0);
  ReleaseDC(nullptr, screen);
  if (!o.bmp || !o.dc) { if (o.dc) DeleteDC(o.dc); if (o.bmp) DeleteObject(o.bmp); o.dc = nullptr; o.bmp = nullptr; return false; }
  o.old = (HBITMAP)SelectObject(o.dc, o.bmp);
  o.bits = (uint32_t*)bits;  // a fresh DIB section is all zero: fully transparent
  o.fresh = true;
  return true;
}
void present(Overlay& o, const snow::Rect& dirty) {
  GdiFlush();
  POINT dst{o.rc.left, o.rc.top}, src{0, 0};
  SIZE sz{o.w(), o.h()};
  BLENDFUNCTION bf{AC_SRC_OVER, 0, 255, AC_SRC_ALPHA};
  RECT d{dirty.l, dirty.t, dirty.r, dirty.b};
  UPDATELAYEREDWINDOWINFO u = {};
  u.cbSize = sizeof u;
  u.pptDst = &dst; u.psize = &sz; u.hdcSrc = o.dc; u.pptSrc = &src; u.pblend = &bf; u.dwFlags = ULW_ALPHA;
  u.prcDirty = o.fresh ? nullptr : &d;
  UpdateLayeredWindowIndirect(o.hwnd, &u);
  o.fresh = false;
  if (!o.shown) {
    ShowWindow(o.hwnd, SW_SHOWNOACTIVATE);
    SetWindowPos(o.hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
    o.shown = true;
  }
}

// ---------------------------------------------------------------------------------------- screens
BOOL CALLBACK monEnum(HMONITOR h, HDC, LPRECT, LPARAM lp) {
  auto* v = (std::vector<MonRec>*)lp;
  MONITORINFO mi = {sizeof mi};
  if (!GetMonitorInfoW(h, &mi)) return TRUE;
  UINT dx = 96, dy = 96;
  if (FAILED(GetDpiForMonitor(h, MDT_EFFECTIVE_DPI, &dx, &dy))) dx = 96;
  v->push_back({h, mi.rcMonitor, mi.rcWork, dx / 96.f, (mi.dwFlags & MONITORINFOF_PRIMARY) != 0});
  return TRUE;
}

bool isShellClass(const wchar_t* c) {
  return !wcscmp(c, L"Progman") || !wcscmp(c, L"WorkerW") || !wcscmp(c, L"Shell_TrayWnd") || !wcscmp(c, L"Shell_SecondaryTrayWnd");
}

// The screen a full-screen game, video or presentation is showing on, if any.
HMONITOR fullscreenMonitor() {
  HWND fg = GetForegroundWindow();
  if (!fg) return nullptr;
  DWORD pid = 0;
  GetWindowThreadProcessId(fg, &pid);
  if (pid == gPid) return nullptr;
  QUERY_USER_NOTIFICATION_STATE q;
  bool d3d = SUCCEEDED(SHQueryUserNotificationState(&q)) && (q == QUNS_RUNNING_D3D_FULL_SCREEN || q == QUNS_PRESENTATION_MODE);
  wchar_t cls[64] = {};
  GetClassNameW(fg, cls, 64);
  if (isShellClass(cls)) return nullptr;
  HMONITOR m = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
  if (d3d) return m;
  RECT r;
  MONITORINFO mi = {sizeof mi};
  if (!GetWindowRect(fg, &r) || !GetMonitorInfoW(m, &mi)) return nullptr;
  bool covers = r.left <= mi.rcMonitor.left && r.top <= mi.rcMonitor.top && r.right >= mi.rcMonitor.right && r.bottom >= mi.rcMonitor.bottom;
  LONG st = GetWindowLongW(fg, GWL_STYLE);
  if (covers && IsZoomed(fg) && (st & WS_CAPTION) == WS_CAPTION) covers = false;  // just maximised, with an auto-hiding taskbar
  return covers ? m : nullptr;
}

std::vector<MonRec> gMonRecs;

// Re-reads the screens (and which are busy with a full-screen app); returns true if anything changed.
bool refreshMonitors() {
  std::vector<MonRec> recs;
  EnumDisplayMonitors(nullptr, nullptr, monEnum, (LPARAM)&recs);
  std::stable_sort(recs.begin(), recs.end(), [](const MonRec& a, const MonRec& b) { return a.primary > b.primary; });
  if (!S.allScreens && recs.size() > 1) recs.erase(recs.begin() + 1, recs.end());
  gMonRecs = recs;
  // taskbars
  std::vector<std::pair<HWND, RECT>> bars;
  if (HWND t = FindWindowW(L"Shell_TrayWnd", nullptr)) { RECT r; if (GetWindowRect(t, &r)) bars.push_back({t, r}); }
  for (HWND t = nullptr; (t = FindWindowExW(nullptr, t, L"Shell_SecondaryTrayWnd", nullptr));) { RECT r; if (GetWindowRect(t, &r)) bars.push_back({t, r}); }
  HMONITOR fs = S.fullscreenPause ? fullscreenMonitor() : nullptr;

  std::vector<snow::Monitor> mons;
  for (auto& m : recs) {
    snow::Monitor x;
    x.id = (uint64_t)(uintptr_t)m.h;
    x.r = {m.rc.left, m.rc.top, m.rc.right, m.rc.bottom};
    x.scale = m.scale;
    x.groundY = m.work.bottom < m.rc.bottom ? m.work.bottom : m.rc.bottom;
    for (auto& b : bars)
      if (MonitorFromWindow(b.first, MONITOR_DEFAULTTONULL) == m.h && std::abs(b.second.top - x.groundY) <= 2 && b.second.bottom >= m.rc.bottom - 2)
        x.taskbar = (uint64_t)(uintptr_t)b.first;
    x.active = m.h != fs;
    mons.push_back(x);
  }
  const auto& cur = gWorld.monitors();
  bool same = cur.size() == mons.size();
  for (size_t i = 0; same && i < mons.size(); ++i) {
    const auto &a = cur[i], &b = mons[i];
    same = a.id == b.id && a.r.l == b.r.l && a.r.t == b.r.t && a.r.r == b.r.r && a.r.b == b.r.b && a.groundY == b.groundY &&
           a.taskbar == b.taskbar && a.scale == b.scale && a.active == b.active;
  }
  if (same) return false;
  gWorld.setMonitors(mons);
  // overlays: keep the ones whose screen did not change
  std::vector<Overlay> next(mons.size());
  for (size_t j = 0; j < mons.size(); ++j) {
    next[j].mon = recs[j].h;
    next[j].rc = recs[j].rc;
    for (auto& o : gOv)
      if (o.hwnd && o.mon == recs[j].h && EqualRect(&o.rc, &recs[j].rc)) { next[j] = o; o.hwnd = nullptr; o.dc = nullptr; break; }
    // the engine starts this screen over, so start from a clear picture
    if (next[j].bits) std::memset(next[j].bits, 0, (size_t)next[j].w() * next[j].h() * 4);
    next[j].fresh = true;
    if (!mons[j].active) hideOverlay(next[j]);
  }
  for (auto& o : gOv) destroyOverlay(o);
  gOv.swap(next);
  gWinDirty = true;
  return true;
}

const MonRec* monitorAt(int x, int y) {
  for (auto& m : gMonRecs) if (x >= m.rc.left && x < m.rc.right && y >= m.rc.top && y < m.rc.bottom) return &m;
  return nullptr;
}

// ---------------------------------------------------------------------------------------- windows
const wchar_t* const kNotApps[] = {
    L"Windows.UI.Core.CoreWindow", L"XamlExplorerHostIslandWindow", L"TopLevelWindowForOverflowXamlIsland", L"Shell_InputSwitchTopLevelWindow",
    L"NotifyIconOverflowWindow", L"#32768", L"tooltips_class32", L"SysShadow", L"MultitaskingViewFrame", L"ForegroundStaging",
    L"Xaml_WindowedPopupClass", L"TaskListThumbnailWnd", L"Shell_LightDismissOverlay", L"ThumbnailDeviceHelperWnd",
};

enum class Seen { Skip, Keep, Use };

// Describes one top-level window for the engine: what kind it is and where its visible frame is.
Seen describe(HWND h, snow::Win& out) {
  if (!IsWindowVisible(h)) return Seen::Skip;
  DWORD pid = 0;
  GetWindowThreadProcessId(h, &pid);
  if (pid == gPid) return Seen::Skip;
  if (IsIconic(h)) return Seen::Skip;  // minimised: its snow falls off
  BOOL cloaked = FALSE;
  DwmGetWindowAttribute(h, kDwmCloaked, &cloaked, sizeof cloaked);
  if (cloaked) return Seen::Keep;  // on another virtual desktop, or a suspended app: its snow waits for it
  LONG st = GetWindowLongW(h, GWL_STYLE), ex = GetWindowLongW(h, GWL_EXSTYLE);
  if (ex & WS_EX_TRANSPARENT) return Seen::Skip;  // click-through overlays hide nothing
  if (ex & WS_EX_LAYERED) {
    BYTE a = 255; DWORD fl = 0; COLORREF key;
    if (GetLayeredWindowAttributes(h, &key, &a, &fl) && (fl & LWA_ALPHA) && a < 40) return Seen::Skip;
  }
  RECT r;
  if (FAILED(DwmGetWindowAttribute(h, kDwmExtendedFrameBounds, &r, sizeof r))) GetWindowRect(h, &r);
  if (r.right - r.left < 2 || r.bottom - r.top < 2) return Seen::Skip;
  wchar_t cls[96] = {};
  GetClassNameW(h, cls, 96);
  if (!wcscmp(cls, L"Progman") || !wcscmp(cls, L"WorkerW")) return Seen::Skip;
  out.id = (uint64_t)(uintptr_t)h;
  out.r = {r.left, r.top, r.right, r.bottom};
  out.kind = snow::Kind::Occluder;
  out.corner = 0;
  if (!wcscmp(cls, L"Shell_TrayWnd") || !wcscmp(cls, L"Shell_SecondaryTrayWnd")) { out.kind = snow::Kind::Taskbar; return Seen::Use; }
  const MonRec* m = monitorAt((r.left + r.right) / 2, std::max(r.top, (r.top + r.bottom) / 2 - 1));
  bool coversScreen = m && r.left <= m->rc.left && r.top <= m->rc.top && r.right >= m->rc.right && r.bottom >= m->rc.bottom;
  // Invisible full-screen topmost windows (some overlays) would hide every pile.
  if (coversScreen && (ex & WS_EX_TOPMOST)) return Seen::Skip;
  bool app = !(st & WS_CHILD) && !(ex & WS_EX_TOOLWINDOW) && !IsZoomed(h) && !coversScreen;
  for (auto* c : kNotApps) if (app && !wcscmp(cls, c)) app = false;
  if (app && (st & WS_CAPTION) != WS_CAPTION) {
    wchar_t t[4];
    if (InternalGetWindowText(h, t, 4) == 0) app = false;  // (never sends a message, so a hung app can't stall us)
  }
  const MonRec* top = monitorAt((r.left + r.right) / 2, r.top);
  if (app) {
    float sc = top ? top->scale : 1.f;
    if (!top || r.top < top->rc.top + 2 || r.right - r.left < 120 * sc || r.bottom - r.top < 60 * sc) app = false;
  }
  if (app) {
    out.kind = snow::Kind::Window;
    out.corner = gWin11 ? (int)std::lround(8 * (top ? top->scale : 1.f)) : 0;
  }
  return Seen::Use;
}

struct EnumCtx { std::vector<snow::Win>* z; std::vector<HWND>* zh; std::vector<uint64_t>* keep; };
BOOL CALLBACK winEnum(HWND h, LPARAM lp) {
  auto* c = (EnumCtx*)lp;
  snow::Win w;
  Seen s = describe(h, w);
  if (s == Seen::Use) { c->z->push_back(w); c->zh->push_back(h); }
  else if (s == Seen::Keep) c->keep->push_back((uint64_t)(uintptr_t)h);
  return TRUE;
}

void refreshWindows() {
  if (gWinDirty) {
    gZ.clear(); gZh.clear(); gKeep.clear();
    EnumCtx c{&gZ, &gZh, &gKeep};
    EnumWindows(winEnum, (LPARAM)&c);
    gWinDirty = false;
    gMoved.clear();
    gWorld.setWindows(gZ, gKeep);
    return;
  }
  if (gMoved.empty()) return;
  // Only windows we already know moved or resized: update just those.
  std::sort(gMoved.begin(), gMoved.end());
  gMoved.erase(std::unique(gMoved.begin(), gMoved.end()), gMoved.end());
  for (HWND h : gMoved) {
    auto it = std::find(gZh.begin(), gZh.end(), h);
    if (it == gZh.end()) continue;
    size_t i = (size_t)(it - gZh.begin());
    snow::Win w;
    if (describe(h, w) != Seen::Use || w.kind != gZ[i].kind) { gWinDirty = true; break; }
    gZ[i] = w;
  }
  gMoved.clear();
  if (gWinDirty) { refreshWindows(); return; }
  gWorld.setWindows(gZ, gKeep);
}

void CALLBACK winEvent(HWINEVENTHOOK, DWORD ev, HWND h, LONG obj, LONG child, DWORD, DWORD) {
  if (obj != OBJID_WINDOW || child != CHILDID_SELF || !h) return;
  if (ev == EVENT_OBJECT_LOCATIONCHANGE) {
    if (std::find(gZh.begin(), gZh.end(), h) != gZh.end()) gMoved.push_back(h);
    return;
  }
  if (ev == EVENT_OBJECT_DESTROY) {
    if (std::find(gZh.begin(), gZh.end(), h) != gZh.end()) gWinDirty = true;
    return;
  }
  if ((ev == EVENT_OBJECT_SHOW || ev == EVENT_OBJECT_HIDE) && GetAncestor(h, GA_ROOT) != h) return;
  gWinDirty = true;
}

// ---------------------------------------------------------------------------------------- tray
bool frame();
double frameInterval();
// Menus and message boxes run their own message loop; a plain timer keeps the snow going meanwhile.
const UINT_PTR kModalTimer = 7;
struct ModalFrames {
  ModalFrames() { SetTimer(gMsgWnd, kModalTimer, (UINT)(frameInterval() * 1000), nullptr); }
  ~ModalFrames() { KillTimer(gMsgWnd, kModalTimer); }
};

std::wstring hk(int id, const wchar_t* keys) { return gHotkeys[id] ? std::wstring(L"\t") + keys : std::wstring(); }

void showMenu(POINT pt) {
  HMENU m = CreatePopupMenu();
  auto add = [](HMENU mm, UINT id, const std::wstring& text, bool checked = false, bool enabled = true) {
    AppendMenuW(mm, MF_STRING | (checked ? MF_CHECKED : 0) | (enabled ? 0 : MF_GRAYED), id, text.c_str());
  };
  auto radio = [&](const wchar_t* title, UINT first, std::initializer_list<const wchar_t*> items, int cur) {
    HMENU sub = CreatePopupMenu();
    UINT i = 0;
    for (auto* t : items) add(sub, first + i++, t);
    CheckMenuRadioItem(sub, first, first + i - 1, first + cur, MF_BYCOMMAND);
    AppendMenuW(m, MF_POPUP, (UINT_PTR)sub, title);
    return sub;
  };
  add(m, ID_PAUSE, (S.paused ? std::wstring(L"Let it snow") : std::wstring(L"Pause the snow")) + hk(HK_PAUSE, L"Ctrl+Alt+S"));
  AppendMenuW(m, MF_SEPARATOR, 0, nullptr);
  radio(L"How much snow", ID_AMOUNT0, {L"Light flurry", L"Steady snow", L"Heavy snow", L"Blizzard"}, S.eng.amount);
  radio(L"Wind", ID_WIND0, {L"Calm", L"Breeze", L"Stormy"}, S.eng.wind);
  radio(L"Flakes", ID_FLAKES0, {L"Small", L"Mixed", L"Big and fluffy"}, S.eng.flakes);
  AppendMenuW(m, MF_SEPARATOR, 0, nullptr);
  add(m, ID_PILE_WIN, L"Snow piles up on windows", S.eng.pileWindows);
  add(m, ID_PILE_TASKBAR, L"Snow piles up on the taskbar", S.eng.pileTaskbar);
  add(m, ID_ICICLES, L"Icicles", S.eng.icicles, S.eng.pileWindows);
  add(m, ID_SNOWMEN, L"Snowmen and snowballs", S.eng.snowmen);
  add(m, ID_PLOW, L"A snowplow clears the taskbar", S.eng.snowplow, S.eng.pileTaskbar);
  add(m, ID_MOUSE, L"The mouse plays with the snow", S.eng.mouse);
  AppendMenuW(m, MF_SEPARATOR, 0, nullptr);
  HMENU santa = radio(L"Santa", ID_SANTA0, {L"Never", L"Now and then", L"Often"}, S.santa);
  AppendMenuW(santa, MF_SEPARATOR, 0, nullptr);
  add(santa, ID_PRESENTS, L"He drops presents", S.eng.presents);
  add(santa, ID_SANTA_NOW, std::wstring(L"Call Santa now") + hk(HK_SANTA, L"Ctrl+Alt+H"), false, !S.paused);
  add(m, ID_PLOW_NOW, std::wstring(L"Send the snowplow") + hk(HK_PLOW, L"Ctrl+Alt+P"), false, !S.paused && S.eng.pileTaskbar);
  add(m, ID_STORM, std::wstring(L"Snowstorm for 30 seconds") + hk(HK_STORM, L"Ctrl+Alt+B"), false, !S.paused);
  add(m, ID_SHAKE, L"Shake all the snow off", false, !S.paused);
  AppendMenuW(m, MF_SEPARATOR, 0, nullptr);
  HMENU more = CreatePopupMenu();
  add(more, ID_ALLSCREENS, L"Snow on every screen", S.allScreens);
  add(more, ID_FULLSCREEN, L"Pause for full-screen games and videos", S.fullscreenPause);
  add(more, ID_STARTUP, L"Start with Windows", startupEnabled());
  AppendMenuW(more, MF_SEPARATOR, 0, nullptr);
  add(more, ID_FPS0 + 0, L"Lightest on the computer (30 fps)");
  add(more, ID_FPS0 + 1, L"Smooth, saves power on battery");
  add(more, ID_FPS0 + 2, L"Smoothest animation (60 fps)");
  CheckMenuRadioItem(more, ID_FPS0, ID_FPS0 + 2, ID_FPS0 + S.fps, MF_BYCOMMAND);
  AppendMenuW(m, MF_POPUP, (UINT_PTR)more, L"Settings");
  add(m, ID_ABOUT, L"About Snowfall");
  add(m, ID_QUIT, L"Quit");
  SetForegroundWindow(gMsgWnd);
  ModalFrames keep;
  TrackPopupMenuEx(m, TPM_RIGHTBUTTON | TPM_BOTTOMALIGN | (GetSystemMetrics(SM_MENUDROPALIGNMENT) ? TPM_RIGHTALIGN : TPM_LEFTALIGN), pt.x, pt.y, gMsgWnd, nullptr);
  PostMessageW(gMsgWnd, WM_NULL, 0, 0);
  DestroyMenu(m);
}

HICON loadIcon(int size) { return (HICON)LoadImageW(gInst, MAKEINTRESOURCEW(IDI_APP), IMAGE_ICON, size, size, LR_DEFAULTCOLOR); }

void trayAdd() {
  gNid = {};
  gNid.cbSize = sizeof gNid;
  gNid.hWnd = gMsgWnd;
  gNid.uID = 1;
  gNid.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP | NIF_SHOWTIP;
  gNid.uCallbackMessage = WM_APP_TRAY;
  UINT dpi = GetDpiForWindow(gMsgWnd);
  gNid.hIcon = loadIcon(GetSystemMetricsForDpi(SM_CXSMICON, dpi ? dpi : 96));
  wcscpy_s(gNid.szTip, L"Snowfall");
  Shell_NotifyIconW(NIM_ADD, &gNid);
  gNid.uVersion = NOTIFYICON_VERSION_4;
  Shell_NotifyIconW(NIM_SETVERSION, &gNid);
}
void trayTip() {
  gNid.uFlags = NIF_TIP | NIF_SHOWTIP;
  wcscpy_s(gNid.szTip, S.paused ? L"Snowfall (paused)" : L"Snowfall");
  Shell_NotifyIconW(NIM_MODIFY, &gNid);
}
void trayBalloon(const wchar_t* title, const wchar_t* text) {
  gNid.uFlags = NIF_INFO;
  wcscpy_s(gNid.szInfoTitle, title);
  wcscpy_s(gNid.szInfo, text);
  gNid.dwInfoFlags = NIIF_USER | NIIF_LARGE_ICON;
  Shell_NotifyIconW(NIM_MODIFY, &gNid);
}

// ---------------------------------------------------------------------------------------- run state
bool sleeping() { return S.paused || gLocked || gDisplayOff; }

void goToSleep() {
  for (auto& o : gOv) hideOverlay(o);
  // give the memory back while nothing is drawn
  SetProcessWorkingSetSize(GetCurrentProcess(), (SIZE_T)-1, (SIZE_T)-1);
}

void scheduleSanta(double from) {
  static const double minutes[3] = {0, 10, 4};
  if (S.santa == 0) { gNextSanta = 1e300; return; }
  double m = minutes[S.santa] * (0.6 + 0.8 * ((GetTickCount() % 1000) / 1000.0));
  gNextSanta = from + m * 60;
}

void apply() {
  gWorld.configure(S.eng);
  saveSettings();
  trayTip();
}

void setPaused(bool p) {
  if (S.paused == p) return;
  S.paused = p;
  apply();
  if (sleeping()) goToSleep();
  else { gMonDirty = true; gWinDirty = true; }
}

void command(UINT id) {
  if (id >= ID_AMOUNT0 && id < ID_AMOUNT0 + 4) { S.eng.amount = id - ID_AMOUNT0; apply(); return; }
  if (id >= ID_WIND0 && id < ID_WIND0 + 3) { S.eng.wind = id - ID_WIND0; apply(); return; }
  if (id >= ID_FLAKES0 && id < ID_FLAKES0 + 3) { S.eng.flakes = id - ID_FLAKES0; apply(); return; }
  if (id >= ID_SANTA0 && id < ID_SANTA0 + 3) { S.santa = id - ID_SANTA0; scheduleSanta(now()); apply(); return; }
  if (id >= ID_FPS0 && id < ID_FPS0 + 3) { S.fps = id - ID_FPS0; apply(); return; }
  switch (id) {
    case ID_PAUSE: setPaused(!S.paused); break;
    case ID_PILE_WIN: S.eng.pileWindows = !S.eng.pileWindows; apply(); break;
    case ID_PILE_TASKBAR: S.eng.pileTaskbar = !S.eng.pileTaskbar; apply(); break;
    case ID_ICICLES: S.eng.icicles = !S.eng.icicles; apply(); break;
    case ID_MOUSE: S.eng.mouse = !S.eng.mouse; apply(); break;
    case ID_SNOWMEN: S.eng.snowmen = !S.eng.snowmen; apply(); break;
    case ID_PLOW: S.eng.snowplow = !S.eng.snowplow; apply(); break;
    case ID_PLOW_NOW: gWorld.sendPlow(); break;
    case ID_PRESENTS: S.eng.presents = !S.eng.presents; apply(); break;
    case ID_SANTA_NOW: gWorld.sendSanta(); break;
    case ID_STORM: gWorld.snowstorm(30); break;
    case ID_SHAKE: gWorld.shakeAll(); break;
    case ID_ALLSCREENS: S.allScreens = !S.allScreens; apply(); gMonDirty = true; break;
    case ID_FULLSCREEN: S.fullscreenPause = !S.fullscreenPause; apply(); gMonDirty = true; break;
    case ID_STARTUP: setStartup(!startupEnabled()); break;
    case ID_ABOUT: {
      PROCESS_MEMORY_COUNTERS_EX pm = {};
      pm.cb = sizeof pm;
      GetProcessMemoryInfo(GetCurrentProcess(), (PROCESS_MEMORY_COUNTERS*)&pm, sizeof pm);
      snow::Stats st = gWorld.stats();
      wchar_t text[1024];
      swprintf(text, 1024,
               L"Snowfall %ls\n\nSnow for your Windows desktop.\n\nRight now: %d snowflakes in the air, using %.1f MB of memory.\n\n"
               L"Things to try:\n"
               L"\x2022  Push a snowball with the mouse: it rolls and grows as it picks up snow.\n"
               L"\x2022  Roll a smaller snowball into a bigger one to build a snowman.\n"
               L"\x2022  Flick the mouse fast through a snowman, or through a pile of snow.\n"
               L"\x2022  Shake, minimise or close a window with snow on it.\n"
               L"\x2022  Ctrl+Alt+S pauses, Ctrl+Alt+B snowstorm, Ctrl+Alt+H Santa, Ctrl+Alt+P snowplow.",
               SNOWFALL_VERSION, st.flakes, pm.PrivateUsage / 1048576.0);
      ModalFrames keep;
      MessageBoxW(nullptr, text, L"About Snowfall", MB_OK | MB_ICONINFORMATION | MB_SETFOREGROUND);
      break;
    }
    case ID_QUIT: DestroyWindow(gMsgWnd); break;
  }
}

LRESULT CALLBACK msgProc(HWND h, UINT m, WPARAM w, LPARAM l) {
  if (gTaskbarCreated && m == gTaskbarCreated) { trayAdd(); trayTip(); gMonDirty = true; return 0; }
  switch (m) {
    case WM_APP_TRAY:
      switch (LOWORD(l)) {
        case NIN_SELECT: case NIN_KEYSELECT: case WM_CONTEXTMENU: {
          POINT pt{GET_X_LPARAM(w), GET_Y_LPARAM(w)};
          showMenu(pt);
          break;
        }
      }
      return 0;
    case WM_COMMAND: command(LOWORD(w)); return 0;
    case WM_TIMER:
      if (w == kModalTimer && !sleeping()) frame();
      return 0;
    case WM_HOTKEY:
      if (w == HK_PAUSE) setPaused(!S.paused);
      else if (w == HK_STORM && !S.paused) gWorld.snowstorm(30);
      else if (w == HK_SANTA && !S.paused) gWorld.sendSanta();
      else if (w == HK_PLOW && !S.paused) gWorld.sendPlow();
      return 0;
    case WM_APP_SECOND:  // started again while running
      if (S.paused) setPaused(false); else gWorld.sendSanta();
      return 0;
    case WM_DISPLAYCHANGE: case WM_DPICHANGED: gMonDirty = true; return 0;
    case WM_SETTINGCHANGE: if (w == SPI_SETWORKAREA) gMonDirty = true; return 0;
    case WM_WTSSESSION_CHANGE:
      if (w == WTS_SESSION_LOCK || w == WTS_CONSOLE_DISCONNECT || w == WTS_REMOTE_DISCONNECT) { gLocked = true; goToSleep(); }
      else if (w == WTS_SESSION_UNLOCK || w == WTS_CONSOLE_CONNECT || w == WTS_REMOTE_CONNECT) { gLocked = false; gMonDirty = gWinDirty = true; }
      return 0;
    case WM_POWERBROADCAST:
      if (w == PBT_POWERSETTINGCHANGE) {
        auto* p = (POWERBROADCAST_SETTING*)l;
        if (p && IsEqualGUID(p->PowerSetting, kDisplayState) && p->DataLength >= sizeof(DWORD)) {
          gDisplayOff = *(const DWORD*)p->Data == 0;
          if (gDisplayOff) goToSleep(); else gMonDirty = gWinDirty = true;
        }
      } else if (w == PBT_APMRESUMEAUTOMATIC || w == PBT_APMRESUMESUSPEND) {
        gMonDirty = gWinDirty = true;
      }
      return TRUE;
    case WM_DESTROY: PostQuitMessage(0); return 0;
  }
  return DefWindowProcW(h, m, w, l);
}

// ---------------------------------------------------------------------------------------- frames
struct FrameStats { double ms = 0, worst = 0; long n = 0; };
FrameStats gStats;
double gLast = 0, gLastCheck = 0, gLastTop = 0;

// One animation frame. Returns false when there is nothing to animate (all screens asleep).
bool frame() {
  double t = now();
  double dt = gLast ? t - gLast : 0;
  gLast = t;
  if (t - gLastCheck > 1.0) {  // once a second: full-screen apps, battery
    gLastCheck = t;
    gMonDirty = true;
    SYSTEM_POWER_STATUS ps;
    gOnBattery = GetSystemPowerStatus(&ps) && ps.ACLineStatus == 0;
  }
  if (gMonDirty) { gMonDirty = false; refreshMonitors(); }
  bool any = false;
  for (auto& m : gWorld.monitors()) any |= m.active;
  if (!any) { gLast = 0; return false; }
  refreshWindows();
  POINT p;
  bool ok = GetCursorPos(&p);
  gWorld.setCursor((float)p.x, (float)p.y, ok);
  if (t >= gNextSanta) { gWorld.sendSanta(); scheduleSanta(t); }
  gWorld.update((float)dt);
  const auto& mons = gWorld.monitors();
  for (size_t i = 0; i < gOv.size() && i < mons.size(); ++i) {
    Overlay& o = gOv[i];
    if (!mons[i].active) continue;
    if (!ensureBuffer(o)) continue;
    snow::Target tg{o.bits, o.w(), o.h(), o.w()};
    bool fresh = o.fresh;
    snow::Rect d = gWorld.render((int)i, tg, fresh);
    if (fresh || !d.empty()) present(o, d);
  }
  if (t - gLastTop > 2.0) {  // stay above other always-on-top windows (the taskbar likes to come forward)
    gLastTop = t;
    for (auto& o : gOv) if (o.shown) SetWindowPos(o.hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
  }
  double ms = (now() - t) * 1000;
  gStats.ms += ms; gStats.worst = std::max(gStats.worst, ms); gStats.n++;
  return true;
}

double frameInterval() {
  bool smooth = S.fps == 2 || (S.fps == 1 && !gOnBattery);
  return smooth ? 1.0 / 60 : 1.0 / 30;
}

void setEfficiencyMode() {
  // EcoQoS: Windows runs us on efficiency cores at a low clock. The snow is a decoration; it should never
  // slow down anything else. (Windows 11 shows the green leaf for this in Task Manager.)
  struct PPT { ULONG Version, ControlMask, StateMask; } st{1, 0x1, 0x1};  // PROCESS_POWER_THROTTLING_EXECUTION_SPEED
  typedef BOOL(WINAPI * SetInfo)(HANDLE, int, LPVOID, DWORD);
  if (auto f = (SetInfo)(void*)GetProcAddress(GetModuleHandleW(L"kernel32.dll"), "SetProcessInformation")) f(GetCurrentProcess(), 4 /*ProcessPowerThrottling*/, &st, sizeof st);
  SetPriorityClass(GetCurrentProcess(), BELOW_NORMAL_PRIORITY_CLASS);
}

bool isWindows11() {
  typedef LONG(WINAPI * RtlGetVersionFn)(OSVERSIONINFOW*);
  OSVERSIONINFOW v = {sizeof v};
  if (auto f = (RtlGetVersionFn)(void*)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "RtlGetVersion")) f(&v);
  return v.dwMajorVersion > 10 || (v.dwMajorVersion == 10 && v.dwBuildNumber >= 22000);
}

}  // namespace

// ---------------------------------------------------------------------------------------- main
int WINAPI wWinMain(HINSTANCE inst, HINSTANCE, PWSTR, int) {
  gInst = inst;
  gPid = GetCurrentProcessId();
  QueryPerformanceFrequency(&gFreq);
  int argc = 0;
  LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  bool autostart = false;
  double selftest = 0;
  std::wstring selftestOut;
  for (int i = 1; i < argc; ++i) {
    if (!wcscmp(argv[i], L"--autostart")) autostart = true;
    else if (!wcscmp(argv[i], L"--selftest") && i + 2 < argc) { selftest = _wtof(argv[i + 1]); selftestOut = argv[i + 2]; i += 2; }
  }
  LocalFree(argv);

  HANDLE mutex = CreateMutexW(nullptr, TRUE, L"Local\\Snowfall-single-instance");
  if (GetLastError() == ERROR_ALREADY_EXISTS && !selftest) {
    if (HWND other = FindWindowW(kMsgClass, nullptr)) PostMessageW(other, WM_APP_SECOND, 0, 0);
    return 0;
  }
  // Per-monitor DPI awareness (also in the manifest): we work in real pixels on every screen.
  typedef BOOL(WINAPI * SetCtx)(HANDLE);
  if (auto f = (SetCtx)(void*)GetProcAddress(GetModuleHandleW(L"user32.dll"), "SetProcessDpiAwarenessContext")) f((HANDLE)-4);
  setEfficiencyMode();
  gWin11 = isWindows11();
  loadSettings();
  if (selftest) { S.paused = false; S.eng.amount = 2; S.santa = 0; }
  {  // keep the start-up entry pointing at this copy of the program if it was moved
    std::wstring cur;
    if (startupEnabled(&cur) && cur != runCommand()) setStartup(true);
  }

  WNDCLASSEXW wc = {sizeof wc};
  wc.lpfnWndProc = msgProc;
  wc.hInstance = inst;
  wc.lpszClassName = kMsgClass;
  wc.hIcon = loadIcon(32);
  RegisterClassExW(&wc);
  WNDCLASSEXW oc = {sizeof oc};
  oc.lpfnWndProc = overlayProc;
  oc.hInstance = inst;
  oc.lpszClassName = kOverlayClass;
  RegisterClassExW(&oc);
  gMsgWnd = CreateWindowExW(WS_EX_TOOLWINDOW, kMsgClass, L"Snowfall", WS_POPUP, 0, 0, 0, 0, nullptr, nullptr, inst, nullptr);
  gTaskbarCreated = RegisterWindowMessageW(L"TaskbarCreated");
  trayAdd();
  trayTip();
  gHotkeys[HK_PAUSE] = RegisterHotKey(gMsgWnd, HK_PAUSE, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, 'S');
  gHotkeys[HK_STORM] = RegisterHotKey(gMsgWnd, HK_STORM, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, 'B');
  gHotkeys[HK_SANTA] = RegisterHotKey(gMsgWnd, HK_SANTA, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, 'H');
  gHotkeys[HK_PLOW] = RegisterHotKey(gMsgWnd, HK_PLOW, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, 'P');
  const DWORD hookFlags = WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS;
  HWINEVENTHOOK hooks[] = {
      SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, nullptr, winEvent, 0, 0, hookFlags),
      SetWinEventHook(EVENT_SYSTEM_MOVESIZESTART, EVENT_SYSTEM_MOVESIZEEND, nullptr, winEvent, 0, 0, hookFlags),
      SetWinEventHook(EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MINIMIZEEND, nullptr, winEvent, 0, 0, hookFlags),
      SetWinEventHook(EVENT_OBJECT_DESTROY, EVENT_OBJECT_HIDE, nullptr, winEvent, 0, 0, hookFlags),
      SetWinEventHook(EVENT_OBJECT_REORDER, EVENT_OBJECT_REORDER, nullptr, winEvent, 0, 0, hookFlags),
      SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_LOCATIONCHANGE, nullptr, winEvent, 0, 0, hookFlags),
      SetWinEventHook(EVENT_OBJECT_CLOAKED, EVENT_OBJECT_UNCLOAKED, nullptr, winEvent, 0, 0, hookFlags),
  };
  WTSRegisterSessionNotification(gMsgWnd, NOTIFY_FOR_THIS_SESSION);
  HPOWERNOTIFY power = RegisterPowerSettingNotification(gMsgWnd, &kDisplayState, DEVICE_NOTIFY_WINDOW_HANDLE);

  gWorld.configure(S.eng);
  double start = now();
  if (!autostart && !selftest) gNextSanta = start + 7;  // a first visit, so you know he's there
  else scheduleSanta(start);
  if (!S.welcomed && !selftest) {
    trayBalloon(L"Let it snow!", L"Snowfall is running. Click the snowflake by the clock for settings. Ctrl+Alt+S pauses the snow.");
    S.welcomed = true;
    saveSettings();
  }

  HANDLE timer = CreateWaitableTimerExW(nullptr, nullptr, CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS);
  if (!timer) timer = CreateWaitableTimerW(nullptr, FALSE, nullptr);
  double next = now();
  bool timerSet = false;
  bool running = true;
  bool testBalls = false, testPlow = false;
  while (running) {
    // When awake, wake up for the next frame; when not, only for messages (and a slow check while a
    // full-screen app has every screen).
    if (!timerSet && !sleeping()) {
      double t = now();
      if (next < t - 0.25) next = t;
      LARGE_INTEGER due;
      due.QuadPart = -(LONGLONG)(std::max(0.0, next - t) * 1e7);
      SetWaitableTimer(timer, &due, 0, nullptr, nullptr, FALSE);
      timerSet = true;
    }
    DWORD r = MsgWaitForMultipleObjectsEx(timerSet ? 1 : 0, &timer, INFINITE, QS_ALLINPUT, MWMO_INPUTAVAILABLE);
    if (r == WAIT_OBJECT_0 && timerSet) {
      timerSet = false;
      if (!sleeping()) {
        bool animating = frame();
        next += animating ? frameInterval() : 1.0;
      }
      if (selftest) {  // exercise the snowballs and the snowplow on the real desktop
        double e = now() - start;
        if (!testBalls && e > 8) {
          testBalls = true;
          for (auto& w : gZ)
            if (w.kind == snow::Kind::Window) gWorld.dropSnowball((w.r.l + w.r.r) * 0.5f, (float)w.r.t - 80, 8);
        }
        if (!testPlow && e > selftest - 16) { testPlow = true; gWorld.sendPlow(); }
        if (e > selftest) running = false;
      }
    }
    MSG msg;
    while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
      if (msg.message == WM_QUIT) { running = false; break; }
      TranslateMessage(&msg);
      DispatchMessageW(&msg);
    }
    if (sleeping() && timerSet) { CancelWaitableTimer(timer); timerSet = false; gLast = 0; }
  }

  if (selftest) {  // numbers for the automated check on a real Windows machine
    PROCESS_MEMORY_COUNTERS_EX pm = {};
    pm.cb = sizeof pm;
    GetProcessMemoryInfo(GetCurrentProcess(), (PROCESS_MEMORY_COUNTERS*)&pm, sizeof pm);
    snow::Stats st = gWorld.stats();
    int windows = 0, occluders = 0;
    for (auto& w : gZ) (w.kind == snow::Kind::Window ? windows : occluders)++;
    FILE* f = _wfopen(selftestOut.c_str(), L"w");
    if (f) {
      std::fprintf(f, "screens=%d\nwindows_with_snow=%d\nother_windows=%d\nflakes=%d\nclumps=%d\npiles=%d\nsnowballs_snowmen_presents=%d\npile_volume=%.0f\n",
                   (int)gWorld.monitors().size(), windows, occluders, st.flakes, st.clumps, st.piles, st.objects, st.pileVolume);
      std::fprintf(f, "frames=%ld\navg_frame_ms=%.3f\nworst_frame_ms=%.3f\n", gStats.n, gStats.n ? gStats.ms / gStats.n : 0, gStats.worst);
      std::fprintf(f, "private_mb=%.1f\nworking_set_mb=%.1f\npeak_working_set_mb=%.1f\n", pm.PrivateUsage / 1048576.0, pm.WorkingSetSize / 1048576.0, pm.PeakWorkingSetSize / 1048576.0);
      for (size_t i = 0; i < gWorld.monitors().size(); ++i) {
        auto& m = gWorld.monitors()[i];
        std::fprintf(f, "screen%d=%dx%d at %d,%d scale %.2f ground %d taskbar %d active %d\n", (int)i, m.r.w(), m.r.h(), m.r.l, m.r.t, m.scale, m.groundY, m.taskbar ? 1 : 0, m.active ? 1 : 0);
      }
      for (size_t i = 0; i < gZ.size(); ++i) {
        wchar_t cls[96] = {}, title[96] = {};
        GetClassNameW(gZh[i], cls, 96);
        GetWindowTextW(gZh[i], title, 96);
        std::fprintf(f, "win%d kind=%d %d,%d-%d,%d class=%ls title=%ls\n", (int)i, (int)gZ[i].kind, gZ[i].r.l, gZ[i].r.t, gZ[i].r.r, gZ[i].r.b, cls, title);
      }
      std::fclose(f);
    }
  }

  for (auto h : hooks) if (h) UnhookWinEvent(h);
  if (power) UnregisterPowerSettingNotification(power);
  WTSUnRegisterSessionNotification(gMsgWnd);
  Shell_NotifyIconW(NIM_DELETE, &gNid);
  for (auto& o : gOv) destroyOverlay(o);
  if (mutex) CloseHandle(mutex);
  return 0;
}
