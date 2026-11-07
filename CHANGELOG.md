# Changelog

## 2.7.2

- **Faceted wall planters, measured from the real one:**
  - Rebuilt from your slicer views of the actual model, which is not a cube on its corner.
  - Upright walls round an opening that is almost a rectangle: straight sides out from the wall, and two front faces meeting in a shallow point.
  - A bottom of two slopes meeting in a keel that runs straight out from the wall.
  - A steep diamond facet in front, from the keel's front end up past the side corners to the front edge, just under the rim.
  - Two screw holes near the top corners of the back (Ø 4.8 mm, with a small point on top so they print cleanly), as on the original.
  - Proportions as measured: as tall as it is wide, sides 0.38 and the front point 0.15 of the width, and the diamond's top 0.08 under the rim. The bottom slopes are 45° instead of the original's 39°, so it prints upright with no supports, on a flat strip along the keel.
  - Form → Facets: **Height**, **Sides**, **Front point**, **Diamond under the rim**, plus Width and Wall thickness.

## 2.7.1

- **Faceted wall planters, reshaped to match the real thing:**
  - 2.7.0 tilted a square prism, which only looked right from straight in front. The classic geometric planter is the bottom half of a cube stood on its corner, with upright walls rising from it to the rim. That is what Faceted builds now.
  - The result: a diamond in front whose top corner sits on the rim, two upright triangles above it, upright sides square to the wall, and a five-sided opening.
  - The cube's lower faces lean only 35°, so it prints upright with no supports and no stretching, on a small foot cut off its lowest corner.
  - Form → Facets:
    - **Diamond** stretches the cube upright for a taller diamond (1.00 is a true cube).
    - **Depth** is how far the front corner stands out from the wall; at its deepest the sides run straight back to it.
    - **Rim** at "corner" puts the diamond's top corner on the rim; raise it for upright walls above the diamond.
  - Facet (a true cube) and Prism (taller, with a raised rim) in the Collection follow the new shape.

## 2.7.0

- **Faceted wall planters (new style):**
  - Object → Wall planter → Style: **Faceted**. It is a square stood on its corner, so the front is a diamond, tilted to face a little downward and cut flat against the wall and level at the top. At 35° it is literally a cube on its corner, halved by the wall: the classic geometric wall planter.
  - Form → Facets:
    - **Tilt** leans the front face down.
    - **Diamond** makes it taller than it is wide, or wider.
    - **Depth** sets how far it reaches out. At "level", the front's top corner sits level with the side corners at the wall.
    - **Rim** raises or lowers the opening.
    - **Width** and **Wall thickness** are under Size and Walls.
  - Every face keeps within 45°, so it prints upright, as it hangs, with no supports. It stands on a small flat foot cut off its lowest corner, so use a brim.
  - The flat back has the same keyhole as the rounded wall planter, placed as high as the back allows. No drainage hole.
  - The facets shade crisp in the preview. The readout gives width × height × depth from the wall.
  - New in the Collection: **Facet** (the cube) and **Prism** (a taller diamond). Shuffled wall planters come out faceted about a quarter of the time.

## 2.6.1

- **Globe patterns cover the whole ball:**
  - Patterns used to stop where the ball narrowed to a third of its width, leaving a plain cap on top, and relief faded out on the underside. They now run from the collar right over the top.
  - Relief stands out along the surface of the ball, so it keeps its full depth on the near-flat top and on the underside, not just round the middle.
  - Right at the top, where the pattern's cells shrink to nothing, relief softens over the last few centimetres instead of crowding into spikes. Openwork stops where its openings would get narrower than its strips.
  - Raised patterns on the underside mean supports, as the print check says; Smooth or openwork keep a Peak and Cone globe support-free.
  - Shuffled globes no longer get plain bands.

## 2.6.0

- **Globe lamp (new object):**
  - A closed glowing ball, like an opal globe lamp, standing in a groove in a printed base that takes an E27 lamp kit. It lifts off to change the bulb.
  - Form → Globe: the **Top** is Round or a 45° Peak, the **Underside** Round or a 45° Cone, and **Opening** sets the collar it stands on.
  - Make Height and Diameter equal for a ball, or stretch it into an egg or a flattened orb. Lobed and polygon outlines (also twisted) make melons and faceted lanterns.
  - Patterns stop short of the collar and of the narrow top. Relief glows through the wall; openwork works too.
  - **Needs supports, and says so:** a round globe leans past 45° at the top and underneath. The print check names both places, the overhangs are striped on the model, and it recommends tree supports on the build plate only (inside the ball they grow up through the opening and come out through it). Peak and Cone together print without supports.
  - It warns when the opening is too narrow to lift the globe over an A60 bulb, and that a closed globe keeps the heat in (LED only, 7 W or less).
  - New in the Collection: Opal (a plain round globe), Melon (lobed with ribs) and Bulb (peak and cone, no supports).
