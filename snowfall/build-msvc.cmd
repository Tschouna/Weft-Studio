@echo off
rem Builds dist\Snowfall.exe with Visual Studio's C++ compiler.
rem Run it from the "x64 Native Tools Command Prompt for VS". The exe is self-contained (static runtime).
setlocal
cd /d "%~dp0"
if not exist dist mkdir dist
if not exist build mkdir build
rc /nologo /i src /fo build\app.res src\app.rc || exit /b 1
cl /nologo /O2 /GL /MT /std:c++17 /EHsc /W3 /D_CRT_SECURE_NO_WARNINGS /Fobuild\ ^
  src\win_main.cpp src\engine.cpp src\sprites.cpp build\app.res /Fedist\Snowfall.exe ^
  /link /LTCG /SUBSYSTEM:WINDOWS /MANIFEST:NO ^
  user32.lib gdi32.lib shell32.lib dwmapi.lib shcore.lib wtsapi32.lib psapi.lib advapi32.lib || exit /b 1
echo Built dist\Snowfall.exe
