/**
 * Reusable confirm modal.
 * Usage: confirmModal({ title, message, confirmText, cancelText }).then(confirmed => { ... });
 */
function confirmModal({ title = "Are you sure?", message = "", confirmText = "Yes", cancelText = "Cancel" } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="modal-actions">
          <button class="modal-btn cancel-btn">${cancelText}</button>
          <button class="modal-btn primary confirm-btn">${confirmText}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    function close(result) {
      overlay.classList.remove("open");
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    }

    overlay.querySelector(".cancel-btn").addEventListener("click", () => close(false));
    overlay.querySelector(".confirm-btn").addEventListener("click", () => close(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });

    requestAnimationFrame(() => overlay.classList.add("open"));
  });
}
