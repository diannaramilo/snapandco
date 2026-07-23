/*
 * choose-layout.js
 * ------------------
 * Left side: one big "live preview" — the guest's actual 4 photos
 * layered under whichever frame is currently selected, so picking a
 * frame instantly shows what their strip will look like.
 * Right side: a paged carousel of plain frame thumbnails (just the
 * frame art, no photos baked in) — 4 per page, arrows or swipe to
 * see more.
 *
 * If no retake happened, the 4 photos from round1 ARE the final
 * photos (no need to make them pick, since there's exactly 4).
 * If a retake happened, finalPhotos was already set by
 * select-pictures.js.
 */

const PAGE_SIZE = 4;

const session = requireSessionField("set", "choose-set.html");
const finalPhotos = session.finalPhotos || session.round1Photos;
if (!session.finalPhotos) saveSession({ finalPhotos });

const backBtn = document.getElementById("backBtn");
const nextBtn = document.getElementById("nextBtn");
const framePage = document.getElementById("framePage");
const previewShotsEl = document.getElementById("preview-shots");
const previewFrameEl = document.getElementById("preview-frame-overlay");

let frames = [];
let currentPage = 0;
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

function renderFramePage() {
  framePage.innerHTML = "";
  const start = currentPage * PAGE_SIZE;
  const pageFrames = frames.slice(start, start + PAGE_SIZE);

  pageFrames.forEach((frame, i) => {
    const globalIndex = start + i;
    const card = document.createElement("div");
    card.className = "frame-card" + (globalIndex === selectedFrameIndex ? " selected" : "");
    card.dataset.index = globalIndex;

    const img = document.createElement("img");
    img.src = `assets/frames/${frame.file}`;
    card.appendChild(img);

    card.addEventListener("click", () => selectFrame(globalIndex));
    framePage.appendChild(card);

    requestAnimationFrame(() => {
      setTimeout(() => card.classList.add("entered"), i * 40);
    });
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

function changePage(delta) {
  const totalPages = Math.ceil(frames.length / PAGE_SIZE);
  currentPage = (currentPage + delta + totalPages) % totalPages;
  renderFramePage();
}

document.getElementById("prevFrame").addEventListener("click", () => changePage(-1));
document.getElementById("nextFrameBtn").addEventListener("click", () => changePage(1));

let touchStartX = null;
framePage.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
framePage.addEventListener("touchend", (e) => {
  if (touchStartX === null) return;
  const delta = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(delta) > 40) changePage(delta > 0 ? -1 : 1);
  touchStartX = null;
});

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
  frames = await loadFrameCatalog();

  if (session.frameId) {
    selectedFrameIndex = frames.findIndex((f) => f.id === session.frameId);
    currentPage = Math.floor(Math.max(0, selectedFrameIndex) / PAGE_SIZE);
  }

  setupBackButton();
  renderFramePage();
  updateLivePreview();
  nextBtn.classList.toggle("visible", selectedFrameIndex > -1);
}

init();
