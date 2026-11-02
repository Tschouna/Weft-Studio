# Changelog

## 2.0.0

A new design for the whole studio. Every feature from 1.2 is still here; only the layout and the look changed.

**Don't like it?** Click **Classic** in the top bar (or use View → Design → Classic in the menu) to get the 1.x layout back. Your design comes with you, and Weft Studio remembers your choice. Classic has a **Try Weft 2.0** button to switch back.

- **Studio layout:**
  - The five steps sit in a rail down the left, with their controls in an inspector beside them.
  - The piece gets the rest of the window.
- **Tool dock:**
  - Light, see-through, cutaway, dimensions, size reference, drag shape and turntable float on a dock under the piece.
  - Frame and Shuffle sit on the same dock.
- **Status bar:** size, weight, parts, triangles and the print check run along the bottom. Click the check to open Export.
- **Top bar:**
  - Studio, Collection and Print guide are views of their own instead of one long page.
  - A primary **Export** button is always one click away.
- **Collection:**
  - A full-width gallery with filters: Planters, Vases, Bowls and trays, Boxes and cups, Lighting and Rings.
- **Inspector:**
  - Every section folds away from its heading and stays folded.
  - Each step has a header that says what it covers.
  - The controls are more compact and precise.
- **Polish:**
  - A photo-studio backdrop for the piece.
  - Refined light and dark themes.
  - Phone layout: the steps become tabs, and the dock wraps onto two rows.

## 1.2.1

- **Updates follow the repository's new home:**
  - Weft Studio now checks github.com/Tschouna/Weft-Studio for new versions.
  - The old address only worked through GitHub's redirect.
- Everything else is the same as 1.2.0.

## 1.2.0

The big update: bolder textures, six new objects, sturdier walls and 17 new collection pieces.

- **Self-watering inserts that fit:**
  - The insert is now sized to the narrowest part of the pot above it, so it always drops in.
  - Before, bellied, round and orb-shaped pots could make an insert that got stuck.
  - The insert wall now matches the pot wall (up to 3 mm).
- **3 mm walls:**
  - Shuffle and every object now start with 3 mm walls and floors.
  - The print check warns below 2 mm.
  - The wall slider goes up to 6 mm.
- **Bolder relief:**
  - Depth now goes up to 12 mm.
  - Every texture starts deeper.
  - Shuffle picks a bold depth for each texture: spikes, shards and fins really stand out.
- **Five new textures:**
  - **Blocks:** staggered stone blocks at different depths.
  - **Spikes:** big sharp pyramids.
  - **Shards:** a jagged crystal surface.
  - **Fins:** deep blades that look great swirled.
  - **Hobnail:** rows of round bumps.
- **Six new objects:**
  - **Hanging planter:** teardrop holes for 3 or 4 cords under the rim; the studio shows it hanging.
  - **Wall planter:**
    - A D shape whose flat back stays on one upright plane.
    - A keyhole for one screw.
    - No texture where it touches the wall.
  - **Orchid pot:** open sides so roots get air, with an optional saucer.
  - **Tealight lantern:** openwork around an LED tealight. The light switch shows the glow.
  - **Tray:** a low dish for keys, rings and jewellery.
  - **Napkin ring:** an open band, also for bangles and candle sleeves.
- **Collection:**
  - 17 new pieces, 44 in all: Agave, Obsidian, Bastion, Turbine, Pearl, Liana, Hammock, Niche, Corbel, Vanda, Lucerna, Votive, Valet, Geode, Loop, Hoop and Ashlar.
  - The older pieces have deeper relief.
- **Printability:**
  - Deep relief on twisted shapes now keeps its undersides at 45°.
  - Before, bumps and blocks on a twisted outline could lean out past it.
  - Thick openwork walls no longer flag tiny corner specks as overhangs.
- **Lamps:** switching to a lamp or lantern with a relief-only texture now picks a perforated openwork, so light gets out.

## 1.1.2

- **First release built and published by GitHub:**
  - Releases now include the update information (`latest.yml`), so installed copies can update themselves from here on.
  - Install this version once by hand.
- Everything else is the same as 1.1.1.

## 1.1.1

- **Automatic updates:**
  - Weft Studio now checks GitHub (scherrerjonah-droid/Weft-Studio) for new versions when it starts.
  - When one is ready, it offers to restart into it.
  - Help → Check for Updates checks right away.
- Everything else is the same as 1.1.0.

## 1.1.0

- **New textures:**
  - **Knurl:** fine diamond pyramids.
  - **Cubes:** a 3D cube illusion; each hexagon is three flat faces.
  - **Gouge:** overlapping hand-carved scoops.
  - **Seigaiha:** Japanese wave fans.
  - **Herringbone:** a parquet pattern.
  - **Perforated:** dense round holes with self-supporting teardrop tops, made for lamps.
- **Swirl:** turns any pattern around the piece from bottom to top (Surface → Swirl).
  - On a twisted shape, openwork now stays upright, so holes keep their self-supporting tops.
- **Table lamp (new object):** a shade on a base for an E27 lamp kit.
  - The base prints top-down. It has a socket hole, a groove the shade stands in, and a notch for the cord.
  - The light toggle and the glowing bulb now work for table lamps too.
- **Self-watering planters:** a new planter option.
  - An inner pot hangs from the rim on a 45° flare over a water reservoir, with a wick hole in its floor.
  - A side channel lets you pour water into the reservoir.
  - The studio shows how much water the reservoir holds.
- **Orb silhouette:** a round bowl planter shape.
- **Collection:** 7 new pieces (27 in all): Pinecone, Torsion, Isomer, Chisel, Strala, Seigaiha and Parquet.
- **Shuffle:**
  - Can now pick the new textures, self-watering inserts, the Orb shape and swirls.
  - Lamps get turned polygon shades.

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
