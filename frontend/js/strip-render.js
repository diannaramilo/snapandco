/*
 * strip-render.js
 * -----------------
 * Draws the actual "photo strip" onto a <canvas>: the 4 captured
 * photos, cover-fit into the transparent windows of a real frame
 * PNG (frontend/assets/frames/*.png), with the frame drawn on top
 * so its border/branding/decorations sit above the photos.
 *
 * Frame source of truth: frontend/assets/frames/frames.json, which
 * lists each frame's file name and the 4 window rectangles (as
 * fractions of the frame's width/height, top-to-bottom order) that
 * were auto-detected from the transparent areas of the PNG. If you
 * add a new frame PNG later, drop it in assets/frames/, add an entry
 * to frames.json with its window fractions, and it'll show up here
 * automatically — no code changes needed.
 *
 * Used in two places:
 *   - choose-layout.html: one small thumbnail per frame, live-filled
 *     with the guest's own photos
 *   - result.html: the final full-resolution strip that gets
 *     downloaded / QR'd / sent to the backend for printing
 */

const FRAMES_BASE_PATH = "assets/frames/";

let FRAMES = []; // populated by loadFrameCatalog()
const _frameImageCache = new Map();

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function loadImages(dataUrls) {
  return Promise.all(dataUrls.map(loadImage));
}

/* Fetches frames.json and preloads every frame PNG once. Call this
   before drawStrip() / before building the frame gallery. Safe to
   call multiple times — later calls reuse the cache. */
async function loadFrameCatalog() {
  if (FRAMES.length) return FRAMES;
  const res = await fetch(FRAMES_BASE_PATH + "frames.json");
  const catalog = await res.json();

  await Promise.all(
    catalog.map(async (frame) => {
      const img = await loadImage(FRAMES_BASE_PATH + frame.file);
      _frameImageCache.set(frame.id, img);
    })
  );

  FRAMES = catalog;
  return FRAMES;
}

function getFrameById(id) {
  return FRAMES.find((f) => f.id === id);
}

function getFrameImage(id) {
  return _frameImageCache.get(id);
}

/*
 * Draws one full strip into the given canvas.
 * canvas.width/height should already be set (e.g. 600x1800 for a
 * real 2x6" print at 300dpi, or smaller for a thumbnail — everything
 * is drawn proportionally so any size works).
 */
function drawStrip(canvas, frame, photoImgs) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const frameImg = getFrameImage(frame.id);

  ctx.clearRect(0, 0, w, h);

  // white backing so any anti-aliased/soft edges around each window
  // don't show canvas transparency through them
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  frame.windows.forEach((win, i) => {
    const img = photoImgs[i];
    if (!img) return;

    const x = win.xFrac * w;
    const y = win.yFrac * h;
    const cellW = win.wFrac * w;
    const cellH = win.hFrac * h;

    // cover-fit the photo into the window
    const imgRatio = img.width / img.height;
    const cellRatio = cellW / cellH;
    let sx, sy, sw, sh;
    if (imgRatio > cellRatio) {
      sh = img.height;
      sw = sh * cellRatio;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      sw = img.width;
      sh = sw / cellRatio;
      sx = 0;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, cellW, cellH);
  });

  // frame goes on top — its border/branding is opaque, its photo
  // windows are transparent, so the photos drawn above show through
  if (frameImg) {
    ctx.drawImage(frameImg, 0, 0, w, h);
  }
}
