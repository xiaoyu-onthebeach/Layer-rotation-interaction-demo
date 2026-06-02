# PRD — Canvas Layer Interaction Prototype

**Status:** In Progress  
**Type:** Interaction Prototype  
**Stack:** Vanilla HTML / CSS / JS (no build tools)

---

## 1. Overview

This prototype replicates the core layer manipulation interactions found in professional design tools (Figma, Sketch, Framer). It validates the interaction model for a canvas-based editing surface where a single selected layer can be rotated, resized, and moved — with visual affordances that match user expectations from industry-standard tools.

The prototype runs as a static file (`index.html`) opened directly in a browser. No server, framework, or build step is required.

---

## 2. Goals

- Validate that the rotation, resize, and move UX patterns feel natural and match design-tool conventions
- Provide a pixel-accurate reference for the scene container, canvas, and layer interaction chrome
- Serve as a handoff artifact for engineers implementing this in production

---

## 3. Out of Scope

- Multiple layers / multi-selection
- Undo / redo
- Keyboard nudge (arrow keys)
- Asset upload or real image content
- Persistence of state between sessions
- Mobile / touch interactions

---

## 4. Scene Container

The canvas interaction is housed inside a **Scene** panel that represents a named editing environment.

| Property | Value |
|---|---|
| Size | 648 × 692 px (outer) |
| Background | `#131316` |
| Border | `1px solid rgba(255,255,255,0.18)` |
| Border radius | `24px` |
| Padding | `24px` |
| Internal gap | `12px` (between top bar and canvas) |

### 4.1 Top Bar

A 32px-tall header row inside the scene panel.

| Element | Spec |
|---|---|
| **Scene title** | Left-aligned with the canvas edge. Font: Saans 14px / 140% line-height / −1% letter-spacing / white. |
| **Close button** | 32 × 32px circle. Background `#26262C`, border `1px solid #40404A`. Contains a 16 × 16 SVG × icon. Positioned flush right. |

### 4.2 Canvas Area

The interactive surface where the layer lives.

| Property | Value |
|---|---|
| Size | 600 × 600 px |
| Background | `#040406` |
| Border | `1px solid #2F2F37` |
| Grid | Dot grid — `radial-gradient` dots at 40px spacing, `rgba(255,255,255,0.1)` |
| Overflow | Hidden (layers clipped to canvas bounds) |

---

## 5. Layer

The manipulable object on the canvas. Starts at 220 × 220 px, centered in the canvas.

| Property | Value |
|---|---|
| Default size | 220 × 220 px |
| Transform origin | Geometric center |
| Bounding box color | `#4a90e2` |
| Handle fill | `#1a1a2e` |
| Handle size | 8 × 8 px, `rx: 1` (rounded) |

### 5.1 Bounding Box

An SVG overlay rendered on top of the layer content. Consists of:

- Outer stroke rectangle (the selection outline)
- 4 corner handles
- 4 edge midpoint handles
- Rotation arm (vertical line + handle at top — see §6.3)

The bounding box SVG is re-generated on every resize to keep handle positions accurate at any layer dimension.

---

## 6. Rotation

### 6.1 Trigger Zones

Rotation is triggered by hovering specific transparent hit areas placed **outside** the bounding box. There is no rotation trigger along the edges (by design — edge zones were removed to avoid conflict with the midpoint resize handles).

| Zone | Position |
|---|---|
| `nw` corner | 28 × 28 px pad, −20px outside the top-left corner |
| `ne` corner | 28 × 28 px pad, −20px outside the top-right corner |
| `se` corner | 28 × 28 px pad, −20px outside the bottom-right corner |
| `sw` corner | 28 × 28 px pad, −20px outside the bottom-left corner |
| `top-arm` tip | 20 × 20 px zone, centered on the arm handle (−40px above the layer) |

### 6.2 Angle Calculation

Uses a delta-from-grab-point model to avoid snapping to cursor on mousedown:

```
startMouseAngle = atan2(my − centerY, mx − centerX)
startLayerAngle = currentRotation

onMouseMove:
  delta      = atan2(my − centerY, mx − centerX) − startMouseAngle
  newRotation = startLayerAngle + delta
```

### 6.3 Rotation Arm

A vertical visual affordance extending 36px above the top-center of the bounding box. Composed of:

- `<line>` from the top-center handle upward
- A square handle at the tip (same style as resize handles)
- A 20 × 20 px transparent hit zone centered on the tip

The arm tip cursor faces **downward** (toward the layer center), with base angle `0°`.

### 6.4 Angle Display Range

The angle display uses a **signed** −180° → +180° range:

- Rotating clockwise: `0° → 1° → … → 180°`
- Rotating counter-clockwise: `0° → −1° → … → −180°`
- Crossing ±180° wraps to the opposite sign and continues

### 6.5 Shift-Snap

Holding **Shift** during rotation snaps the output angle to the nearest 15° increment. Snap is applied to the final output angle (not the delta), so it locks cleanly at each threshold.

### 6.6 Cursor Orientation

The custom rotation cursor rotates so its arc always faces the correct orbital direction relative to the current layer rotation:

| Zone | Base angle |
|---|---|
| `nw` | 315° |
| `ne` | 45° |
| `se` | 135° |
| `sw` | 225° |
| `top-arm` | 0° |

