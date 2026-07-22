/*
 * camera.js
 * ----------
 * Captures 4 photos, 10 seconds apart, from whatever video device
 * is selected in the dropdown.
 *
 * HOW THE NIKON D3500 GETS IN HERE:
 * The D3500 is on Nikon's supported list for "Nikon Webcam Utility"
 * (install it on the laptop, connect the camera by USB, set the
 * camera to Photo mode). Once running, the utility exposes a virtual
 * webcam device — usually named "Nikon Webcam Utility" — to the OS.
 * That means this page never talks to the camera directly; it just
 * uses the standard browser getUserMedia() API and lets the visitor
 * (or the kiosk operator) pick "Nikon Webcam Utility" from the
 * <select> below instead of the laptop's built-in camera.
 *
 * This is also why the whole thing works both at the physical stall
 * AND as a plain website: any laptop with a normal webcam works too,
 * just with laptop-camera quality instead of DSLR quality.
 */

const SHOTS_NEEDED = 4;
const INTERVAL_SECONDS = 10;

const params = new URLSearchParams(window.location.search);
const isRetake = params.get("retake") === "1";

const session = getSession();
if (isRetake && !session.round1Photos) {
  // shouldn't happen, but guard against a direct/refresh visit
  window.location.href = "index.html";
}
if (!isRetake && !session.set) {
  window.location.href = "choose-set.html";
}

const video = document.getElementById("preview");
const canvas = document.getElementById("captureCanvas");
const ctx = canvas.getContext("2d");
const countdownOverlay = document.getElementById("countdownOverlay");
const shotOverlay = document.getElementById("shotOverlay");
const shotCounter = document.getElementById("shotCounter");
const startBtn = document.getElementById("startBtn");
const cameraSelect = document.getElementById("cameraSelect");

let currentStream = null;
const shots = [];

async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter((d) => d.kind === "videoinput");
  cameraSelect.innerHTML = "";
  videoInputs.forEach((device, i) => {
    const opt = document.createElement("option");
    opt.value = device.deviceId;
    opt.textContent = device.label || `Camera ${i + 1}`;
    // auto-prefer a device whose label mentions Nikon
    if (/nikon/i.test(device.label)) opt.selected = true;
    cameraSelect.appendChild(opt);
  });
}

async function startStream(deviceId) {
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
  }
  currentStream = await navigator.mediaDevices.getUserMedia({
    video: deviceId ? { deviceId: { exact: deviceId } } : true,
    audio: false,
  });
  video.srcObject = currentStream;
}

async function init() {
  // ask permission first so device labels are populated, then list
  await startStream();
  await listCameras();
  cameraSelect.addEventListener("change", () => startStream(cameraSelect.value));
}

function takeShot() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  // mirror the capture to match the mirrored preview
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  shots.push(canvas.toDataURL("image/jpeg", 0.92));

  shotOverlay.classList.remove("flash");
  void shotOverlay.offsetWidth; // restart animation
  shotOverlay.classList.add("flash");
  shotCounter.textContent = `shot ${shots.length} / ${SHOTS_NEEDED}`;
}

function runCountdown(seconds) {
  return new Promise((resolve) => {
    let remaining = seconds;
    countdownOverlay.textContent = remaining;
    countdownOverlay.classList.add("show");
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timer);
        countdownOverlay.classList.remove("show");
        resolve();
      } else {
        countdownOverlay.textContent = remaining;
      }
    }, 1000);
  });
}

async function runSession() {
  startBtn.disabled = true;
  cameraSelect.disabled = true;

  for (let i = 0; i < SHOTS_NEEDED; i++) {
    await runCountdown(INTERVAL_SECONDS);
    takeShot();
    // brief pause so the flash overlay is visible before next countdown
    await new Promise((r) => setTimeout(r, 500));
  }

  if (isRetake) {
    const merged = saveSession({ round2Photos: shots, retakeUsed: true });
    goTo("select-pictures.html");
  } else {
    saveSession({ round1Photos: shots });
    goTo("choose-layout.html");
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