- **Translucent filament:**
  - New **Translucent** finish. With the light on, a globe glows through its wall: brighter for translucent filament and light colours, dimmer as the wall thickens, with a hot spot near the bulb when the wall is thin.
  - Globes default to 1.8 mm walls (4 lines). The wall slider shows the number of lines, and the print check says how that wall will glow.
  - **Download the glow test** (under Object, for every lamp): a small curved strip whose wall steps from one line (0.45 mm) to 3 mm, about 6 g. Print it in your filament and hold it over a phone torch to choose a wall.
  - Print guide: a new card on globe lamps and translucent filament.
- **Fixed, found by the shuffle tests:**
  - On open pieces whose base is wider than the wall above it (napkin rings, lamp shades), the inside of the wall dipped up to 0.8 mm below the bed. It now starts on the bed.
  - Where a wall bends sharply inward just under the rim (a low tray with a full belly), the inside of the wall folded into a small flat ceiling that needed supports. The inside now steps in at 45° at most, and the wall is a little thinner across the bend.
  - A napkin ring's inside chamfer is now cut at 40° instead of 45°, so it stays printable when the ring leans in slightly.

## 2.5.0

- **Terrain straight from swisstopo, no more picking tiles by hand:**
  - Pattern → Terrain → **From swisstopo**: type a peak, a place or coordinates (`2617050 1091670` in metres, or `45.976, 7.658` in degrees).
  - Summits and places come first in the results, cable cars and buildings last.
  - A map of the place shows the area that will print. Click the map to move it; **Area** sets its size from 0.5 to 12 km, shaped like your panel.
  - **Fetch the heights** finds the swissALTI3D tiles for the area, downloads them four at a time (newest survey, 2 m grid) and stitches and crops them to the area. Click it again to stop.
  - For small areas (up to 1.5 km), **Finest detail** uses the 0.5 m grid instead. Those files are about 18 MB per km², against about 1 MB.
  - The summary says how many tiles and roughly how many MB before anything downloads, and says when the framed area is the one on the panel.
  - Areas that cross the border print flat at the lowest height there; the message says how much of the area that is.
  - The place and area are remembered, and the readout names the place.
  - Loading files you downloaded yourself still works as before.
  - This is the only part of Weft that goes online, and only when you search or fetch. The desktop app is allowed to reach swisstopo's three open services; the web version can only fetch if the page it runs in allows it, and otherwise says so.

## 2.4.2

- **A much smaller fit test:**
  - It's now just the joint: two small 3 mm pieces, each only big enough to hold the tab or key.
  - About 5 g of filament instead of about 24 g (a dovetail test is 40 × 44 mm in all).
  - The fit is all in the outline of the joint, so the thin test fits exactly like the full-thickness panel.

## 2.4.1

- **Terrain stands out properly:**
  - Mountains were squashed: Depth stopped at 30 mm, so the Matterhorn on a 52 cm panel came out at a fourteenth of its true height.
  - Terrain can now be as deep as your printer is tall. Tiles taller than the printer are flagged in the print check.
  - Loading a model picks a Depth that shows the landscape: true scale where that's printable, up to about a third of the panel's size.
  - The readout says plainly whether Depth squashes the relief or stretches it, and by how much.
  - **True scale depth** goes as far as your printer allows and says so when it can't reach true scale.
  - Terrain now ends in straight sides like a terrain model, instead of being bevelled at the edges.

## 2.4.0

- **Diffuser (new pattern):**
  - Rectangular blocks in rows, each at its own height with a slanted top, like an acoustic diffuser panel.
  - The tops are true flat planes, and grooves you set (1.2–8 mm) keep every block crisp.
  - Tilt sets how far the tops lean; Seed gives a new arrangement.
  - Level seams move into the grooves between rows of blocks.
  - New starting panel: Echo (600 × 600 mm, 50 mm deep).
