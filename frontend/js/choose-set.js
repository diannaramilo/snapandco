/*
 * choose-set.js
 * --------------
 * Set 1 = two identical 2x6 strips (4 photos)
 * Set 2 = one 2x6 strip + four 1x3 strips (same 4 photos, different layout)
 * The chosen set number is what backend/print_layout.py uses later
 * to decide how the final 4x6 print sheet gets arranged.
 */

const cards = document.querySelectorAll(".set-card");
const nextBtn = document.getElementById("nextBtn");
let chosenSet = null;

cards.forEach((card) => {
  card.addEventListener("click", () => {
    cards.forEach((c) => c.classList.remove("selected"));
    card.classList.add("selected");
    chosenSet = Number(card.dataset.set);
    nextBtn.classList.add("visible");
  });
});

nextBtn.addEventListener("click", () => {
  if (!chosenSet || nextBtn.classList.contains("loading")) return;
  nextBtn.classList.add("loading");
  saveSession({ set: chosenSet });
  window.location.href = "camera.html";
});

document.getElementById("backBtn").addEventListener("click", () => {
  window.location.href = "index.html";
});
