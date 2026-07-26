/*
 * result.js
 * ----------
 * 1. Redraws the chosen frame + photos at full print resolution
 *    onto #finalCanvas.
 * 2. Uploads that image to the backend, which hands back a short
 *    download URL — that's what the QR codes point to.
 * 3. Wires up download / print / preview-layout / restart / extra-copies.
 *
 * BACKEND_URL defaults to "" (same origin) because app.py now serves
 * the frontend itself — so this page IS already being served by the
 * backend, and relative fetches like "/api/save" just work, on
 * localhost or on your LAN IP, with nothing to configure. Only set
 * window.SNAPANDCO_BACKEND_URL if the backend is running somewhere
 * else (e.g. you're still using a separate static file server for
 * the frontend during development).
 */

const BACKEND_URL = window.SNAPANDCO_BACKEND_URL || "";

const session = requireSessionField("frameId", "choose-set.html");
const finalCanvas = document.getElementById("finalCanvas");
const statusMsg = document.getElementById("statusMsg");
const previewBtn = document.getElementById("previewBtn");

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
      body: JSON.stringify({ image: dataUrl, photos: session.finalPhotos, set: session.set }),
    });
    if (!res.ok) throw new Error("upload failed");
    const data = await res.json();
    saveSession({ sessionId: data.id });
    return data.download_url;
  } catch (err) {
    console.warn("Backend not reachable, QR/print will be limited:", err);
    statusMsg.textContent =
      "Backend not reachable — download still works, but QR saving and print need the backend running (see console for details).";
    return null;
  }
}

function renderQr(containerEl, text) {
  if (!text || !window.QRCode) return;
  containerEl.innerHTML = ""; // qrcodejs appends into the container; clear any previous render
  new QRCode(containerEl, {
    text,
    width: 220,
    height: 220,
    correctLevel: QRCode.CorrectLevel.M,
  });
}

async function init() {
  const dataUrl = await buildFinalImage();
  saveSession({ resultImage: dataUrl });

  const uploadedUrl = await uploadToBackend(dataUrl);
  const qrTarget = uploadedUrl || `${window.location.origin}/photo/pending`;

  renderQr(document.getElementById("qrLeft"), qrTarget);
  renderQr(document.getElementById("qrRight"), qrTarget);
}

document.getElementById("downloadBtn").addEventListener("click", () => {
  const link = document.createElement("a");
  link.href = getSession().resultImage;
  link.download = "snap-and-co.png";
  link.click();
});

/* Sends the sheet to the printer AND (either way) hands back a URL
   to the exact PNG that was built, so you can always open it and
   visually confirm the layout — there's no print dialog to eyeball
   it in otherwise. The copies count that comes back in the response
   also confirms the +/- stepper is actually being read correctly. */
async function requestPrint({ previewOnly }) {
  const copies = 1 + extraCopies;
  statusMsg.textContent = previewOnly ? "Building preview…" : "Sending to printer…";
  try {
    const res = await fetch(`${BACKEND_URL}/api/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: getSession().sessionId,
        image: getSession().resultImage,
        set: session.set,
        copies,
        preview_only: previewOnly,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "print failed");

    if (data.sheet_url) window.open(data.sheet_url, "_blank");

    statusMsg.textContent = previewOnly
      ? `Preview opened in a new tab (set ${session.set} layout, ${copies} ${copies === 1 ? "copy" : "copies"} would be sent) ✓`
      : `Sent ${copies} ${copies === 1 ? "copy" : "copies"} to the printer ✓ — preview opened in a new tab so you can double check it.`;
  } catch (err) {
    console.error(err);
    if (previewOnly) {
      statusMsg.textContent = "Couldn't reach the backend to build a preview.";
    } else {
      statusMsg.textContent = "Couldn't reach the print server. Falling back to your browser's print dialog.";
      window.print();
    }
  }
}

document.getElementById("printBtn").addEventListener("click", () => requestPrint({ previewOnly: false }));
previewBtn.addEventListener("click", () => requestPrint({ previewOnly: true }));

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