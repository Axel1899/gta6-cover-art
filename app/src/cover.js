// cover.js — rendering engine for the GTA-style cover art maker.
//
// Pure canvas drawing, no DOM and no dependencies. The editor (main.js)
// keeps a `state` object and hands it to drawCover(); the same function is
// used for the live preview, for PNG export at any size, and for the
// screenshot mode, so what you see is exactly what you export.
//
// state = {
//   layout:    'classic' | 'trio' | 'mosaic',
//   panels:    [ { img, dx, dy, scale }, ... ],  // one entry per panel
//   grade:     'sunset' | 'neon' | 'noir',
//   caption:   'MAIN TITLE',
//   subcaption:'SMALLER LINE ABOVE'
// }
// dx / dy are offsets in fractions of the canvas size, scale is a zoom
// multiplier on top of the cover-fit scale. img may be null (placeholder).

// ---------------------------------------------------------------------------
// Layouts. Panels are polygons in relative 0..1 coordinates that tile the
// frame exactly; drawCover insets each polygon a touch toward its centroid,
// which opens the thin dark gaps between panels.
// ---------------------------------------------------------------------------

export const LAYOUTS = [
  {
    id: 'classic',
    name: 'Classic Five',
    panels: [
      // top-left feature panel
      [[0, 0], [0.62, 0], [0.52, 0.44], [0, 0.48]],
      // top-right panel
      [[0.62, 0], [1, 0], [1, 0.42], [0.52, 0.44]],
      // middle-right panel
      [[1, 0.42], [1, 0.78], [0.68, 0.72], [0.52, 0.44]],
      // bottom-right panel
      [[1, 0.78], [1, 1], [0.42, 1], [0.36, 0.66], [0.68, 0.72]],
      // bottom-left panel
      [[0, 0.48], [0.52, 0.44], [0.36, 0.66], [0.42, 1], [0, 1]],
    ],
  },
  {
    id: 'trio',
    name: 'Bold Trio',
    panels: [
      // tall left panel
      [[0, 0], [0.44, 0], [0.34, 1], [0, 1]],
      // top-right panel
      [[0.44, 0], [1, 0], [1, 0.55], [0.39, 0.5]],
      // bottom-right panel
      [[0.39, 0.5], [1, 0.55], [1, 1], [0.34, 1]],
    ],
  },
  {
    id: 'mosaic',
    name: 'Six Mosaic',
    panels: [
      [[0, 0], [0.36, 0], [0.36, 0.45], [0, 0.52]],
      [[0.36, 0], [0.68, 0], [0.68, 0.55], [0.36, 0.45]],
      [[0.68, 0], [1, 0], [1, 0.46], [0.68, 0.55]],
      [[0, 0.52], [0.36, 0.45], [0.36, 1], [0, 1]],
      [[0.36, 0.45], [0.68, 0.55], [0.68, 1], [0.36, 1]],
      [[0.68, 0.55], [1, 0.46], [1, 1], [0.68, 1]],
    ],
  },
];

export function getLayout(id) {
  return LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function centroid(poly) {
  let x = 0;
  let y = 0;
  for (const [px, py] of poly) {
    x += px;
    y += py;
  }
  return [x / poly.length, y / poly.length];
}

function bounds(poly) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of poly) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// Pull every vertex toward the centroid so neighbouring panels separate by
// a roughly even dark gap of about gapPx pixels.
function insetPolygon(poly, W, H, gapPx) {
  const [cx, cy] = centroid(poly);
  let radius = 0;
  for (const [px, py] of poly) {
    radius += Math.hypot((px - cx) * W, (py - cy) * H);
  }
  radius /= poly.length;
  const k = Math.min(0.995, Math.max(0.88, 1 - gapPx / Math.max(radius, 1)));
  return poly.map(([px, py]) => [
    (cx + (px - cx) * k) * W,
    (cy + (py - cy) * k) * H,
  ]);
}

