/*
 * state.js
 * ---------
 * Tiny wrapper around sessionStorage so every page shares one
 * consistent "session" object instead of passing data through
 * query strings. sessionStorage clears itself automatically
 * when the browser tab/kiosk window is closed, and we clear it
 * ourselves on "restart" — so nothing leaks between visitors.
 *
 * Shape of the session object:
 * {
 *   set: 1 | 2,                 // which layout set they picked
 *   round1Photos: [dataURL x4], // first camera pass
 *   round2Photos: [dataURL x4], // only exists if they used the retake
 *   retakeUsed: boolean,
 *   finalPhotos: [dataURL x4],  // the 4 photos that go in the strip
 *   frameId: string,            // chosen frame style id
 *   resultImage: dataURL,       // final composited strip (set on result page)
 *   sessionId: string           // returned by backend after upload
 * }
 */

const SESSION_KEY = "snapandco_session";

function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : {};
}

function saveSession(patch) {
  const current = getSession();
  const merged = Object.assign(current, patch);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(merged));
  return merged;
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/* Guard helper: call at the top of a page that requires an
   earlier step to have been completed. Redirects home if the
   required key is missing (e.g. someone bookmarks camera.html
   directly, or refreshes and loses state). */
function requireSessionField(field, redirectTo = "index.html") {
  const session = getSession();
  if (!session[field]) {
    window.location.href = redirectTo;
  }
  return session;
}