Applied rotation: `BASE_ANGLE[zone] + currentLayerRotation`

### 6.7 Cmd + Corner (Alternative Rotation Trigger)

When the cursor is hovering a **corner resize handle**, pressing **⌘ Command** switches that corner into rotation mode:

- The resize cursor is replaced by the custom rotation cursor
- Dragging initiates rotation (same delta model as §6.2)
- Releasing ⌘ reverts the corner to resize mode immediately

---

## 7. Resize

### 7.1 Scale Handles

8 handles sit directly on the bounding box corners and edge midpoints at a higher z-index than rotation zones, ensuring the resize cursor always wins when the pointer is on a handle.

| Handle | Position | Cursor |
|---|---|---|
| `sz-nw` | Top-left corner | `nw-resize` |
| `sz-ne` | Top-right corner | `ne-resize` |
| `sz-se` | Bottom-right corner | `se-resize` |
| `sz-sw` | Bottom-left corner | `sw-resize` |
| `sz-n` | Top edge center | `n-resize` |
| `sz-s` | Bottom edge center | `s-resize` |
| `sz-e` | Right edge center | `e-resize` |
| `sz-w` | Left edge center | `w-resize` |

### 7.2 Proportional Scaling

All handles resize the layer **proportionally** (aspect ratio locked). The resize math:

1. On `mousedown`: record the **pivot** (opposite handle) position in screen space, accounting for current layer rotation. Record initial distance from pivot to mouse.
2. On `mousemove`: `ratio = currentDist / initialDist`. Apply ratio to both dimensions.
3. Recompute layer center so the pivot corner stays fixed: `newCenter = pivotScreenPos − rotate(pivotLocalOffset, currentRotation)`.
4. Update `width`, `height`, `left`, `top` on the wrapper (converting from viewport coords to canvas-relative coords).

Minimum layer size: **40 × 40 px**.

### 7.3 Bbox Sync

The bounding box SVG (`viewBox`, all handle coordinates, arm position) is recalculated and re-rendered on every resize frame.

---

## 8. Move

Clicking and dragging anywhere on the **layer body** (the content area, not a handle or rotation zone) translates the layer within the canvas.

- Cursor changes to `grab` on hover, `grabbing` during drag
- Uses a simple delta from drag-start position: `newLeft = startLeft + (mouseX − startX)`
- Move is blocked if a resize or rotation drag is already active
- Layer is not clamped to canvas bounds (can be partially dragged off-screen)

---

## 9. Angle Pill

A floating label that follows the cursor during rotation, showing the current angle.

| Property | Value |
|---|---|
| Background | `#131316` |
| Border | `1px solid #26262C` |
| Border radius | `6px` |
| Size | `min-width: 44px`, `height: 28px` |
| Padding | `6px` |
| Font | Saans 12px / 16px line-height / −1% letter-spacing / white / weight 400 |
| Icon | `rotation 16.svg` (16 × 16, white fill) |
| Gap | `4px` between icon and text |

### 9.1 Positioning

The pill is offset from the cursor hotspot and switches sides based on which zone is active:

| Zone side | Pill position |
|---|---|
| Right side (`ne`, `se`, `top-arm`) | `cursor.x + 16px` (pill left edge) |
| Left side (`nw`, `sw`) | `cursor.x − 16px` (pill right edge) |
| Vertical offset | `cursor.y − 30px` |

---

## 10. Custom Cursor

A 24 × 24 px SVG cursor (`Rotation-cursor 24.svg`) replaces the system cursor over rotation zones and during rotation drags.

- `pointer-events: none`, `position: fixed`, centered on the hotspot via `transform: translate(-50%, -50%)`
- The cursor SVG element receives a CSS `rotate()` transform on every frame to track zone + layer rotation
- The system cursor (`document.body.style.cursor`) is set to `none` while the custom cursor is active to prevent flicker

---

## 11. Interaction Priority

When multiple interaction types could apply simultaneously, the following priority order applies:

1. **Move** — initiated from the layer body; blocks all others while active
2. **Resize** — initiated from a scale zone handle
3. **Rotation** — initiated from a rotation zone or Cmd+corner
4. **Cursor hover** — passive state, no drag active

---

## 12. File Structure

```
rotation-prototype/
├── index.html              ← all DOM structure
├── src/
│   ├── styles.css          ← layout, scene, canvas, zones, cursor, pill
│   └── rotation.js         ← all interaction logic (ES module)
├── Rotation-cursor 24.svg  ← custom rotation cursor icon (24px)
├── rotation 16.svg         ← angle pill icon (16px)
└── PRD.md                  ← this document
```

---

## 13. Design Tokens

| Token | Value | Used for |
|---|---|---|
| `--rot-corner-size` | `28px` | Corner rotation zone size |
| `--rot-corner-offset` | `−20px` | Corner zone offset from layer edge |
| `--handle-hit` | `16px` | Scale zone click target size |
| `--handle-offset` | `−6px` | Scale zone position offset |
| Canvas bg | `#040406` | Canvas background |
| Scene bg | `#131316` | Scene panel background |
| Bbox stroke | `#4a90e2` | Bounding box and handle stroke |
| Handle fill | `#1a1a2e` | Bounding box handle fill |
| Pill bg | `#131316` | Angle pill background |
| Pill border | `#26262C` | Angle pill border |
