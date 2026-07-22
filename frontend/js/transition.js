/*
 * transition.js
 * --------------
 * Gives every page a soft fade+slide-in on load, and a matching
 * fade-out before navigating away, so moving between steps (and
 * especially clicking through frame choices) feels smooth instead
 * of a hard jump-cut.
 *
 * Usage:
 *   <body class="page-fade">
 *   goTo("choose-set.html");   // instead of location.href = ...
 */

document.addEventListener("DOMContentLoaded", () => {
  requestAnimationFrame(() => {
    document.body.classList.add("in");
  });
});

function goTo(url) {
  document.body.classList.add("page-fade-out");
  setTimeout(() => {
    window.location.href = url;
  }, 220);
}
