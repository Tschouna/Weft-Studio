// A tiny custom-drawn panel window for Snowfall's wind pad and decorating toolbar (Windows only, included
// by win_main.cpp). Each change redraws the whole panel into a DIB: an immediate-mode UI with buttons, tiles,
// a slider and text, drawn in the dark Windows 11 style.
#pragma once
#include <windows.h>
#include <windowsx.h>
#include <dwmapi.h>
#include <shellscalingapi.h>
#include <algorithm>
#include <cmath>
#include "engine.h"

namespace ui {

constexpr uint32_t kBg = 0xFF202124, kBg2 = 0xFF2B2D31, kBg3 = 0xFF34373C, kBorder = 0xFF3D4046;
constexpr uint32_t kText = 0xFFF1F2F4, kSub = 0xFFA6ABB3, kAccent = 0xFF4C8DFF, kAccentHi = 0xFF6AA0FF, kAccentDim = 0xFF27406B;
inline uint32_t rgbOf(uint32_t c) { return RGB((c >> 16) & 255, (c >> 8) & 255, c & 255); }
inline uint32_t argb(int r, int g, int b, float a = 1) {
  int A = (int)(std::clamp(a, 0.f, 1.f) * 255 + 0.5f);
  return ((uint32_t)A << 24) | ((uint32_t)(r * A / 255) << 16) | ((uint32_t)(g * A / 255) << 8) | (uint32_t)(b * A / 255);
}
inline void over(uint32_t* d, uint32_t s) {
  uint32_t sa = s >> 24;
  if (!sa) return;
  if (sa == 255) { *d = s; return; }
  uint32_t inv = 255 - sa, dv = *d;
  uint32_t rb = (dv & 0x00FF00FF) * inv, ag = ((dv >> 8) & 0x00FF00FF) * inv;
  rb = ((rb + 0x00800080 + ((rb >> 8) & 0x00FF00FF)) >> 8) & 0x00FF00FF;
  ag = (ag + 0x00800080 + ((ag >> 8) & 0x00FF00FF)) & 0xFF00FF00;
  *d = s + rb + ag;
}
inline uint32_t fade(uint32_t c, float k) {  // scale a premultiplied colour
  uint32_t K = (uint32_t)(std::clamp(k, 0.f, 1.f) * 256);
  return ((((c & 0x00FF00FF) * K) >> 8) & 0x00FF00FF) | ((((c >> 8) & 0x00FF00FF) * K) & 0xFF00FF00);
}

const wchar_t* const kPanelClass = L"SnowfallPanel";

struct Panel {
  HWND hwnd = nullptr;
  int W = 0, H = 0;   // pixels
  float s = 1;        // DPI scale
  HDC dc = nullptr;
  HBITMAP bmp = nullptr, old = nullptr;
  uint32_t* px = nullptr;
  HFONT font = nullptr, bold = nullptr, small = nullptr;
  int mx = -10000, my = -10000;
  bool down = false, pressed = false, released = false, tracking = false;
  int active = 0;     // the widget being pressed
  void (*build)(Panel&) = nullptr;
  void (*key)(Panel&, WPARAM) = nullptr;
  void (*closed)(Panel&) = nullptr;
  bool closeOnDeactivate = false;
  int dragTop = 0;    // the top strip (pixels) drags the window, outside widgets
  int dragExclude = 0;// ...left of this x

  int S(float dip) const { return (int)std::lround(dip * s); }
  bool open() const { return hwnd != nullptr; }

