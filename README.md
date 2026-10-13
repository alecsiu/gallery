# Gallery Wall Planner

A single-page app for planning a gallery wall: enter your art and frames, drag them around a to-scale wall, see the
spacing between everything, and get suggested arrangements.

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (units, geometry, suggestions, storage, undo)
npm run build      # typecheck + production build in dist/
```

## Features

- **Art, mat and frame sizes.** Enter the art size, the mat (left/right and top/bottom separately) and the frame
  moulding width. The inner (opening) and outer sizes are calculated and shown read-only.
- **Units.** Inches or cm, switchable at any time. Inputs accept `11.5`, `11 3/4`, `8' 4"`, `5 cm`, `50mm`. Everything is
  stored in inches.
- **Drag and drop** on a to-scale wall. Snaps to other frames' edges and centers, the wall's center lines, and a
  preferred gap; hold **Alt** to move freely. Arrow keys nudge the selected frame (Shift for bigger steps).
  Frames that overlap or leave the wall are outlined in red.
- **Dimension lines** between each frame and its nearest neighbors (live while dragging), plus distances to the wall
  edges for the selected frame.
- **Wall constraints.** Drag the wall's edge handles or type its size. An optional furniture guide (sofa, console)
  can be positioned under the art.
- **Suggested layouts.** Classic patterns (centered row, symmetric, grid, rows, staircase, salon cluster) are generated
  for your pieces, filtered to those that fit, scored for even gaps, balance, width and alignment, and shown as
  thumbnails. Click one to apply it (undoable); Shuffle for new variations. Without furniture, art is centered 57" above
  the floor; with furniture it hangs 8" above it, centered on it.
- **Saved layouts.** Multiple named layouts persist in the browser's local storage and survive reloads. Save to / load
  from a `.gallery.json` file.
- **Undo/redo** (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z), piece images, **PNG export**, and **Print** (wall plan plus a hanging
  list with each piece's distance from the left edge, top and floor).

Layout files are JSON (`{ "app": "gallery-wall-planner", "version": 1, "layout": { ... } }`) with all lengths in
inches; files are validated on load.
