# Snowfall

Snow for your Windows 11 desktop. It falls in front of everything and piles up on top of your open app windows and on the taskbar. It never gets in the way: every click goes straight through to whatever is underneath.

## Using it

1. Download `Snowfall.exe` and double-click it. There is nothing to install. Windows SmartScreen may say "Windows protected your PC" because the file isn't code-signed: click **More info**, then **Run anyway**.
2. A snowflake appears by the clock. Click it for the menu. If you can't see it, it's under the **^** arrow; drag it onto the taskbar to keep it visible.
3. To have it start by itself, turn on **Settings → Start with Windows**.

| Keys | What it does |
|---|---|
| Ctrl+Alt+S | Pause or resume the snow |
| Ctrl+Alt+B | Snowstorm for 30 seconds |
| Ctrl+Alt+H | Call Santa |

## Things to try

- **Shake a window** by dragging it quickly back and forth. The snow on top falls off and lands on whatever is below.
- **Minimise or close a window** that has snow on it.
- **Wave the mouse** through the falling snow, or flick it fast through a pile to sweep it away.
- **Let snow build up on the taskbar.** After a while a snowman builds himself at one end, and waves now and then.
- **Wait for Santa.** Now and then he flies across the screen, and sometimes he drops a present onto a window.
- Thick snow grows **icicles** that drip.

The menu also sets how much snow falls (light flurry to blizzard), the wind, and the flake size. You can turn each extra on or off there.

## Light on your PC

- It's one 420 KB program written in C++ against plain Win32. It doesn't use a browser engine or .NET.
- Memory is mostly the picture of one screen: about 10–20 MB on a 1080p screen, more on 4K.
- It only redraws the parts of the screen that changed.
- Windows are tracked through Windows' own event notifications instead of being checked every frame.
- It runs in Windows 11's **efficiency mode** (the green leaf in Task Manager) at low priority, so it never slows down anything else.
- It stops drawing and frees its picture memory:
  - while paused
  - while the PC is locked or the screen is off
  - on any screen showing a full-screen game, video or presentation
- On battery it drops from 60 to 30 frames a second. **Settings** has a 30 fps mode for always.

Settings are kept in `%APPDATA%\Snowfall\settings.ini`.

## Building

On Linux with MinGW-w64 (`apt install g++-mingw-w64-x86-64-posix`), run `./build.sh`. It writes `dist/Snowfall.exe`.

The engine (`src/engine.cpp`, `src/sprites.cpp`) has no Windows code. `tools/preview.cpp` runs it on a pretend desktop and saves screenshots, so you can work on the look without Windows:

```
g++ -O2 -std=c++17 -Isrc src/engine.cpp src/sprites.cpp tools/preview.cpp -o preview && ./preview out/
```

`tools/make_icon.cpp` regenerates `src/icon.ico` from the same drawing code.

The **Snowfall** GitHub workflow builds the exe on every push that touches this folder. It also runs the exe on a real Windows machine next to a few open windows and reports memory use, frame times and a screenshot. Each run has the exe attached as the **Snowfall** artifact.