  // ---- drawing
  void clear(uint32_t c) { std::fill(px, px + (size_t)W * H, c); }
  void fill(int x0, int y0, int x1, int y1, uint32_t c) {
    x0 = std::max(x0, 0); y0 = std::max(y0, 0); x1 = std::min(x1, W); y1 = std::min(y1, H);
    for (int y = y0; y < y1; ++y)
      for (int x = x0; x < x1; ++x) over(px + (size_t)y * W + x, c);
  }
  // An anti-aliased rounded rectangle.
  void rrect(float x0, float y0, float x1, float y1, float r, uint32_t c) {
    r = std::min({r, (x1 - x0) / 2, (y1 - y0) / 2});
    float cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = (x1 - x0) / 2 - r, hh = (y1 - y0) / 2 - r;
    int X0 = std::max(0, (int)std::floor(x0)), X1 = std::min(W, (int)std::ceil(x1)), Y0 = std::max(0, (int)std::floor(y0)), Y1 = std::min(H, (int)std::ceil(y1));
    for (int y = Y0; y < Y1; ++y)
      for (int x = X0; x < X1; ++x) {
        float dx = std::max(std::fabs(x + 0.5f - cx) - hw, 0.f), dy = std::max(std::fabs(y + 0.5f - cy) - hh, 0.f);
        float cov = std::clamp(r + 0.5f - std::sqrt(dx * dx + dy * dy), 0.f, 1.f);
        if (cov > 0) over(px + (size_t)y * W + x, fade(c, cov));
      }
  }
  void circle(float cx, float cy, float r, uint32_t c) { rrect(cx - r, cy - r, cx + r, cy + r, r, c); }
  void ring(float cx, float cy, float r, float w, uint32_t c) {
    int X0 = std::max(0, (int)(cx - r - w - 1)), X1 = std::min(W, (int)(cx + r + w + 2)), Y0 = std::max(0, (int)(cy - r - w - 1)), Y1 = std::min(H, (int)(cy + r + w + 2));
    for (int y = Y0; y < Y1; ++y)
      for (int x = X0; x < X1; ++x) {
        float d = std::fabs(std::sqrt((x + 0.5f - cx) * (x + 0.5f - cx) + (y + 0.5f - cy) * (y + 0.5f - cy)) - r);
        float cov = std::clamp(w / 2 + 0.5f - d, 0.f, 1.f);
        if (cov > 0) over(px + (size_t)y * W + x, fade(c, cov));
      }
  }
  void line(float ax, float ay, float bx, float by, float w, uint32_t c) {
    float hw = w / 2, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    int X0 = std::max(0, (int)(std::min(ax, bx) - hw - 1)), X1 = std::min(W, (int)(std::max(ax, bx) + hw + 2));
    int Y0 = std::max(0, (int)(std::min(ay, by) - hw - 1)), Y1 = std::min(H, (int)(std::max(ay, by) + hw + 2));
    for (int y = Y0; y < Y1; ++y)
      for (int x = X0; x < X1; ++x) {
        float px0 = x + 0.5f, py0 = y + 0.5f;
        float t = l2 > 0 ? std::clamp(((px0 - ax) * dx + (py0 - ay) * dy) / l2, 0.f, 1.f) : 0.f;
        float qx = ax + dx * t - px0, qy = ay + dy * t - py0;
        float cov = std::clamp(hw + 0.5f - std::sqrt(qx * qx + qy * qy), 0.f, 1.f);
        if (cov > 0) over(px + (size_t)y * W + x, fade(c, cov));
      }
  }
  void text(const wchar_t* t, int x0, int y0, int x1, int y1, uint32_t color, HFONT f, UINT fmt) {
    GdiFlush();
    HGDIOBJ o = SelectObject(dc, f);
    SetTextColor(dc, rgbOf(color));
    SetBkMode(dc, TRANSPARENT);
    RECT rc{x0, y0, x1, y1};
    DrawTextW(dc, t, -1, &rc, fmt | DT_NOPREFIX);
    SelectObject(dc, o);
    GdiFlush();
  }
  // A premultiplied sprite with its anchor at (x, y).
  void sprite(const snow::Sprite& sp, int x, int y, float alpha = 1) {
    int X0 = x - sp.ox, Y0 = y - sp.oy;
    for (int yy = 0; yy < sp.h; ++yy) {
      int Y = Y0 + yy;
      if (Y < 0 || Y >= H) continue;
      for (int xx = 0; xx < sp.w; ++xx) {
        int X = X0 + xx;
        if (X < 0 || X >= W) continue;
        uint32_t p = sp.px[(size_t)yy * sp.w + xx];
        if (p >> 24) over(px + (size_t)Y * W + X, alpha >= 1 ? p : fade(p, alpha));
      }
    }
  }

