# Rotation Prototype — Claude Code Guide

## What this is
A bare HTML/CSS/JS prototype of a canvas layer rotation interaction, matching the
UX model used by Figma, Sketch, and Framer. No build tools, no framework. Open
`index.html` directly in a browser — it just works.

---

## Project structure

```
rotation-prototype/
├── index.html          ← entry point, all DOM structure with comments
├── src/
│   ├── styles.css      ← all layout, zones, cursor, pill, status bar
│   └── rotation.js     ← all interaction logic (ES module)
└── CLAUDE.md           ← this file
```

---

## Core interaction model

### Rotation zones (8 total)
Transparent hit areas placed **outside** the bounding box:

```
  [rz-nw]──[rz-top]──────────────[rz-ne]
     │   [sz-nw]──[sz-n]──[sz-ne]    │
  [rz-left]  │   LAYER CONTENT  │  [rz-right]
     │   [sz-sw]──[sz-s]──[sz-se]    │
  [rz-sw]──[rz-bottom]────────────[rz-se]
```

- **`.rot-zone`** elements: `z-index: 20`, `cursor: none` — trigger the custom cursor
- **`.scale-zone`** elements: `z-index: 25`, resize cursor — override rot zones on handles
- The scale zones being higher z-index means hovering a handle always shows resize, not rotate.

### Angle calculation
```js
// 1. On mousedown: record the atan2 angle and current layer rotation
startMouseAngle = Math.atan2(my - centerY, mx - centerX) * (180/Math.PI);
startLayerAngle = rotation;

// 2. On mousemove: delta + initial = no snap-to-cursor jump
newRotation = startLayerAngle + (currentMouseAngle - startMouseAngle);

// 3. Shift-snap: applied to OUTPUT, not delta
if (shiftKey) newRotation = Math.round(normalise(newRotation) / 15) * 15;
```

### Cursor orientation
The arc-arrow cursor rotates by `BASE_ANGLE[zone] + currentLayerRotation`.
This keeps the arrow facing the correct orbital direction even after the layer
has been rotated. Base angles:

| Zone   | Base° | Zone   | Base° |
|--------|-------|--------|-------|
| nw     | 315   | se     | 135   |
| top    | 0     | bottom | 180   |
| ne     | 45    | sw     | 225   |
| right  | 90    | left   | 270   |

---

## CSS variables (easy tuning)
All zone dimensions are in `:root` in `styles.css`:

| Variable              | Default | What it controls                        |
|-----------------------|---------|-----------------------------------------|
| `--rot-zone-reach`    | 16px    | How far outside the edge zones extend   |
| `--rot-zone-depth`    | 20px    | Total thickness of edge strips          |
| `--rot-zone-inset`    | 8px     | Gap between edge strip and corner zones |
| `--rot-corner-size`   | 28px    | Size of corner rotation pads            |
| `--rot-corner-offset` | -20px   | How far outside the layer corners sit   |
| `--handle-hit`        | 16px    | Click target size for scale handles     |
| `--handle-offset`     | -6px    | Position of scale handles (centered)    |

---

## Suggested next steps for Claude Code

### 1. Swap in a real product image
Replace the `<div id="layer-img">` placeholder in `index.html`:
```html
<div id="layer-img">
  <img src="your-product.png" alt="Product layer" />
</div>
```

### 2. Make the layer draggable (move)
Add a `mousedown` listener on `#layer-img` (the layer body, not zones).
Use `pointermove` + `pointerup` to translate `#layer-wrapper` via `left`/`top`.
Guard: only activate when the target is NOT a `.rot-zone` or `.scale-zone`.

### 3. Add scale/resize interaction
The `.scale-zone` elements already have correct resize cursors.
Wire `mousedown` on each, track delta from drag start, and update
`#layer-wrapper` `width`/`height`. Remember to recalculate `transform-origin`
if you allow non-centre pivots.

### 4. Show rotation guide line
While dragging, draw an SVG line from the layer centre to the cursor.
Append a temporary `<svg>` overlay to `#canvas-area`, positioned fixed.

### 5. Multiple layers + selection
Wrap the layer logic in a `Layer` class. Render multiple instances.
Track `selectedLayer` globally; only show bbox + zones on the selected one.

### 6. Keyboard shortcuts
- `R` to enter rotation mode (show cursor at last-hovered corner)
- `Escape` to cancel drag and restore `startLayerAngle`
- Arrow keys to nudge rotation by 1° (or 15° with Shift)

### 7. Angle pill position variants
Current offset: `+16px right, -30px up`.
Consider switching to always-above-cursor when near the right edge of the canvas:
```js
const nearRightEdge = e.clientX > canvasEl.getBoundingClientRect().right - 80;
pillEl.style.left = nearRightEdge
  ? (e.clientX - pillEl.offsetWidth - 8) + 'px'
  : (e.clientX + PILL_OFFSET_X) + 'px';
```

### 8. Animate snap
On each snap threshold hit, add a brief CSS transition to the layer transform:
```js
wrapper.style.transition = 'transform 0.08s ease-out';
// then remove after the transition:
wrapper.addEventListener('transitionend', () => wrapper.style.transition = '', { once: true });
```

---

## Debugging tips

- **Uncomment the red overlay** in `styles.css` under `.rot-zone` to visualise
  all rotation hit areas at once.
- **Zone boundaries wrong after resize?** Call `centreLayer()` — zones are CSS
  relative to the wrapper, so they follow automatically.
- **Cursor flickers?** The `document.body.style.cursor = 'none'` guard during
  drag prevents system cursor bleed. If you see flicker on zone enter/leave,
  check that no element between the zone and `document` resets `cursor`.
