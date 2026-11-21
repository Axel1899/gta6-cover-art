// shots.js — screenshot mode, driven by the query string:
//
//   ?shot=cover&photo=pier&caption=Sunset%20Heist
//       Just the cover, square, filling the viewport, no editor chrome.
//   ?shot=editor&photo=boulevard&caption=Boulevard%20Queen
//       The full editor with that sample loaded and the caption set.
//
// `photo` is a sample name (samples/<name>.jpg). When the requested scene
// is rendered, window.__shotReady is set to true so the screenshot
// pipeline knows the page is final.

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

if (shot === 'cover' || shot === 'editor') {
  whenAppReady().then((app) => runShot(app, shot)).catch(() => {
    // Even if something failed, do not leave the pipeline hanging.
    window.__shotReady = true;
  });
}

function whenAppReady() {
  if (window.__coverApp) return Promise.resolve(window.__coverApp);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('app not ready')), 8000);
    window.addEventListener(
      'cover-app-ready',
      () => {
        clearTimeout(timer);
        resolve(window.__coverApp);
      },
      { once: true },
    );
  });
}

async function runShot(app, mode) {
  const photo = params.get('photo');
  const caption = params.get('caption');
  const sub = params.get('sub');

  if (mode === 'cover') {
    document.body.classList.add('shot-cover');
    app.setSelectionVisible(false);
    // Render the cover at full screenshot resolution, not preview size.
    const stage = document.getElementById('stage');
    if (stage) {
      stage.width = 1080;
      stage.height = 1080;
    }
  }

  if (photo) {
    try {
      await app.loadSampleAll(photo);
    } catch (err) {
      /* missing sample: the placeholder panels still render */
    }
  }
  if (caption !== null) app.setCaption(caption);
  if (sub !== null) app.setSubcaption(sub);

  // Captions must be drawn in the display font, not a fallback.
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (err) {
      /* fall back to whatever fonts are available */
    }
  }

  app.render();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__shotReady = true;
    });
  });
}