function tracePath(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

// Ray-casting point-in-polygon on relative coordinates; the editor uses it
// to know which panel a click landed in. Returns -1 when nothing is hit.
export function panelAt(layout, x, y) {
  for (let i = 0; i < layout.panels.length; i++) {
    const poly = layout.panels[i];
    let inside = false;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [ax, ay] = poly[a];
      const [bx, by] = poly[b];
      if (
        ay > y !== by > y &&
        x < ((bx - ax) * (y - ay)) / (by - ay) + ax
      ) {
        inside = !inside;
      }
    }
    if (inside) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Colour grades. A ctx.filter applied while the photo is drawn does the
// heavy lifting; a tinted gradient wash on top of each panel sells it.
// ---------------------------------------------------------------------------

const GRADES = {
  sunset: {
    filter: 'saturate(1.3) contrast(1.06) brightness(1.03)',
    wash: [
      [0, 'rgba(255, 122, 26, 0.20)'],
      [0.45, 'rgba(255, 60, 110, 0.05)'],
      [1, 'rgba(64, 10, 92, 0.34)'],
    ],
  },
  neon: {
    filter: 'saturate(1.55) contrast(1.12) brightness(1.02)',
    wash: [
      [0, 'rgba(0, 229, 255, 0.14)'],
      [0.55, 'rgba(120, 0, 255, 0.06)'],
      [1, 'rgba(255, 0, 153, 0.24)'],
    ],
  },
  noir: {
    filter: 'grayscale(0.88) contrast(1.22) brightness(0.94)',
    wash: [
      [0, 'rgba(0, 0, 0, 0.30)'],
      [0.5, 'rgba(0, 0, 0, 0.02)'],
      [1, 'rgba(0, 0, 0, 0.42)'],
    ],
  },
};

export const GRADE_IDS = Object.keys(GRADES);

// ---------------------------------------------------------------------------
// Film grain: one shared noise tile, generated once and reused as a pattern.
// ---------------------------------------------------------------------------

let grainTile = null;

function getGrainTile() {
  if (grainTile) return grainTile;
  const size = 140;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 96 + Math.floor(Math.random() * 96);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

// ---------------------------------------------------------------------------
// Panel drawing
// ---------------------------------------------------------------------------

// Placeholder look for a panel with no photo yet: a moody diagonal gradient
// with a soft sun disc, different hue per panel so the collage still reads.
function drawPlaceholder(ctx, pts, b, index, W, H) {
  const hues = [
    ['#2b1055', '#7597de'],
    ['#0f2027', '#2c5364'],
    ['#3a1c71', '#d76d77'],
    ['#141e30', '#cb3066'],
    ['#232526', '#f7971e'],
    ['#1a2a6c', '#b21f1f'],
  ];
  const [from, to] = hues[index % hues.length];
  const grad = ctx.createLinearGradient(b.minX, b.minY, b.maxX, b.maxY);
  grad.addColorStop(0, from);
  grad.addColorStop(1, to);
  ctx.fillStyle = grad;
  ctx.fill();
  const r = Math.min(b.w, b.h) * 0.26;
  const sun = ctx.createRadialGradient(
    b.minX + b.w * 0.68, b.minY + b.h * 0.34, 0,
    b.minX + b.w * 0.68, b.minY + b.h * 0.34, r * 2.2,
  );
  sun.addColorStop(0, 'rgba(255, 214, 140, 0.55)');
  sun.addColorStop(1, 'rgba(255, 214, 140, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(b.minX, b.minY, b.w, b.h);
}

function drawPanel(ctx, W, H, layout, index, panelState, grade) {
  const poly = layout.panels[index];
  const pts = insetPolygon(poly, W, H, Math.max(3, W * 0.007));
  const b = bounds(pts.map(([x, y]) => [x / W, y / H]));
  const px = {
    minX: b.minX * W,
    minY: b.minY * H,
    maxX: (b.minX + b.w) * W,
    maxY: (b.minY + b.h) * H,
    w: b.w * W,
    h: b.h * H,
  };

  ctx.save();
  tracePath(ctx, pts);
  ctx.clip();

  const img = panelState && panelState.img;
  if (img && img.naturalWidth > 0) {
    // Cover-fit the photo into the panel's bounding box, then apply the
    // per-panel zoom and offset.
    const zoom = panelState.scale || 1;
    const fit = Math.max(px.w / img.naturalWidth, px.h / img.naturalHeight);
    const dw = img.naturalWidth * fit * zoom;
    const dh = img.naturalHeight * fit * zoom;
    const cx = px.minX + px.w / 2 + (panelState.dx || 0) * W;
    const cy = px.minY + px.h / 2 + (panelState.dy || 0) * H;
    try {
      ctx.filter = grade.filter;
    } catch (err) {
      /* older engines: the wash below still grades the panel */
    }
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    try {
      ctx.filter = 'none';
    } catch (err) {
      /* ignore */
    }
  } else {
    drawPlaceholder(ctx, pts, px, index, W, H);
  }

  // Grade wash over the whole panel.
  const wash = ctx.createLinearGradient(0, 0, 0, H);
  for (const [stop, colour] of grade.wash) wash.addColorStop(stop, colour);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  ctx.restore();

  // Crisp dark edge around the panel.
  ctx.save();
  tracePath(ctx, pts);
  ctx.strokeStyle = 'rgba(5, 5, 10, 0.85)';
  ctx.lineWidth = Math.max(1.5, W * 0.0022);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Caption lettering
// ---------------------------------------------------------------------------

function fitFontSize(ctx, text, fontFamily, weight, maxWidth, startSize) {
  let size = startSize;
  while (size > 10) {
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size *= 0.94;
  }
  return size;
}

function drawCaption(ctx, W, H, caption, subcaption) {
  const main = (caption || '').trim();
  const sub = (subcaption || '').trim();
  if (!main && !sub) return;

  const family = `'CoverDisplay', 'Arial Black', sans-serif`;
  const centreX = W / 2;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';

  // Slight italic shear, pivoting on the caption's anchor point.
  const baseY = H * 0.945;
  ctx.translate(centreX, baseY);
  ctx.transform(1, 0, -0.07, 1, 0, 0);
  ctx.translate(-centreX, -baseY);

  if (main) {
    const size = fitFontSize(
      ctx, main.toUpperCase(), family, '', W * 0.92, H * 0.155,
    );
    ctx.font = `${size}px ${family}`;
    const text = main.toUpperCase();
    const shadow = Math.max(3, size * 0.055);
    // Hard drop shadow first, then the thick outline, then the white fill.
    ctx.fillStyle = 'rgba(8, 6, 12, 0.9)';
    ctx.fillText(text, centreX + shadow, baseY + shadow);
    ctx.strokeStyle = '#0b0b10';
    ctx.lineWidth = Math.max(3, size * 0.16);
    ctx.strokeText(text, centreX, baseY);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, centreX, baseY);

    if (sub) {
      const subSize = fitFontSize(
        ctx, sub.toUpperCase(), family, '', W * 0.8, H * 0.052,
      );
      ctx.font = `${subSize}px ${family}`;
      try {
        ctx.letterSpacing = `${Math.round(subSize * 0.14)}px`;
      } catch (err) {
        /* letterSpacing is a progressive enhancement */
      }
      const subY = baseY - size * 1.08;
      const subText = sub.toUpperCase();
      ctx.fillStyle = 'rgba(8, 6, 12, 0.9)';
      ctx.fillText(subText, centreX + subSize * 0.07, subY + subSize * 0.07);
      ctx.strokeStyle = '#0b0b10';
      ctx.lineWidth = Math.max(2, subSize * 0.18);
      ctx.strokeText(subText, centreX, subY);
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(subText, centreX, subY);
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// The cover itself
// ---------------------------------------------------------------------------

export function drawCover(ctx, W, H, state) {
  const layout = getLayout(state.layout);
  const grade = GRADES[state.grade] || GRADES.sunset;

  // Backdrop the panel gaps show through.
  ctx.fillStyle = '#07070c';
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < layout.panels.length; i++) {
    drawPanel(ctx, W, H, layout, i, state.panels[i], grade);
  }

  // Vignette to pull the eye to the centre.
  const vg = ctx.createRadialGradient(
    W / 2, H * 0.44, Math.min(W, H) * 0.34,
    W / 2, H * 0.5, Math.max(W, H) * 0.78,
  );
  vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vg.addColorStop(1, 'rgba(0, 0, 0, 0.44)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // Subtle film grain over everything.
  ctx.save();
  ctx.globalAlpha = 0.055;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(getGrainTile(), 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // A soft scrim behind the lettering keeps captions readable even over
  // bright, busy photography.
  if ((state.caption || '').trim() || (state.subcaption || '').trim()) {
    const scrim = ctx.createLinearGradient(0, H * 0.6, 0, H);
    scrim.addColorStop(0, 'rgba(0, 0, 0, 0)');
    scrim.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, H * 0.6, W, H * 0.4);
  }

  drawCaption(ctx, W, H, state.caption, state.subcaption);
}
