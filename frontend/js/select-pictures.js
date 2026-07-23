/*
 * select-pictures.js
 * --------------------
 * Only reached when a retake happened: pool = round1Photos (4)
 * + round2Photos (4) = 8 candidates. Visitor taps up to 4, in
 * order, to fill the numbered slots on the left.
 */

const session = requireSessionField("round2Photos", "index.html");
const pool = [...(session.round1Photos || []), ...(session.round2Photos || [])].map(
  (url, i) => ({ key: `p${i}`, url })
);

const photoGrid = document.getElementById("photoGrid");
const slots = [...document.querySelectorAll(".slot")];
const nextBtn = document.getElementById("nextBtn");

let selectedKeys = [];

function renderGrid() {
  photoGrid.innerHTML = "";
  pool.forEach((photo) => {
    const thumb = document.createElement("div");
    thumb.className = "photo-thumb";
    thumb.dataset.key = photo.key;

    const img = document.createElement("img");
    img.src = photo.url;
    thumb.appendChild(img);

    thumb.addEventListener("click", () => togglePhoto(photo.key, thumb));
    photoGrid.appendChild(thumb);
  });
}

function togglePhoto(key, el) {
  const idx = selectedKeys.indexOf(key);
  if (idx > -1) {
    selectedKeys.splice(idx, 1);
    el.classList.remove("selected");
    const badge = el.querySelector(".badge");
    if (badge) badge.remove();
  } else {
    if (selectedKeys.length >= 4) return;
    selectedKeys.push(key);
    el.classList.add("selected");
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = String(selectedKeys.length);
    el.appendChild(badge);
  }
  renumberBadges();
  updateSlots();
  nextBtn.classList.toggle("visible", selectedKeys.length === 4);
}

function renumberBadges() {
  selectedKeys.forEach((key, i) => {
    const badge = photoGrid.querySelector(`.photo-thumb[data-key="${key}"] .badge`);
    if (badge) badge.textContent = String(i + 1);
  });
}

function updateSlots() {
  slots.forEach((slot, i) => {
    slot.innerHTML = `<span class="slot-num">${i + 1}</span>`;
    slot.classList.remove("filled");
    const key = selectedKeys[i];
    if (key) {
      const photo = pool.find((p) => p.key === key);
      if (photo) {
        slot.classList.add("filled");
        const img = document.createElement("img");
        img.src = photo.url;
        img.onload = () => img.classList.add("loaded");
        slot.appendChild(img);
        slot.querySelector(".slot-num").textContent = String(i + 1);
      }
    }
  });
}

nextBtn.addEventListener("click", () => {
  if (selectedKeys.length !== 4 || nextBtn.classList.contains("loading")) return;
  nextBtn.classList.add("loading");
  const finalPhotos = selectedKeys.map((key) => pool.find((p) => p.key === key).url);
  saveSession({ finalPhotos });
  window.location.href = "choose-layout.html";
});

renderGrid();
