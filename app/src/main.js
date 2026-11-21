// main.js — the editor: live preview, panel selection, photo framing,
// captions and PNG export. All photos are read locally in the browser;
// nothing is uploaded anywhere.

import { LAYOUTS, getLayout, drawCover, panelAt } from './cover.js';

const SAMPLES = ['boulevard', 'pier', 'heroine', 'driver', 'skyline', 'lagoon'];

// ---------------------------------------------------------------------------
// State. Panel framing is kept per layout, so switching layouts and back
// does not lose your work.
// ---------------------------------------------------------------------------

const panelStore = {};

const state = {
  layout: 'classic',
  panels: [],
  grade: 'sunset',
  caption: '',
  subcaption: '',
};

let selected = 0;
let showSelection = true;

function ensurePanels() {
  const layout = getLayout(state.layout);
  if (!panelStore[layout.id]) {
    panelStore[layout.id] = layout.panels.map(() => ({
      img: null,
      dx: 0,
      dy: 0,
      scale: 1,
    }));
  }
  state.panels = panelStore[layout.id];
  if (selected >= state.panels.length) selected = 0;
}

ensurePanels();

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const selInfo = document.getElementById('selInfo');
const zoomRange = document.getElementById('zoomRange');

function render() {
  drawCover(ctx, canvas.width, canvas.height, state);
  if (showSelection) drawSelection();
  syncPanelNote();
}

function drawSelection() {
  const layout = getLayout(state.layout);
  const poly = layout.panels[selected];
  if (!poly) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.save();
  ctx.beginPath();
  poly.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x * W, y * H);
    else ctx.lineTo(x * W, y * H);
  });
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255, 210, 63, 0.95)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.stroke();
  ctx.restore();
}

function syncPanelNote() {
  selInfo.innerHTML =
    `Panel <strong>${selected + 1} of ${state.panels.length}</strong> ` +
    'is selected — drag on the cover or use the zoom slider to frame its photo.';
  const panel = state.panels[selected];
  if (panel) zoomRange.value = String(Math.min(3.5, Math.max(1, panel.scale)));
}

// The display font loads async; re-render once it is usable so captions
// pick it up without the user touching anything.
if (document.fonts) {
  if (document.fonts.load) {
    document.fonts.load('80px CoverDisplay').then(render).catch(() => {});
  }
  if (document.fonts.ready) {
    document.fonts.ready.then(render).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Photo loading (local only)
// ---------------------------------------------------------------------------

function imageFromURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function imageFromFile(file) {
  const url = URL.createObjectURL(file);
  return imageFromURL(url).then(
    (img) => {
      URL.revokeObjectURL(url);
      return img;
    },
    (err) => {
      URL.revokeObjectURL(url);
      throw err;
    },
  );
}

function setAllPanels(img) {
  for (const panel of state.panels) {
    panel.img = img;
    panel.dx = 0;
    panel.dy = 0;
    panel.scale = 1;
  }
  render();
}

function setSelectedPanel(img) {
  const panel = state.panels[selected];
  if (!panel) return;
  panel.img = img;
  panel.dx = 0;
  panel.dy = 0;
  panel.scale = 1;
  render();
}

async function loadSampleAll(name) {
  const img = await imageFromURL(`samples/${name}.jpg`);
  setAllPanels(img);
  return img;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

document.getElementById('allPhoto').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    setAllPanels(await imageFromFile(file));
  } catch (err) {
    /* unreadable file: leave the cover as it is */
  }
});

document.getElementById('panelPhoto').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    setSelectedPanel(await imageFromFile(file));
  } catch (err) {
    /* unreadable file: leave the panel as it is */
  }
});

// Sample buttons: probe each file first and only show the ones that exist.
const sampleBox = document.getElementById('samples');
for (const name of SAMPLES) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn sample-btn';
  btn.textContent = name;
  btn.hidden = true;
  btn.addEventListener('click', () => {
    loadSampleAll(name).catch(() => {});
  });
  sampleBox.appendChild(btn);
  imageFromURL(`samples/${name}.jpg`).then(
    () => {
      btn.hidden = false;
    },
    () => {
      btn.remove();
    },
  );
}

const layoutSel = document.getElementById('layoutSel');
for (const layout of LAYOUTS) {
  const opt = document.createElement('option');
  opt.value = layout.id;
  opt.textContent = `${layout.name} — ${layout.panels.length} panels`;
  layoutSel.appendChild(opt);
}
layoutSel.value = state.layout;
layoutSel.addEventListener('change', () => {
  state.layout = layoutSel.value;
  ensurePanels();
  selected = 0;
  render();
});

