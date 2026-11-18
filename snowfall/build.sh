#!/usr/bin/env bash
# Builds Snowfall.exe for 64-bit Windows with MinGW-w64 (on Linux: apt install g++-mingw-w64-x86-64-posix).
# The result is one self-contained file in dist/: no installer, no runtime to install.
set -euo pipefail
cd "$(dirname "$0")"
CXX=${CXX:-x86_64-w64-mingw32-g++-posix}
WINDRES=${WINDRES:-x86_64-w64-mingw32-windres}
mkdir -p dist build
"$WINDRES" -O coff -i src/app.rc -o build/app.res
"$CXX" -std=c++17 -O2 -s -municode -mwindows -static \
  -DUNICODE -D_UNICODE -D_WIN32_WINNT=0x0A00 -DWINVER=0x0A00 -DNTDDI_VERSION=0x0A000006 \
  -ffunction-sections -fdata-sections -Wl,--gc-sections -fno-exceptions -fno-rtti \
  -Wall -Wextra -Wno-cast-function-type -Wno-missing-field-initializers \
  src/win_main.cpp src/engine.cpp src/sprites.cpp build/app.res \
  -o dist/Snowfall.exe \
  -luser32 -lgdi32 -lshell32 -ldwmapi -lshcore -lwtsapi32 -lpsapi -ladvapi32
ls -l dist/Snowfall.exe
