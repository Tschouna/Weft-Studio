// Writes src/icon.ico from the same drawing code the app uses (dev tool, needs zlib):
//   g++ -O2 -std=c++17 -Isrc src/sprites.cpp tools/make_icon.cpp -lz -o make_icon && ./make_icon src/icon.ico
#include "engine.h"
#include <zlib.h>
#include <cstdio>
#include <cstring>
#include <vector>

static void put16(std::vector<uint8_t>& v, uint32_t x) { v.push_back(x & 255); v.push_back((x >> 8) & 255); }
static void put32(std::vector<uint8_t>& v, uint32_t x) { put16(v, x & 0xFFFF); put16(v, x >> 16); }
static void be32(std::vector<uint8_t>& v, uint32_t x) { for (int s = 24; s >= 0; s -= 8) v.push_back((x >> s) & 255); }

// premultiplied BGRA -> straight RGBA bytes
static std::vector<uint8_t> straight(const std::vector<uint32_t>& px) {
  std::vector<uint8_t> o;
  for (uint32_t p : px) {
    uint32_t a = p >> 24, r = (p >> 16) & 255, g = (p >> 8) & 255, b = p & 255;
    if (a) { r = r * 255 / a; g = g * 255 / a; b = b * 255 / a; }
    o.push_back((uint8_t)r); o.push_back((uint8_t)g); o.push_back((uint8_t)b); o.push_back((uint8_t)a);
  }
  return o;
}

static void chunk(std::vector<uint8_t>& png, const char* type, const std::vector<uint8_t>& data) {
  be32(png, (uint32_t)data.size());
  std::vector<uint8_t> td(type, type + 4);
  td.insert(td.end(), data.begin(), data.end());
  png.insert(png.end(), td.begin(), td.end());
  be32(png, (uint32_t)crc32(0, td.data(), (uInt)td.size()));
}

static std::vector<uint8_t> png(int n, const std::vector<uint8_t>& rgba) {
  std::vector<uint8_t> raw;
  for (int y = 0; y < n; ++y) { raw.push_back(0); raw.insert(raw.end(), rgba.begin() + (size_t)y * n * 4, rgba.begin() + (size_t)(y + 1) * n * 4); }
  uLongf len = compressBound((uLong)raw.size());
  std::vector<uint8_t> z(len);
  compress2(z.data(), &len, raw.data(), (uLong)raw.size(), 9);
  z.resize(len);
  std::vector<uint8_t> out = {0x89, 'P', 'N', 'G', 13, 10, 26, 10}, ihdr;
  be32(ihdr, n); be32(ihdr, n);
  ihdr.insert(ihdr.end(), {8, 6, 0, 0, 0});
  chunk(out, "IHDR", ihdr);
  chunk(out, "IDAT", z);
  chunk(out, "IEND", {});
  return out;
}

static std::vector<uint8_t> bmp(int n, const std::vector<uint8_t>& rgba) {
  std::vector<uint8_t> v;
  put32(v, 40); put32(v, n); put32(v, n * 2); put16(v, 1); put16(v, 32); put32(v, 0); put32(v, 0);
  put32(v, 0); put32(v, 0); put32(v, 0); put32(v, 0);
  for (int y = n - 1; y >= 0; --y)
    for (int x = 0; x < n; ++x) {
      const uint8_t* p = &rgba[((size_t)y * n + x) * 4];
      v.push_back(p[2]); v.push_back(p[1]); v.push_back(p[0]); v.push_back(p[3]);
    }
  int maskRow = ((n + 31) / 32) * 4;
  v.insert(v.end(), (size_t)maskRow * n, 0);
  return v;
}

int main(int argc, char** argv) {
  const int sizes[] = {16, 20, 24, 32, 40, 48, 64, 256};
  std::vector<std::vector<uint8_t>> imgs;
  for (int n : sizes) {
    auto rgba = straight(snow::makeIcon(n));
    imgs.push_back(n >= 256 ? png(n, rgba) : bmp(n, rgba));
  }
  std::vector<uint8_t> ico;
  put16(ico, 0); put16(ico, 1); put16(ico, (uint32_t)imgs.size());
  uint32_t off = 6 + 16 * (uint32_t)imgs.size();
  for (size_t i = 0; i < imgs.size(); ++i) {
    int n = sizes[i];
    ico.push_back(n >= 256 ? 0 : n); ico.push_back(n >= 256 ? 0 : n); ico.push_back(0); ico.push_back(0);
    put16(ico, 1); put16(ico, 32); put32(ico, (uint32_t)imgs[i].size()); put32(ico, off);
    off += (uint32_t)imgs[i].size();
  }
  for (auto& im : imgs) ico.insert(ico.end(), im.begin(), im.end());
  FILE* f = std::fopen(argc > 1 ? argv[1] : "icon.ico", "wb");
  std::fwrite(ico.data(), 1, ico.size(), f);
  std::fclose(f);
  std::printf("wrote %zu bytes\n", ico.size());
}
