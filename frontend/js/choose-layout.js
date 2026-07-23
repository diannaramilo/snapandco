/*
 * choose-layout.js
 * ------------------
 * Left side: one big "live preview" — the guest's actual 4 photos
 * layered under whichever frame is currently selected, so picking a
 * frame instantly shows what their strip will look like.
 * Right side: all frames laid out in one slideable strip (drag with
 * a mouse, swipe with a finger, or use the arrow buttons) — plain
 * frame art only, no photos baked into the thumbnails.
 *
 * If no retake happened, the 4 photos from round1 ARE the final
 * photos (no need to make them pick, since there's exactly 4).
 * If a retake happened, finalPhotos was already set by
 * select-pictures.js.
 */

const session = requireSessionField("set", "choose-set.html");
const finalPhotos = session.finalPhotos || session.round1Photos;
if (!session.finalPhotos) saveSession({ finalPhotos });

const backBtn = document.getElementById("backBtn");
const nextBtn = document.getElementById("nextBtn");
const framePage = document.getElementById("framePage");
const previewShotsEl = document.getElementById("preview-shots");
const previewFrameEl = document.getElementById("preview-frame-overlay");

let frames = [];
let selectedFrameIndex = -1;

function setupBackButton() {
  if (session.retakeUsed) {
    backBtn.textContent = "←back";
    backBtn.onclick = () => { window.location.href = "select-pictures.html"; };
  } else {
    backBtn.textContent = "←retake";
    backBtn.onclick = handleRetake;
  }
}

async function handleRetake() {
  if (backBtn.classList.contains("loading")) return;
  const confirmed = await confirmModal({
    title: "Use your one retake?",
    message: "You only get one retake per session. After this, your frame choice is final.",
    confirmText: "Retake",
    cancelText: "Cancel",
  });
  if (!confirmed) return;
  backBtn.classList.add("loading");
  window.location.href = "camera.html?retake=1";
}

function renderFrameStrip() {
  framePage.innerHTML = "";
  frames.forEach((frame, index) => {
    const card = document.createElement("div");
    card.className = "frame-card" + (index === selectedFrameIndex ? " selected" : "");
    card.dataset.index = index;

    const img = document.createElement("img");
    img.src = `assets/frames/${frame.file}`;
    img.draggable = false;
    card.appendChild(img);

    framePage.appendChild(card);

    setTimeout(() => card.classList.add("entered"), index * 35);
  });
}

function selectFrame(index) {
  selectedFrameIndex = index;
  [...framePage.children].forEach((card) => {
    card.classList.toggle("selected", Number(card.dataset.index) === index);
  });
  updateLivePreview();
  nextBtn.classList.add("visible");
}

function scrollToCard(index) {
  const card = framePage.children[index];
  if (card) card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
}

/* --- arrow buttons: step one card at a time --- */
function cardStep() {
  const first = framePage.querySelector(".frame-card");
  if (!first) return 0;
  const style = getComputedStyle(framePage);
  return first.getBoundingClientRect().width + parseFloat(style.gap || 20);
}

document.getElementById("prevFrame").addEventListener("click", () => {
  framePage.scrollBy({ left: -cardStep(), behavior: "smooth" });
});
document.getElementById("nextFrameBtn").addEventListener("click", () => {
  framePage.scrollBy({ left: cardStep(), behavior: "smooth" });
});

/* --- slideable strip: drag with mouse OR touch via pointer events ---
   One pointer flow handles both dragging AND tapping to select, so
   there's no race between a separate "click" listener and the drag
   logic: on release, if the pointer barely moved it's a tap (select
   whichever card is under it), otherwise it was a drag (just leave
   the scroll position where it landed). */
const DRAG_THRESHOLD = 6;
let isDown = false;
let startX = 0;
let startScroll = 0;
let moved = 0;
let downCard = null;

framePage.addEventListener("pointerdown", (e) => {
  isDown = true;
  moved = 0;
  framePage.classList.add("dragging");
  startX = e.clientX;
  startScroll = framePage.scrollLeft;
  downCard = e.target.closest(".frame-card");
  framePage.setPointerCapture(e.pointerId);
});

framePage.addEventListener("pointermove", (e) => {
  if (!isDown) return;
  const delta = e.clientX - startX;
  moved = Math.max(moved, Math.abs(delta));
  framePage.scrollLeft = startScroll - delta;
});

function endDrag() {
  if (!isDown) return;
  isDown = false;
  framePage.classList.remove("dragging");
  if (moved < DRAG_THRESHOLD && downCard) {
    selectFrame(Number(downCard.dataset.index));
  }
  downCard = null;
}
framePage.addEventListener("pointerup", endDrag);
framePage.addEventListener("pointercancel", endDrag);
framePage.addEventListener("pointerleave", () => { if (isDown) endDrag(); });

function updateLivePreview() {
  const frame = selectedFrameIndex > -1 ? frames[selectedFrameIndex] : frames[0];

  previewShotsEl.innerHTML = "";
  frame.windows.forEach((win, i) => {
    const img = document.createElement("img");
    img.className = "preview-shot";
    img.style.top = `${win.yFrac * 100}%`;
    img.style.left = `${win.xFrac * 100}%`;
    img.style.width = `${win.wFrac * 100}%`;
    img.style.height = `${win.hFrac * 100}%`;
    if (finalPhotos[i]) {
      img.src = finalPhotos[i];
      img.onload = () => img.classList.add("loaded");
    }
    previewShotsEl.appendChild(img);
  });

  previewFrameEl.classList.remove("loaded");
  previewFrameEl.onload = () => previewFrameEl.classList.add("loaded");
  previewFrameEl.src = `assets/frames/${frame.file}`;
}

nextBtn.addEventListener("click", () => {
  if (selectedFrameIndex === -1 || nextBtn.classList.contains("loading")) return;
  nextBtn.classList.add("loading");
  saveSession({ frameId: frames[selectedFrameIndex].id });
  window.location.href = "result.html";
});

async function init() {
  try {
    frames = await loadFrameCatalog();
  } catch (err) {
    console.error("Couldn't load frame catalog:", err);
    framePage.innerHTML =
      '<p style="padding:20px;font-size:14px;color:#a05a6e;max-width:340px;">' +
      "Couldn't load the frames. This page needs to be served over http (e.g. " +
      "<code>python -m http.server</code> from the frontend folder) — opening " +
      "the file directly in the browser (file://) blocks it from loading " +
      "assets/frames/frames.json.</p>";
    return;
  }

  if (session.frameId) {
    selectedFrameIndex = frames.findIndex((f) => f.id === session.frameId);
  }

  setupBackButton();
  renderFrameStrip();
  updateLivePreview();
  nextBtn.classList.toggle("visible", selectedFrameIndex > -1);
  if (selectedFrameIndex > -1) {
    setTimeout(() => scrollToCard(selectedFrameIndex), 50);
  }
}

init();