- **Terrain from real elevation data:**
  - Load elevation models into the new **Terrain** pattern (Pattern → Elevation model):
    - swisstopo's swissALTI3D as Cloud Optimized GeoTIFF or as XYZ text, also straight from the downloaded .zip;
    - DHM25 and other ESRI ASCII grids;
    - any GeoTIFF that is uncompressed, LZW or Deflate (BigTIFF too).
  - Pick several neighbouring tiles at once and they are stitched together by their coordinates.
  - Shows the area, the height range, the scale on your panel (for example 1 : 3,300), the true-scale relief and how much Depth exaggerates it.
  - **Shape the panel like the map** fits the whole area without cropping. **True scale depth** sets Depth to the real relief.
  - **Water level** prints everything below a height flat, like a lake. **Terraces** turns the slopes into contour steps.
  - It works as a relief or as wave ribs. With two-tone tips the peaks come out snowy.
  - The model is remembered on this device.
- **Fit test downloads in the web version:**
  - The fit test is now a .zip with the 3MF, an STL for each piece and a short note on adjusting the clearance.
  - The web page can only save certain file types, so any other download (a .weft design, for example) now comes inside a .zip instead of failing.

## 2.3.0

- **Panels (new compartment):**
  - A second studio beside the first: **Panels** in the top bar (or **View → Panels**, Ctrl+P).
  - Design a wall panel up to 2.4 m across. It slices itself into tiles that fit your printer's bed, and every tile prints face up with no supports.
  - The 3D preview shows it on the wall, as separate tiles, or laid out on print beds. The light can rake low across the relief, and you can turn the panel round to see its back.
- **Wave ribs:**
  - Turn any pattern into parallel ribs that stand on the back plate, each one rising and falling with the pattern, like slatted wave wall art.
  - Rib width, gap, direction (upright, level or any angle), bend (the ribs curve as they run) and lowest rib (so no rib disappears).
  - Ribs go up to 60 mm deep, with straight vertical sides, and print without supports.
  - Upright or level ribs move the seams into the gaps between them, so no rib is cut along its length.
  - Three new broad patterns made for ribs: **Silk** (drifting diagonal folds), **Bloom** (petals opening from a dome) and **Lens** (two fine wave grids gathering into a moiré lens).
  - New rib starting panels: Veil (400 × 600 mm, 6 mm ribs, 35 mm deep, in six tiles for a 256 mm bed), Noir, Corolla, Moiré, Canyon and Eddy.
- **Outlines and edges:**
  - Five outlines: rectangle, rounded, arch, oval and hexagon.
  - Four edges: a raised frame, a 45° bevel, a fade, or flush to the edge.
  - You set the back's thickness.
- **27 patterns:**
  - Dune, Ripple, Chevron, Vortex, Sunburst, Contour, Ridge, Silk, Bloom, Lens, Pyramid, Facet, Pixel, Basalt, Brick, Pebble, Scale, Deco, Tufted, Weave, Reed, Truchet, Moroccan, Trellis, Bubble, Halftone and Picture.
  - Picture turns a photo of yours into relief.
  - Seven of them cut right through as openwork, with solid rails kept along every seam.
  - Each has Depth, Scale, Variation, Angle, Warp and Seed. You can also morph one pattern into another across the panel, fade it out towards one side, or invert it.
- **Slicing into tiles:**
  - By default the panel uses the fewest tiles that fit the bed, turning them a quarter if that fits better. You can also set the tiles across and down yourself.
  - Seams are straight. On patterns with straight grooves they move into the grooves; on cell patterns (Basalt, Pebble, Brick and others) they can follow the cells, so the joins vanish into the relief.
  - Joints:
    - **Dovetail** or **Jigsaw** tabs through the full thickness, with adjustable tab size and clearance.
    - **Hidden keys:** bowties that press into pockets across each seam on the back.
    - **None.**
  - **Download a fit test:** two small pieces with one joint, to dial in the clearance first.
- **The back:**
  - Each tile's name and an up arrow are engraved in its back, mirrored so they read from behind.
  - Hanging, per tile:
    - Mounting tape.
    - Pockets for 10 × 3 mm magnets.
    - Screw slots.
    - **Halo stand-offs:** printed pucks that hold the panel 16 mm off the wall for an LED strip behind it.
- **Finish:**
  - Any filament colour.
  - **Two-tone tips:** the top of the relief becomes its own part in a second colour, for an AMS or one filament change.
  - Matte, satin or silk preview.
  - A choice of wall colours, and a backlight preview with six LED colours.
