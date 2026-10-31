# Changelog

## 1.0.0

This is the first desktop release. It's the Weft studio as a Windows app.

- **Offline:**
  - The fonts, three.js and fflate are bundled.
  - The geometry engine runs in a background worker.
- **Native files:**
  - Exports and cover images are saved through the Windows Save dialog, with **Show in folder** afterwards.
  - Designs are saved and opened as `.weft` files, with a recent-files list.
  - `.weft` files open the app on double-click.
- **Open in Slicer:** builds the 3MF and opens it in the slicer set up for `.3mf` files (Ctrl+Shift+E).
- **Menus and shortcuts:** File, Edit, Design, View and Help menus, with shortcuts for shuffle, multicolour, dimensions, the size reference and views.
- **Window:**
  - The window remembers its size and position.
  - Only one copy runs at a time.
  - The title shows the current design.
- **Updates:** automatic updates from GitHub releases, once a repository is set with `npm run set-repo`.
- **Studio** (the same as the web version):
  - 25 textures and openwork patterns.
  - Multicolour bands with AMS-ready 3MFs.
  - Dimensions that can be clicked to type a value, and size references including a hand.
  - Partial shuffle.
  - Relief meshes cleaned for print: 0.5 mm grid, creases rounded to 0.45 mm, undersides held at 45°.
