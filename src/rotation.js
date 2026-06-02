// ─── Constants ────────────────────────────────────────────────────

const PILL_OFFSET_X = 16;
const PILL_OFFSET_Y = -30;

const ZONE_CURSOR_BASE = {
  nw: 315, ne: 45, se: 135, sw: 225, 'top-arm': 0,
};

const SNAP_DEGREES = 15;
const CORNER_DIRS  = new Set(['nw', 'ne', 'se', 'sw']);
const OPP = { nw:'se', ne:'sw', se:'nw', sw:'ne', n:'s', s:'n', e:'w', w:'e' };


// ─── DOM refs ─────────────────────────────────────────────────────

const canvasEl    = document.getElementById('canvas-area');
const wrapper     = document.getElementById('layer-wrapper');
const bboxSvg     = document.getElementById('bbox-svg');
const layerImg    = document.getElementById('layer-img');
const cursorEl    = document.getElementById('custom-cursor');
const cursorSvg   = document.getElementById('cursor-svg');
const pillEl      = document.getElementById('angle-pill');
const pillText    = document.getElementById('pill-text');
const angleReadout = document.getElementById('angle-readout');
const zoneReadout  = document.getElementById('zone-readout');
const snapDot      = document.getElementById('snap-dot');


// ─── State ────────────────────────────────────────────────────────

let rotation        = 0;
let dragging        = false;
let startMouseAngle = 0;
let startLayerAngle = 0;
let lastSnapThreshold = null;
let activeZone      = null;

let resizing          = false;
let resizeDir         = null;
let resizeStartSize   = { w: 0, h: 0 };
let resizePivot       = { x: 0, y: 0 };
let resizeInitialDist = 0;
let resizeCursor      = 'default';

let moving        = false;
let moveStartX    = 0, moveStartY    = 0;
let moveStartLeft = 0, moveStartTop  = 0;

let hoveredCorner  = null;   // 'nw'|'ne'|'se'|'sw' when over a corner scale zone
let hoveredScaleEl = null;   // the actual hovered scale zone element
let cmdRotateMode  = false;  // true while Cmd is held
let lastMouseX     = 0;
let lastMouseY     = 0;
let pillOnLeft     = false;  // pill appears left of cursor for left-side zones


// ─── Layout ───────────────────────────────────────────────────────

function centreLayer() {
  const cw = canvasEl.offsetWidth;
  const ch = canvasEl.offsetHeight;
  wrapper.style.left = Math.round(cw / 2 - wrapper.offsetWidth  / 2) + 'px';
  wrapper.style.top  = Math.round(ch / 2 - wrapper.offsetHeight / 2) + 'px';
}

centreLayer();
window.addEventListener('resize', centreLayer);


// ─── Geometry helpers ─────────────────────────────────────────────

