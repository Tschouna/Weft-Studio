# Snowfall

Snow for your Windows 11 desktop. It falls in front of everything and piles up on top of your open app windows and on the taskbar. Hang strings of lights between your windows and put a little village on the taskbar. It never gets in the way: every click goes straight through to whatever is underneath.

## Using it

1. Download `Snowfall.exe` and double-click it. There is nothing to install. Windows SmartScreen may say "Windows protected your PC" because the file isn't code-signed: click **More info**, then **Run anyway**.
2. A snowflake appears by the clock. Click it for the menu. If you can't see it, it's under the **^** arrow; drag it onto the taskbar to keep it visible.
3. To have it start by itself, turn on **Settings → Start with Windows**.

| Keys | What it does |
|---|---|
| Ctrl+Alt+S | Pause or resume the snow |
| Ctrl+Alt+B | Snowstorm for 30 seconds |
| Ctrl+Alt+H | Call Santa |
| Ctrl+Alt+P | Send the snowplow |

## Decorating

Click the snowflake by the clock and choose **Decorate your desktop…**. The screen dims a little and a toolbar opens at the top:

- **String lights:** pick them in the toolbar, then click where they should start and click again for each joint. Double-click, right-click or press Enter to finish. A joint you put on a window hangs from that window and follows it when you move it. Lights hung only from points on the screen hang in front of everything, like a garland on the glass.
- **Decorations:** a holiday house, hydrant, street lamp, lantern, frosted pine, decorated fir, presents, a bench, a market stall, a snowman and a candy cane. Pick one, then click along the bottom of the screen to place it. Snow settles on their roofs; the lamp and the lantern glow.
- **Move** decorations and joints by dragging them. **Remove** one with a right-click, or select lights and press Delete.
- **Colours** (warm white, multicolour, cool white, red and green, gold, blue) and **Slack** (how much the lights sag) apply to the selected lights and to new ones.
- **Presets:** a little village on the taskbar, a garland across the top of the screen, swags in the top corners, or lights strung between your windows.
- **Done** keeps it all (saved for next time), **Cancel** puts it back as it was.

The lights sway in the wind, swing when you drag the window they hang from, and the mouse can brush them.

## Wind

**Wind…** in the menu opens a little pad: drag from the centre to set which way the wind blows and how hard. Upwards wind slows the snow down, downwards wind brings it faster.

## Things to try

- **Snowmen build themselves** on windows and the taskbar once the snow is deep. They wear Santa hats, top hats or bobble hats, and wave now and then.
- **Push a snowball with the mouse.** It rolls, picking up snow and growing as it goes, and can roll off a window onto another window or the taskbar.
- **Build your own snowman** by rolling a smaller snowball into a bigger one: it hops on top. Two or three balls make a snowman, with a hat and scarf.
- **Flick the mouse fast** through a snowman to knock him into snowballs, or through a pile of snow to sweep it away.
- **Shake a window** by dragging it quickly back and forth. The snow, snowballs and snowmen on top fall off.
- **Minimise or close a window** that has snow on it.
- **A snowplow** drives along the taskbar when the snow gets deep, pushing a heap of snow ahead of its blade.
- **Wait for Santa.** Now and then he flies across the screen, and sometimes he drops a present onto a window.
- Thick snow grows **icicles** that drip.

The menu also sets how much snow falls (light flurry to blizzard), the wind, and the flake size. You can turn each extra on or off there. It doesn't change your wallpaper.

## Light on your PC

- It's one small program (about 0.5 MB) written in C++ against plain Win32. It doesn't use a browser engine or .NET.
- Memory is mostly the picture of one screen: about 10–20 MB on a 1080p screen, more on 4K.
- It only redraws the parts of the screen that changed.
- Windows are tracked through Windows' own event notifications instead of being checked every frame.
- It runs in Windows 11's **efficiency mode** (the green leaf in Task Manager) at low priority, so it never slows down anything else.
- It stops drawing and frees its picture memory:
  - while paused
  - while the PC is locked or the screen is off
  - on any screen showing a full-screen game, video or presentation
- On battery it drops from 60 to 30 frames a second. **Settings** has a 30 fps mode for always.

Settings are kept in `%APPDATA%\Snowfall\settings.ini`, and your decorations and lights in `layout.txt` next to it.

## Building

- **On Windows:** open the "x64 Native Tools Command Prompt for VS" and run `build-msvc.cmd`.
- **On Linux:** install MinGW-w64 (`apt install g++-mingw-w64-x86-64-posix`) and run `./build.sh`.

Both write `dist/Snowfall.exe`.

The engine (`src/engine.cpp`, `src/sprites.cpp`) has no Windows code. `tools/preview.cpp` runs it on a pretend desktop and saves screenshots, so you can work on the look without Windows:

```
g++ -O2 -std=c++17 -Isrc src/engine.cpp src/sprites.cpp tools/preview.cpp -o preview && ./preview out/
```

`tools/make_icon.cpp` regenerates `src/icon.ico` from the same drawing code.

The **Snowfall** GitHub workflow builds the exe on Windows on every push that touches this folder. It also runs the exe on a real Windows machine next to a few open windows and reports memory use, frame times and a screenshot. Each run has the exe attached as the **Snowfall** artifact.
