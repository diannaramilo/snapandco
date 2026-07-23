/*
 * result.js
 * ----------
 * 1. Redraws the chosen frame + photos at full print resolution
 *    onto #finalCanvas (styled to the same 208x623 box as the old
 *    preview page, but the actual bitmap is 600x1800 = 2x6" @300dpi).
 * 2. Uploads that image to the Flask backend, which hands back a
 *    short download URL — that's what the QR codes point to.
 * 3. Wires up download / print / restart / extra-copies.
 *
 * BACKEND_URL: change this to wherever backend/app.py is actually
 * running (see README). If the backend isn't reachable, download
 * still works locally — only the QR / server-side print need it.
 */

const BACKEND_URL = window.SNAPANDCO_BACKEND_URL || "http://localhost:5000";

const session = requireSessionField("frameId", "choose-set.html");
const finalCanvas = document.getElementById("finalCanvas");
const statusMsg = document.getElementById("statusMsg");

let extraCopies = 0;

async function buildFinalImage() {
  const [photoImgs] = await Promise.all([
    loadImages(session.finalPhotos),
    loadFrameCatalog(),
  ]);
  const frame = getFrameById(session.frameId);
  finalCanvas.width = 600;
  finalCanvas.height = 1800;
  drawStrip(finalCanvas, frame, photoImgs);
  return finalCanvas.toDataURL("image/png");
}

async function uploadToBackend(dataUrl) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl, set: session.set }),
    });
    if (!res.ok) throw new Error("upload failed");
    const data = await res.json();
    saveSession({ sessionId: data.id });
    return data.download_url;
  } catch (err) {
    console.warn("Backend not reachable, QR/print will be limited:", err);
    statusMsg.textContent =
      "Backend server not reachable — download still works, but QR saving and auto-print need backend/app.py running.";
    return null;
  }
}

async function renderQr(canvasEl, text) {
  if (!text || !window.QRCode) return;
  await QRCode.toCanvas(canvasEl, text, { width: 320, margin: 1 });
}

async function init() {
  const dataUrl = await buildFinalImage();
  saveSession({ resultImage: dataUrl });

  const uploadedUrl = await uploadToBackend(dataUrl);
  const qrTarget = uploadedUrl || `${BACKEND_URL}/photo/pending`;

  renderQr(document.getElementById("qrLeft"), qrTarget);
  renderQr(document.getElementById("qrRight"), qrTarget);
}

document.getElementById("downloadBtn").addEventListener("click", () => {
  const link = document.createElement("a");
  link.href = getSession().resultImage;
  link.download = "snap-and-co.png";
  link.click();
});

document.getElementById("printBtn").addEventListener("click", async () => {
  statusMsg.textContent = "Sending to printer…";
  try {
    const res = await fetch(`${BACKEND_URL}/api/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: getSession().sessionId,
        image: getSession().resultImage,
        set: session.set,
        copies: 1 + extraCopies,
      }),
    });
    if (!res.ok) throw new Error("print failed");
    statusMsg.textContent = "Sent to printer ✓";
  } catch (err) {
    console.error(err);
    statusMsg.textContent = "Couldn't reach the print server. Falling back to your browser's print dialog.";
    window.print();
  }
});

document.getElementById("restartBtn").addEventListener("click", async () => {
  const confirmed = await confirmModal({
    title: "Start a new session?",
    message: "This session's photos will no longer be accessible after you restart.",
    confirmText: "Restart",
    cancelText: "Cancel",
  });
  if (confirmed) {
    clearSession();
    window.location.href = "index.html";
  }
});

document.getElementById("copyMinus").addEventListener("click", () => {
  extraCopies = Math.max(0, extraCopies - 1);
  document.getElementById("copyCount").textContent = extraCopies;
});
document.getElementById("copyPlus").addEventListener("click", () => {
  extraCopies = Math.min(9, extraCopies + 1);
  document.getElementById("copyCount").textContent = extraCopies;
});

init();