document.getElementById('gradeSel').addEventListener('change', (e) => {
  state.grade = e.target.value;
  render();
});

zoomRange.addEventListener('input', () => {
  const panel = state.panels[selected];
  if (!panel) return;
  panel.scale = parseFloat(zoomRange.value);
  render();
});

const captionInput = document.getElementById('captionInput');
captionInput.addEventListener('input', () => {
  state.caption = captionInput.value;
  render();
});

const subInput = document.getElementById('subInput');
subInput.addEventListener('input', () => {
  state.subcaption = subInput.value;
  render();
});

// ---------------------------------------------------------------------------
// Canvas interaction: click selects a panel, drag frames its photo,
// wheel zooms it.
// ---------------------------------------------------------------------------

let drag = null;

function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height,
    w: rect.width,
    h: rect.height,
  };
}

canvas.addEventListener('pointerdown', (e) => {
  const p = canvasPoint(e);
  const hit = panelAt(getLayout(state.layout), p.x, p.y);
  if (hit >= 0) selected = hit;
  drag = { x: e.clientX, y: e.clientY, w: p.w, h: p.h };
  canvas.classList.add('dragging');
  canvas.setPointerCapture(e.pointerId);
  render();
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const panel = state.panels[selected];
  if (!panel) return;
  panel.dx += (e.clientX - drag.x) / drag.w;
  panel.dy += (e.clientY - drag.y) / drag.h;
  drag.x = e.clientX;
  drag.y = e.clientY;
  render();
});

function endDrag() {
  drag = null;
  canvas.classList.remove('dragging');
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const panel = state.panels[selected];
    if (!panel) return;
    const factor = Math.exp(-e.deltaY * 0.0012);
    panel.scale = Math.min(4, Math.max(1, panel.scale * factor));
    render();
  },
  { passive: false },
);

// Keyboard framing: arrows nudge the selected panel's photo (Shift for
// bigger steps), + / - zoom it. Ignored while typing in a field.
window.addEventListener('keydown', (e) => {
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const panel = state.panels[selected];
  if (!panel) return;
  const step = e.shiftKey ? 0.05 : 0.01;
  let used = true;
  switch (e.key) {
    case 'ArrowLeft':
      panel.dx -= step;
      break;
    case 'ArrowRight':
      panel.dx += step;
      break;
    case 'ArrowUp':
      panel.dy -= step;
      break;
    case 'ArrowDown':
      panel.dy += step;
      break;
    case '+':
    case '=':
      panel.scale = Math.min(4, panel.scale * 1.06);
      break;
    case '-':
    case '_':
      panel.scale = Math.max(1, panel.scale / 1.06);
      break;
    default:
      used = false;
  }
  if (used) {
    e.preventDefault();
    render();
  }
});

// ---------------------------------------------------------------------------
// Export: render offscreen at the exact chosen size and download.
// ---------------------------------------------------------------------------

document.getElementById('exportBtn').addEventListener('click', () => {
  const [w, h] = document
    .getElementById('sizeSel')
    .value.split('x')
    .map(Number);
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  drawCover(off.getContext('2d'), w, h, state);
  off.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gta-cover.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, 'image/png');
});

// ---------------------------------------------------------------------------
// Boot + the small API the screenshot mode (shots.js) drives.
// ---------------------------------------------------------------------------

render();

// Open with a sample already in place so the studio never starts blank;
// if it is missing the gradient placeholders still look intentional.
// In screenshot mode shots.js drives the scene instead, so skip this to
// avoid racing it.
if (!new URLSearchParams(window.location.search).has('shot')) {
  loadSampleAll('pier').catch(() => {});
}

window.__coverApp = {
  state,
  render,
  setCaption(text) {
    state.caption = text || '';
    captionInput.value = state.caption;
    render();
  },
  setSubcaption(text) {
    state.subcaption = text || '';
    subInput.value = state.subcaption;
    render();
  },
  setLayout(id) {
    state.layout = id;
    layoutSel.value = id;
    ensurePanels();
    selected = 0;
    render();
  },
  setGrade(id) {
    state.grade = id;
    document.getElementById('gradeSel').value = id;
    render();
  },
  setSelectionVisible(visible) {
    showSelection = Boolean(visible);
    render();
  },
  loadSampleAll,
  setAllPanels,
};

window.dispatchEvent(new CustomEvent('cover-app-ready'));