function getLayerCenter() {
  const r = wrapper.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function angleToPoint(mx, my) {
  const c = getLayerCenter();
  return Math.atan2(my - c.y, mx - c.x) * (180 / Math.PI);
}

function normalise(a) { a = a % 360; return a < 0 ? a + 360 : a; }

function snapAngle(a) {
  return Math.round(normalise(a) / SNAP_DEGREES) * SNAP_DEGREES;
}

function rotateVec(dx, dy, angleDeg) {
  const a = angleDeg * Math.PI / 180;
  return { x: dx * Math.cos(a) - dy * Math.sin(a),
           y: dx * Math.sin(a) + dy * Math.cos(a) };
}

function handleLocalOffset(dir, w, h) {
  const hw = w / 2, hh = h / 2;
  return ({
    nw: [-hw, -hh], ne: [hw, -hh], se: [hw,  hh], sw: [-hw,  hh],
    n:  [0,  -hh],  s:  [0,   hh], e:  [hw,   0], w:  [-hw,   0],
  })[dir];
}


// ─── Bbox update ──────────────────────────────────────────────────

function updateBbox(w, h) {
  const re = w - 4, be = h - 4, mx = w / 2 - 4, my = h / 2 - 4, cx = w / 2;
  bboxSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  bboxSvg.innerHTML = `
    <rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#4a90e2" stroke-width="1.2"/>
    <rect x="-4"    y="-4"    width="8" height="8" fill="#1a1a2e" stroke="#4a90e2" stroke-width="1.2" rx="1"/>
    <rect x="${re}" y="-4"    width="8" height="8" fill="#1a1a2e" stroke="#4a90e2" stroke-width="1.2" rx="1"/>
    <rect x="${re}" y="${be}" width="8" height="8" fill="#1a1a2e" stroke="#4a90e2" stroke-width="1.2" rx="1"/>
    <rect x="-4"    y="${be}" width="8" height="8" fill="#1a1a2e" stroke="#4a90e2" stroke-width="1.2" rx="1"/>
    <rect x="${mx}" y="-4"    width="8" height="8" fill="#1a1a2e" stroke="#4a90e2" stroke-width="1.2" rx="1"/>
    <rect x="${mx}" y="${be}" width="8" height="8" fill="#1a1a2e" stroke="#4a90e2" stroke-width="1.2" rx="1"/>
    <rect x="-4"    y="${my}" width="8" height="8" fill="#1a1a2e" stroke="#4a90e2" stroke-width="1.2" rx="1"/>
    <rect x="${re}" y="${my}" width="8" height="8" fill="#1a1a2e" stroke="#4a90e2" stroke-width="1.2" rx="1"/>
    <line x1="${cx}" y1="-4" x2="${cx}" y2="-40" stroke="#4a90e2" stroke-width="1.2"/>
    <rect x="${cx-4}" y="-44" width="8" height="8" fill="#1a1a2e" stroke="#4a90e2" stroke-width="1.2" rx="1"/>
  `;
}


// ─── Rotation application ─────────────────────────────────────────

function applyRotation(deg) {
  rotation = deg;
  wrapper.style.transform = `rotate(${deg}deg)`;
  let display = deg % 360;
  if (display > 180)       display -= 360;
  else if (display < -180) display += 360;
  display = Math.round(display);
  pillText.textContent = display + '°';
  if (angleReadout) angleReadout.textContent = display + '°';
}


// ─── Cursor management ────────────────────────────────────────────

function orientCursor(zone) {
  const base = ZONE_CURSOR_BASE[zone] ?? 0;
  cursorSvg.style.transform = `rotate(${base + rotation}deg)`;
}

const LEFT_ZONES = new Set(['nw', 'sw']);

function moveCursorEl(mx, my) {
  cursorEl.style.left = mx + 'px';
  cursorEl.style.top  = my + 'px';
  const pillW = pillEl.offsetWidth || 60;
  const pillX = pillOnLeft
    ? (mx - PILL_OFFSET_X - pillW)
    : (mx + PILL_OFFSET_X);
  pillEl.style.left = pillX + 'px';
  pillEl.style.top  = (my + PILL_OFFSET_Y) + 'px';
}

function showCursor(zone, mx, my) {
  pillOnLeft = LEFT_ZONES.has(zone);
  orientCursor(zone);
  // Make pill visible before measuring its width for left-side positioning
  cursorEl.style.display = 'block';
  pillEl.style.display   = 'flex';
  moveCursorEl(mx, my);
  canvasEl.style.cursor  = 'none';
  document.body.style.cursor = 'none';
  if (zoneReadout) zoneReadout.textContent = zone;
}

function hideCursor() {
  if (dragging || moving) return;
  cursorEl.style.display = 'none';
  pillEl.style.display   = 'none';
  canvasEl.style.cursor  = 'default';
  document.body.style.cursor = 'default';
  if (zoneReadout) zoneReadout.textContent = '—';
  activeZone = null;
  pillOnLeft = false;
}

function restoreScaleCursor(el) {
  if (!el) return;
  el.style.cursor = el.dataset.dir ? `${el.dataset.dir}-resize` : 'default';
}


// ─── Snap feedback ────────────────────────────────────────────────

function triggerSnapPulse(snappedAngle) {
  if (snappedAngle === lastSnapThreshold) return;
  lastSnapThreshold = snappedAngle;
  if (snapDot) {
    snapDot.classList.remove('visible');
    void snapDot.offsetWidth;
    snapDot.classList.add('visible');
  }
}

function clearSnapFeedback() {
  lastSnapThreshold = null;
  if (snapDot) snapDot.classList.remove('visible');
}


// ─── Rotation zones ───────────────────────────────────────────────

document.querySelectorAll('.rot-zone').forEach(zone => {
  const zid = zone.dataset.zone;

  zone.addEventListener('mouseenter', e => {
    if (moving) return;
    activeZone = zid;
    showCursor(zid, e.clientX, e.clientY);
  });

  zone.addEventListener('mouseleave', () => {
    if (!dragging) hideCursor();
  });

  zone.addEventListener('mousedown', e => {
    e.preventDefault();
    dragging = true;
    activeZone = zid;
    startMouseAngle = angleToPoint(e.clientX, e.clientY);
    startLayerAngle = rotation;
    document.body.style.cursor = 'none';
  });
});


// ─── Scale zones ─────────────────────────────────────────────────

document.querySelectorAll('.scale-zone').forEach(z => {
  const dir      = z.dataset.dir;
  const isCorner = CORNER_DIRS.has(dir);

  z.addEventListener('mouseenter', e => {
    if (moving) return;
    hoveredCorner  = isCorner ? dir : null;
    hoveredScaleEl = z;
    if (!dragging && !resizing) {
      if (cmdRotateMode && isCorner) {
        z.style.cursor = 'none';
        showCursor(dir, e.clientX, e.clientY);
      } else {
        hideCursor();
      }
    }
  });

  z.addEventListener('mouseleave', () => {
    hoveredCorner  = null;
    hoveredScaleEl = null;
    restoreScaleCursor(z);
    if (!dragging && !resizing) hideCursor();
  });

  z.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();

    if (cmdRotateMode && isCorner) {
      // Cmd + corner → rotation
      dragging = true;
      activeZone = dir;
      startMouseAngle = angleToPoint(e.clientX, e.clientY);
      startLayerAngle = rotation;
      document.body.style.cursor = 'none';
      return;
    }

    // Normal proportional resize
    const w = wrapper.offsetWidth;
    const h = wrapper.offsetHeight;
    const [plx, ply] = handleLocalOffset(OPP[dir], w, h);
    const c  = getLayerCenter();
    const rv = rotateVec(plx, ply, rotation);
    resizePivot       = { x: c.x + rv.x, y: c.y + rv.y };
    const dx = e.clientX - resizePivot.x;
    const dy = e.clientY - resizePivot.y;
    resizeInitialDist = Math.sqrt(dx * dx + dy * dy);
    resizeStartSize   = { w, h };
    resizeDir         = dir;
    resizeCursor      = `${dir}-resize`;
    resizing          = true;
    document.body.style.cursor = resizeCursor;
  });
});


