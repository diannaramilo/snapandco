/*
 * choose-layout.js
 * ------------------
 * If no retake happened, the 4 photos from round1 ARE the final
 * photos (no need to make them pick, since there's exactly 4).
 * If a retake happened, finalPhotos was already set by
 * select-pictures.js.
 */

const session = requireSessionField("set", "choose-set.html");
const finalPhotos = session.finalPhotos || session.round1Photos;
if (!session.finalPhotos) saveSession({ finalPhotos });

const backBtn = document.getElementById("backBtn");
if (session.retakeUsed) {
  backBtn.textContent = "← back";
  backBtn.addEventListener("click", () => goTo("select-pictures.html"));
} else {
  backBtn.textContent = "← retake";
  backBtn.addEventListener("click", () => goTo("camera.html?retake=1"));
}

const photosColumn = document.getElementById("photosColumn");
finalPhotos.forEach((src) => {
  const img = document.createElement("img");
  img.src = src;
  photosColumn.appendChild(img);
});

const frameRow = document.getElementById("frameRow");
let selectedFrameId = session.frameId || null;
const nextBtn = document.getElementById("nextBtn");

Promise.all([loadImages(finalPhotos), loadFrameCatalog()]).then(([photoImgs, frames]) => {
  frames.forEach((frame) => {
    const wrapper = document.createElement("div");
    wrapper.className = "frame-thumb";
    if (frame.id === selectedFrameId) wrapper.classList.add("selected");

    const canvas = document.createElement("canvas");
    canvas.width = 240; // draw at 2x display size for crispness
    canvas.height = 720;
    drawStrip(canvas, frame, photoImgs);

    wrapper.appendChild(canvas);
    wrapper.addEventListener("click", () => {
      document.querySelectorAll(".frame-thumb").forEach((el) => el.classList.remove("selected"));
      wrapper.classList.add("selected");
      selectedFrameId = frame.id;
      nextBtn.disabled = false;
    });

    frameRow.appendChild(wrapper);
  });
});

document.getElementById("scrollLeft").addEventListener("click", () => {
  frameRow.scrollBy({ left: -140, behavior: "smooth" });
});
document.getElementById("scrollRight").addEventListener("click", () => {
  frameRow.scrollBy({ left: 140, behavior: "smooth" });
});

nextBtn.addEventListener("click", () => {
  if (!selectedFrameId) return;
  saveSession({ frameId: selectedFrameId });
  goTo("result.html");
});
