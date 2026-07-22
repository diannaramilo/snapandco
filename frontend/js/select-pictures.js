/*
 * select-pictures.js
 * --------------------
 * Only reached when a retake happened: pool = round1Photos (4)
 * + round2Photos (4) = 8 candidates. Visitor taps up to 4 to
 * fill the slots on the left, in the order tapped.
 */

const session = requireSessionField("round2Photos", "index.html");
const pool = [...(session.round1Photos || []), ...(session.round2Photos || [])];

const poolEl = document.getElementById("pool");
const slotsEl = document.getElementById("slots");
const nextBtn = document.getElementById("nextBtn");

let picked = []; // dataURLs in chosen order

pool.forEach((dataUrl, i) => {
  const item = document.createElement("div");
  item.className = "pool-item";
  item.style.backgroundImage = `url(${dataUrl})`;
  item.dataset.index = i;
  item.addEventListener("click", () => togglePick(dataUrl, item));
  poolEl.appendChild(item);
});

function togglePick(dataUrl, el) {
  const existingIndex = picked.indexOf(dataUrl);
  if (existingIndex !== -1) {
    picked.splice(existingIndex, 1);
    el.classList.remove("picked");
  } else {
    if (picked.length >= 4) return;
    picked.push(dataUrl);
    el.classList.add("picked");
  }
  renderSlots();
}

function renderSlots() {
  const slots = slotsEl.querySelectorAll(".slot");
  slots.forEach((slot, i) => {
    slot.style.backgroundImage = picked[i] ? `url(${picked[i]})` : "";
  });
  nextBtn.disabled = picked.length !== 4;

  // once all 4 pool items are used up as much as possible, dim the rest
  const poolItems = poolEl.querySelectorAll(".pool-item");
  poolItems.forEach((item) => {
    const url = pool[Number(item.dataset.index)];
    const isPicked = picked.includes(url);
    item.classList.toggle("disabled", picked.length >= 4 && !isPicked);
  });
}

nextBtn.addEventListener("click", () => {
  saveSession({ finalPhotos: picked });
  goTo("choose-layout.html");
});