// ─── Move (drag layer body) ───────────────────────────────────────

layerImg.addEventListener('mousedown', e => {
  if (dragging || resizing) return;
  e.preventDefault();
  moving        = true;
  moveStartX    = e.clientX;
  moveStartY    = e.clientY;
  moveStartLeft = parseInt(wrapper.style.left) || 0;
  moveStartTop  = parseInt(wrapper.style.top)  || 0;
  document.body.style.cursor = 'grabbing';
  canvasEl.style.cursor      = 'grabbing';
});


// ─── Cmd key → corner rotation mode ──────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key !== 'Meta' || cmdRotateMode || dragging || resizing || moving) return;
  cmdRotateMode = true;
  if (hoveredCorner && hoveredScaleEl) {
    hoveredScaleEl.style.cursor = 'none';
    showCursor(hoveredCorner, lastMouseX, lastMouseY);
  }
});

document.addEventListener('keyup', e => {
  if (e.key !== 'Meta') return;
  cmdRotateMode = false;
  if (!dragging) {
    restoreScaleCursor(hoveredScaleEl);
    hideCursor();
  }
});


// ─── Global mouse move ────────────────────────────────────────────

document.addEventListener('mousemove', e => {
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  if (moving) {
    wrapper.style.left = (moveStartLeft + e.clientX - moveStartX) + 'px';
    wrapper.style.top  = (moveStartTop  + e.clientY - moveStartY) + 'px';
    document.body.style.cursor = 'grabbing';
    return;
  }

  if (resizing) {
    const dx   = e.clientX - resizePivot.x;
    const dy   = e.clientY - resizePivot.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (resizeInitialDist > 1) {
      const ratio = dist / resizeInitialDist;
      const newW  = Math.max(40, Math.round(resizeStartSize.w * ratio));
      const newH  = Math.max(40, Math.round(resizeStartSize.h * ratio));
      const [plx, ply] = handleLocalOffset(OPP[resizeDir], newW, newH);
      const rv  = rotateVec(plx, ply, rotation);
      const cr  = canvasEl.getBoundingClientRect();
      const newCx = resizePivot.x - rv.x;
      const newCy = resizePivot.y - rv.y;
      wrapper.style.width  = newW + 'px';
      wrapper.style.height = newH + 'px';
      wrapper.style.left   = Math.round(newCx - newW / 2 - cr.left) + 'px';
      wrapper.style.top    = Math.round(newCy - newH / 2 - cr.top)  + 'px';
      updateBbox(newW, newH);
    }
    document.body.style.cursor = resizeCursor;
    return;
  }

  if (cursorEl.style.display !== 'none') {
    moveCursorEl(e.clientX, e.clientY);
    if (activeZone) orientCursor(activeZone);
  }

  if (!dragging) return;

  const delta = angleToPoint(e.clientX, e.clientY) - startMouseAngle;
  let newRotation = startLayerAngle + delta;

  if (e.shiftKey) {
    const snapped = snapAngle(newRotation);
    triggerSnapPulse(snapped);
    newRotation = snapped;
  } else {
    clearSnapFeedback();
  }

  applyRotation(newRotation);
});


// ─── Global mouse up ──────────────────────────────────────────────

document.addEventListener('mouseup', () => {
  if (moving) {
    moving = false;
    canvasEl.style.cursor      = 'default';
    document.body.style.cursor = 'default';
    return;
  }

  if (resizing) {
    resizing  = false;
    resizeDir = null;
    document.body.style.cursor = 'default';
    return;
  }

  if (!dragging) return;
  dragging = false;
  clearSnapFeedback();

  // If Cmd+corner rotation, restore rotation cursor while still hovering
  if (cmdRotateMode && hoveredCorner && hoveredScaleEl) {
    showCursor(hoveredCorner, lastMouseX, lastMouseY);
    document.body.style.cursor = 'none';
  } else {
    document.body.style.cursor = 'default';
    if (!activeZone) hideCursor();
  }
  activeZone = null;
});

document.addEventListener('mouseleave', () => {
  if (dragging)  { dragging  = false; hideCursor(); document.body.style.cursor = 'default'; }
  if (resizing)  { resizing  = false; resizeDir = null; document.body.style.cursor = 'default'; }
  if (moving)    { moving    = false; document.body.style.cursor = 'default'; }
});


// ─── Init ─────────────────────────────────────────────────────────

applyRotation(0);