- **Export, a production kit:**
  - **Complete kit** (a 3MF and an STL for every tile), a 3MF per tile (each opens on its own plate), one 3MF with every tile, or an STL per tile.
  - The loose parts (keys, pucks) come with it.
  - **assembly-map.svg**: every tile in place, with its size and weight.
  - **wall-template.svg**: the same at actual size, with the screws or washers marked.
  - **parts-list.csv** lists every part.
  - **print-settings.txt** has the tile layout, print settings, joining and hanging steps, and the design code.
  - Also: a cover image, Copy design code, and Save to my panels.
- **Starting panels:** 22 ready-made panels (Veil, Noir, Corolla, Moiré, Canyon, Eddy, Dune, Basalt, Atlas, Sunrise, Chester, Riad, Kiln, Loom, Tidal, Pixel, Maelstrom, Halftone, Shingle, Kinetic, Truchet, Odeon), and **Shuffle** for a random one in your size.
- **Fixes:**
  - Opening the app on the Collection or Guide no longer logs a warning from the hidden studio stage.
- **Tests:** `npm test` now also checks panels. Every tile and part of every starting panel, every pattern, rib panels and a batch of random panels must come out closed, fit the bed, and keep their tabs clear of their sockets.

## 2.2.0

- **Candle holder (new object):**
  - A solid base you shape and texture however you like.
  - A pocket at the very top, just the candle's own height deep.
  - Three candle sizes:
    - Tealight (Ø 40).
    - Maxi tealight (Ø 60).
    - Taper candle (Ø 22).
  - Prints solid with infill, with no supports.
  - The light switch shows the candle glowing.
  - LED candles are safest; a real one needs a glass or metal cup.
- **Rounded bottoms:**
  - Hanging and wall planters can now carry their shape on down and close at the bottom, instead of ending flat (Form → Bottom → Rounded).
  - It prints standing on a small foot (use a brim).
  - The texture fades out where it narrows.
  - Wall planters keep a perfectly flat back all the way down.
- **Lids that match the box:**
  - On a twisted square, hexagonal or lobed box, the lid's plug now has the box's own shape instead of turning into a circle.
  - It is shrunk just enough to pass the twisted opening.
- **No more stretched patterns:**
  - Textures get shallower where a wall leans out (bowls, flared pots, rounded bottoms): full depth up to about 20°, little at 44°.
  - Before, deep features there were smeared into long streaks to keep them printable.
  - Swirls now wind at the same angle on a narrow neck as on a wide belly, instead of bending into an S.
- **Napkin rings:**
  - The rim edge (rounded, bevel or rolled lip) can go on both ends.
  - At the bottom, curves that would hang out over the bed become 45° chamfers.
  - A new **Inside chamfer** softens the inner edge at both ends.
- **Collection:** 7 new pieces, 56 in all: Vigil, Altar, Chapel, Pendula, Sconce, Gilt and Keep.

## 2.1.0

- **Plant stands:**
  - Planters, orchid pots and vases can stand on legs, in three styles:
    - **Mid-century:** splayed, tapered legs.
    - **Upright:** straight legs.
    - **Wide:** a low, broad stance.
  - Each stand is two flat pieces that print lying down, with no supports, and slot together into a cross.
  - The pot rests on the crossbars and the legs rise up its sides.
  - Sliders set the height, how far the legs climb the pot, and the leg thickness.
  - Shuffle sometimes adds a stand.
- **Self-watering inserts:**
  - The insert now reaches much deeper into the pot: the reservoir under it defaults to 14 mm and can go down to about 9 mm.
  - A ring of water slots around its foot lets poured water drain straight down and lets the soil drink it back up.
  - The slots have pointed tops, so they print, and they stay clear of the pour channel.
- **Shuffle prints without supports:**
  - Fixed the causes of most shuffled overhangs:
    - Textures on lobed and polygon pieces that flare out.
    - Voronoi openwork.
    - Openwork in the valleys of lobed shapes.
    - Bowls whose inside wall folded under the rim.
    - Twist on short or flared pieces.
  - In a test of 260 shuffles, overhang warnings went from 21% to 4%, and none are serious.
  - Shuffle also checks each candidate and keeps one that prints without supports.
- **Collection:** 5 new pieces on stands, 49 in all: Perch, Stilt, Squat, Terrace and Atelier.

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
