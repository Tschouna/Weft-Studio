# Weft Studio

A desktop studio for designing 3D-printable homeware and wall panels: planters (including self-watering, hanging and wall planters, and plant stands), orchid pots, vases, bowls, trays, storage boxes with lids, cups and holders, napkin rings, tealight lanterns, candle holders, pendant lamps, table lamps and globe lamps. Shape the silhouette, pick one of 35 surface textures or openwork patterns (and swirl them around the piece), choose colours (including multicolour bands for an AMS), and export print-ready files for Bambu Studio, OrcaSlicer, PrusaSlicer or any other slicer.

Every piece is built as a watertight mesh, oriented for printing, with overhangs held at 45° or less so it prints without supports. Walls default to 3 mm. The one exception is the closed globe lamp: a true ball leans past 45° at the top and underneath, so the print check says it needs supports and where (or give it a 45° peak and cone to print without).

**Panels** is a second studio in the same app, for wall panels:
- Pick an outline and one of 29 patterns as a relief, as wave ribs (slatted wall art whose ribs follow the pattern) or as openwork, and set the size, up to 2.4 m. The patterns include an acoustic-style diffuser of slanted blocks, your own photo, and real terrain: type a Swiss peak or place and Weft downloads swisstopo's swissALTI3D heights for the area you frame on the map, or load elevation files yourself (GeoTIFF, XYZ, ASCII grids), with neighbouring tiles stitched together.
- It slices the panel into tiles that fit your printer's bed. The tiles join with dovetail or jigsaw tabs, hidden bowtie keys, or seams that follow the pattern.
- Each tile prints face up with no supports, with its name engraved in the back and pockets for magnets, screws or LED halo stand-offs.
- The download is a production kit: 3MF and STL tiles, an assembly map, a 1:1 wall template and a parts list.

## Using the app

- **Studio and Panels:** the top bar switches between the studio (one piece at a time) and Panels (a wall panel sliced into tiles). Each keeps its own design and undo history.
- **Two designs:**
  - Weft 2.0 is the default.
  - The 1.x layout is still there: click **Classic** in the top bar, or use **View → Design**.
  - **Try Weft 2.0** switches back.
  - The design on the stage comes along, and the app remembers the choice.

- **Install:** run `Weft-Studio-Setup-x.y.z.exe`. The installer isn't code-signed yet, so Windows SmartScreen may say "Windows protected your PC". Click **More info**, then **Run anyway**.
- **Designs:** **File → Save Design As… (Ctrl+S)** writes a `.weft` file. Double-click a `.weft` file, or use **File → Open Design… (Ctrl+O)**, to keep working on it.
- **Print files:** **File → Export Print Files… (Ctrl+E)** saves a .zip with the 3MF, STLs and print notes.
- **Straight to the slicer:** **File → Open in Slicer (Ctrl+Shift+E)** builds the 3MF and opens it in whatever app opens `.3mf` files on your PC.
- **Shortcuts:**

  | Keys | Action |
  |---|---|
  | Ctrl+R | Shuffle |
  | Ctrl+1 / 2 / 3 | Shuffle only the shape, surface or colours |
  | Ctrl+M | Multicolor on or off |
  | Ctrl+P | Panels |
  | Ctrl+D | Dimensions |
  | Ctrl+K | Size reference |
  | F | Frame the piece |
  | F1 / F2 | Studio / Print check |
  | Ctrl+Z / Ctrl+Shift+Z | Undo / redo |

- **Where things are kept:**
  - Exports go to `Documents\Weft Studio` unless you pick another folder.
  - Saved designs, settings and the window size live in `%APPDATA%\Weft Studio` (**Help → Open App Data Folder**).

## Working on it

Requirements: Node.js 22 and npm.

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (once) |
| `npm start` | Run the app from source |
| `npm test` | Engine checks (see below) |
| `npm run dist` | Build the Windows installer into `dist/` (on Windows; on Linux it needs Wine) |
| `npm run web` | Build the browser version into `web/` |

### Layout

