/*
 * camera.js
 * ----------
 * Captures 4 photos, 10 seconds apart, from whatever video device
 * is selected in the dropdown (top-right).
 *
 * HOW THE NIKON D3500 GETS IN HERE:
 * The D3500 is on Nikon's supported list for "Nikon Webcam Utility"
 * (install it on the laptop, connect the camera by USB, set the
 * camera to Photo mode). Once running, the utility exposes a virtual
 * webcam device — usually named "Nikon Webcam Utility" — to the OS.
 * This page just uses the standard browser getUserMedia() API and
 * lets the visitor (or kiosk operator) pick it from the dropdown
 * instead of the laptop's built-in webcam. Any laptop with a normal
 * webcam works too — just with laptop-camera quality instead of
 * DSLR quality — which is what makes this work as a plain website.
 */

const SHOTS_NEEDED = 4;
const INTERVAL_SECONDS = 10;
const FREEZE_DURATION_MS = 900;

const params = new URLSearchParams(window.location.search);
const isRetake = params.get("retake") === "1";

const session = getSession();
if (isRetake && !session.round1Photos) {
  window.location.href = "index.html";
}
if (!isRetake && !session.set) {
  window.location.href = "choose-set.html";
}

const video = document.getElementById("live-video");
const freezeFrame = document.getElementById("freeze-frame");
const countdownEl = document.getElementById("countdown");
const shotsCounter = document.getElementById("shots-counter");
const subtitle = document.getElementById("subtitle");
const startBtn = document.getElementById("startBtn");
const cameraSelect = document.getElementById("cameraSelect");

let currentStream = null;
let shotNumber = 1;
const shots = [];

if (isRetake) {
  subtitle.textContent = "Last chance — no more redos after this";
}

async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter((d) => d.kind === "videoinput");
  cameraSelect.innerHTML = "";
  videoInputs.forEach((device, i) => {
    const opt = document.createElement("option");
    opt.value = device.deviceId;
    opt.textContent = device.label || `Camera ${i + 1}`;
    if (/nikon/i.test(device.label)) opt.selected = true;
    cameraSelect.appendChild(opt);
  });
}

async function startStream(deviceId) {
  if (currentStream) currentStream.getTracks().forEach((t) => t.stop());
  currentStream = await navigator.mediaDevices.getUserMedia({
    video: deviceId ? { deviceId: { exact: deviceId } } : true,
    audio: false,
  });
  video.srcObject = currentStream;
}

async function init() {
  await startStream();
  await listCameras();
  cameraSelect.addEventListener("change", () => startStream(cameraSelect.value));
}

function takeShot() {
  countdownEl.classList.remove("show");

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d");
  // mirror the capture to match the mirrored preview
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  shots.push(dataUrl);

  // freeze the screen on the captured shot for a beat, like a real camera
  freezeFrame.src = dataUrl;
  freezeFrame.classList.add("showing");

  return new Promise((resolve) => {
    setTimeout(() => {
      freezeFrame.classList.remove("showing");
      resolve();
    }, FREEZE_DURATION_MS);
  });
}

function runCountdown(seconds) {
  return new Promise((resolve) => {
    let remaining = seconds;
    countdownEl.textContent = remaining;
    countdownEl.classList.add("show");
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timer);
        resolve();
      } else {
        countdownEl.textContent = remaining;
      }
    }, 1000);
  });
}

function updateShotsCounter() {
  shotsCounter.textContent = `Shot ${shotNumber} of ${SHOTS_NEEDED}`;
}

async function runSession() {
  startBtn.classList.add("hidden");
  cameraSelect.disabled = true;
  updateShotsCounter();

  for (shotNumber = 1; shotNumber <= SHOTS_NEEDED; shotNumber++) {
    updateShotsCounter();
    await runCountdown(INTERVAL_SECONDS);
    await takeShot();
  }

  if (isRetake) {
    saveSession({ round2Photos: shots, retakeUsed: true });
    window.location.href = "select-pictures.html";
  } else {
    saveSession({ round1Photos: shots });
    window.location.href = "choose-layout.html";
  }
}

startBtn.addEventListener("click", runSession);
init().catch((err) => {
  console.error("Camera error:", err);
  alert(
    "Couldn't access a camera. If you're using the Nikon D3500, make sure " +
    "Nikon Webcam Utility is running and the camera is set to Photo mode, " +
    "then reload this page and pick it from the dropdown."
  );
});