  // ---- widgets
  bool over_(int x0, int y0, int x1, int y1) const { return mx >= x0 && mx < x1 && my >= y0 && my < y1; }
  bool clickable(int id, int x0, int y0, int x1, int y1, bool enabled = true) {
    bool h = enabled && over_(x0, y0, x1, y1);
    if (pressed && h) active = id;
    return released && active == id && h;
  }
  // style: 0 plain, 1 accent, 2 flat
  bool button(int id, int x0, int y0, int x1, int y1, const wchar_t* label, int style = 0, bool selected = false, bool enabled = true) {
    bool h = enabled && over_(x0, y0, x1, y1);
    bool hit = clickable(id, x0, y0, x1, y1, enabled);
    uint32_t bg = style == 1 ? (h ? kAccentHi : kAccent) : selected ? kAccentDim : style == 2 ? (h ? kBg3 : 0) : (h ? kBg3 : kBg2);
    if (active == id && down && h) bg = style == 1 ? kAccent : kBorder;
    if (bg) rrect((float)x0, (float)y0, (float)x1, (float)y1, (float)S(6), bg);
    text(label, x0, y0, x1, y1, enabled ? (style == 1 ? 0xFFFFFFFF : kText) : 0xFF6B7078, font, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
    return hit;
  }
  // A horizontal slider; returns true while it changes.
  bool slider(int id, int x0, int y0, int x1, int y1, float* v) {
    bool h = over_(x0 - S(6), y0, x1 + S(6), y1);
    if (pressed && h) active = id;
    bool changed = false;
    if (active == id && down) {
      float nv = std::clamp((mx - x0) / (float)std::max(1, x1 - x0), 0.f, 1.f);
      if (nv != *v) { *v = nv; changed = true; }
    }
    float cy = (y0 + y1) / 2.f, kx = x0 + (x1 - x0) * *v;
    rrect((float)x0, cy - S(2), (float)x1, cy + S(2), (float)S(2), kBorder);
    rrect((float)x0, cy - S(2), kx, cy + S(2), (float)S(2), kAccent);
    circle(kx, cy, (float)S(h || active == id ? 8 : 7), 0xFFFFFFFF);
    circle(kx, cy, (float)S(3.5f), kAccent);
    return changed;
  }
};

LRESULT CALLBACK panelProc(HWND h, UINT m, WPARAM w, LPARAM l);

inline void redraw(Panel& p) {
  if (!p.hwnd || !p.build) return;
  p.build(p);
  if (p.released) p.active = 0;
  p.pressed = p.released = false;
  if (p.hwnd) InvalidateRect(p.hwnd, nullptr, FALSE);
}

inline void close(Panel& p) {
  if (!p.hwnd) return;
  HWND h = p.hwnd;
  p.hwnd = nullptr;
  DestroyWindow(h);
  if (p.dc) { SelectObject(p.dc, p.old); DeleteObject(p.bmp); DeleteDC(p.dc); }
  for (HFONT f : {p.font, p.bold, p.small}) if (f) DeleteObject(f);
  p.dc = nullptr; p.bmp = p.old = nullptr; p.px = nullptr;
  p.font = p.bold = p.small = nullptr;
  if (p.closed) p.closed(p);
}

inline void registerClass(HINSTANCE inst) {
  WNDCLASSEXW pc = {sizeof pc};
  pc.style = CS_DROPSHADOW | CS_DBLCLKS;
  pc.lpfnWndProc = panelProc;
  pc.hInstance = inst;
  pc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
  pc.lpszClassName = kPanelClass;
  RegisterClassExW(&pc);
}

// Opens the panel wDip x hDip at (x, y) in physical pixels (DPI from the screen at that point).
inline bool create(Panel& p, HINSTANCE inst, int x, int y, int wDip, int hDip, float scale) {
  p.mx = p.my = -10000;
  p.down = p.pressed = p.released = p.tracking = false;
  p.active = 0;
  p.s = scale;
  p.W = p.S((float)wDip);
  p.H = p.S((float)hDip);
  p.hwnd = CreateWindowExW(WS_EX_TOPMOST | WS_EX_TOOLWINDOW, kPanelClass, L"Snowfall", WS_POPUP, x, y, p.W, p.H, nullptr, nullptr, inst, nullptr);
  if (!p.hwnd) return false;
  SetWindowLongPtrW(p.hwnd, GWLP_USERDATA, (LONG_PTR)&p);
  int round = 2;  // DWMWCP_ROUND
  DwmSetWindowAttribute(p.hwnd, 33, &round, sizeof round);
  BOOL dark = TRUE;
  DwmSetWindowAttribute(p.hwnd, 20, &dark, sizeof dark);  // DWMWA_USE_IMMERSIVE_DARK_MODE
  BITMAPINFO bi = {};
  bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
  bi.bmiHeader.biWidth = p.W;
  bi.bmiHeader.biHeight = -p.H;
  bi.bmiHeader.biPlanes = 1;
  bi.bmiHeader.biBitCount = 32;
  HDC screen = GetDC(nullptr);
  p.dc = CreateCompatibleDC(screen);
  void* bits = nullptr;
  p.bmp = CreateDIBSection(screen, &bi, DIB_RGB_COLORS, &bits, nullptr, 0);
  ReleaseDC(nullptr, screen);
  p.old = (HBITMAP)SelectObject(p.dc, p.bmp);
  p.px = (uint32_t*)bits;
  auto mk = [&](float pt, int weight) {
    return CreateFontW(-p.S(pt), 0, 0, 0, weight, 0, 0, 0, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI Variable Text");
  };
  p.font = mk(13.f, FW_NORMAL);
  p.bold = mk(14.5f, FW_SEMIBOLD);
  p.small = mk(11.5f, FW_NORMAL);
  redraw(p);
  ShowWindow(p.hwnd, SW_SHOW);
  SetForegroundWindow(p.hwnd);
  return true;
}

inline LRESULT CALLBACK panelProc(HWND h, UINT m, WPARAM w, LPARAM l) {
  Panel* p = (Panel*)GetWindowLongPtrW(h, GWLP_USERDATA);
  if (!p || p->hwnd != h) return DefWindowProcW(h, m, w, l);
  switch (m) {
    case WM_PAINT: {
      PAINTSTRUCT ps;
      HDC dc = BeginPaint(h, &ps);
      BitBlt(dc, 0, 0, p->W, p->H, p->dc, 0, 0, SRCCOPY);
      EndPaint(h, &ps);
      return 0;
    }
    case WM_ERASEBKGND: return 1;
    case WM_NCHITTEST: {
      POINT pt{GET_X_LPARAM(l), GET_Y_LPARAM(l)};
      ScreenToClient(h, &pt);
      if (p->dragTop && pt.y < p->dragTop && pt.x < p->dragExclude) return HTCAPTION;
      return HTCLIENT;
    }
    case WM_MOUSEMOVE:
      p->mx = GET_X_LPARAM(l); p->my = GET_Y_LPARAM(l);
      if (!p->tracking) { TRACKMOUSEEVENT t{sizeof t, TME_LEAVE, h, 0}; TrackMouseEvent(&t); p->tracking = true; }
      redraw(*p);
      return 0;
    case WM_MOUSELEAVE:
      p->tracking = false;
      if (!p->down) { p->mx = p->my = -10000; redraw(*p); }
      return 0;
    case WM_LBUTTONDOWN: case WM_LBUTTONDBLCLK:
      p->mx = GET_X_LPARAM(l); p->my = GET_Y_LPARAM(l);
      p->down = p->pressed = true;
      SetCapture(h);
      redraw(*p);
      return 0;
    case WM_LBUTTONUP:
      p->mx = GET_X_LPARAM(l); p->my = GET_Y_LPARAM(l);
      p->down = false;
      p->released = true;
      ReleaseCapture();
      redraw(*p);
      return 0;
    case WM_KEYDOWN:
      if (p->key) p->key(*p, w);
      return 0;
    case WM_ACTIVATE:
      if (LOWORD(w) == WA_INACTIVE && p->closeOnDeactivate) PostMessageW(h, WM_CLOSE, 0, 0);
      return 0;
    case WM_CLOSE:
      close(*p);
      return 0;
  }
  return DefWindowProcW(h, m, w, l);
}

}  // namespace ui