| Path | What it is |
|---|---|
| `app/` | The studio itself, plain HTML and JavaScript modules. It is the same code in the desktop app and the browser. |
| `app/index.html` | The Weft 2.0 page: layout and styles. |
| `app/classic.html` | The classic (1.x) page. Both pages use the same element ids, so one `app.js` drives either. |
| `app/engine.js` | The geometry engine: silhouettes, cross-sections (including the flat-backed D for wall planters), the 35 textures and swirl, the mesher, cord holes and keyholes, lids, saucers, sleeves, self-watering inserts, lamp bases, closed globes, the glow test strip, multicolour bands and overhang checks. Runs in a Web Worker. |
| `app/presets.js` | Defaults, silhouettes and the starter collection. |
| `app/app.js` | UI, 3D preview, drag handles, dimensions, size references, export (3MF, STL, PNG). |
| `app/panel.js` | The panel engine: outlines, the 29 panel patterns, wave ribs, diffuser blocks with exact flat tops, tile planning, tabs, keys, back pockets, the two-tone split, and a mesher that clips a grid of triangles exactly against every boundary so tiles come out closed. Runs in `app/panel-worker.js`. |
| `app/dem.js` | Elevation models for the Terrain pattern: a GeoTIFF reader (strips or tiles, uncompressed, LZW or Deflate, both predictors, BigTIFF), XYZ and ESRI ASCII grids, zip files, and stitching tiles by their coordinates. |
| `app/swisstopo.js` | The Terrain downloader: place search (api3.geo.admin.ch), the swissALTI3D tile catalogue (data.geo.admin.ch, STAC), the map for framing the area (wms.geo.admin.ch), and downloading and stitching the tiles. The only part of the app that goes online, and only when you search or fetch. |
| `app/panels.js` | The Panels compartment: its inspector, 3D stage (wall, tiles, print beds), starting panels, shuffle, and the production kit export (3MF, STL, assembly map, wall template, parts list). |
| `app/fonts/` | The bundled fonts, so the app works offline (all but the swisstopo downloader). |
| `app/vendor/` | Generated by `npm run vendor`: three.js and fflate. |
| `electron/main.js` | The desktop window, menus, file dialogs, the slicer hand-off, `.weft` files and auto-update. |
| `electron/preload.js` | The small, safe bridge (`window.weftDesktop`) between the page and the desktop. |
| `build/` | The icon (`icon.svg` is the source). |
| `test/engine.mjs` | Engine checks. |
| `test/panel.mjs` | Panel checks (run by `npm test` after the engine checks). |
| `test/ui-objects.cjs` | Clicks through objects in the browser build and screenshots them (`npm run web` first). |
| `test/ui-switch.cjs` | Checks the switch between Weft 2.0 and Classic, the collection filters and folding sections (`npm run web` first). |
| `.github/workflows/build.yml` | Builds the installer on GitHub. |

### Engine checks

`npm test` checks eight things:

1. Every collection piece is a closed solid, and relief textures have no overhang.
2. Multicolour bands are each closed and add no overhang.
3. The relief mesh stays within a few hundredths of a millimetre of the intended surface, deep textures included. This guards against saw-tooth creases coming back.
4. A batch of random designs, across every object, all build closed.
5. Self-watering inserts drop into their pots, with clearance at every height.
6. Bold, deep relief keeps its undersides printable on bellied, twisted and flared shapes.
7. Shuffled designs print without supports. It uses the studio's own shuffle code, read out of `app/app.js` by `test/shuffle-lib.mjs`.
8. Lids on twisted, shaped boxes keep the box's outline and still pass the opening.
9. Globe lamps: every top, underside, outline and pattern builds closed; a round globe says it needs supports, and a peak top with a cone underside prints without any. The glow test strip is closed.

`ONLY=3,5 npm test` runs just those sections.

Then `test/panel.mjs` checks panels:

1. Every tile and loose part of every starting panel is closed and manifold.
2. Every pattern builds closed, in relief and in openwork.
3. Joints, seams, mounts, outlines, two-tone and rib builds stay closed, and the fit test has its joint.
4. Tiles fit the bed, and tabs keep exactly the set clearance from their sockets.
5. A batch of random panels all build closed.
6. Elevation files read back exactly: test GeoTIFFs of every kind (byte orders, strips and tiles, uncompressed, LZW and Deflate, both predictors, BigTIFF), XYZ and ASCII grids, and a zip of two tiles that must stitch. Terrain panels built from them come out closed.
7. The swisstopo downloader, against a stand-in for the services (no network needed): the summit comes first in the search, typed coordinates land on the spot, the catalogue is followed page by page for the newest 2 m survey, and the download stitches north up into the framed area, with the part outside Switzerland left empty. Cancelling stops it.

`ONLY=4 node test/panel.mjs` runs one section.

The same checks run on GitHub before every build.

## Releases and automatic updates

The repository is github.com/Tschouna/Weft-Studio. Releases and updates point at it through `npm run set-repo`.

- **Releasing:** change `"version"` in `package.json` (for example 1.1.1 → 1.2.0), commit and push to `main`. GitHub Actions then:
  1. runs the tests,
  2. builds the installer,
  3. publishes it as release `v<version>` on the repository's Releases page.
- **Installed copies:** they check for a newer release when they start, download it, and offer to restart into it. **Help → Check for Updates** checks right away.
- **Other pushes:** pushes that don't change the version still build the installer, attached to the workflow run as an artifact. No release is made.
- **Repository visibility:** the repository must be public for installed copies to see new releases.

## Licences

- **Fonts:** Bricolage Grotesque, Instrument Sans and DM Mono, under the SIL Open Font License 1.1.
- **Libraries:** three.js and fflate, under the MIT licence.
