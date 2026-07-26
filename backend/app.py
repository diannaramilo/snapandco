"""
app.py
-------
The whole snap & co. server: serves the frontend AND the backend
from one process, so there's only one thing to run.

    cd backend
    venv\\Scripts\\activate      (or source venv/bin/activate on Mac/Linux)
    pip install -r requirements.txt
    python app.py

That's it — open the URL it prints (e.g. http://192.168.1.9:5000) on
the laptop, and guests' phones can reach that same address for the
QR code, since it's now serving everything.

Routes:
  GET  /, /<page>.html, /css/*, /js/*, /assets/*
                        -> the frontend itself (frontend/ folder)
  POST /api/save        -> store the composited strip image, hand
                            back a QR-friendly download URL
  GET  /photo/<id>       -> mobile-friendly download page
  POST /api/print        -> build the 4x6" print sheet and send it
                            to the printer (or just preview it —
                            see preview_only below)
  GET  /prints/<file>     -> view a generated print sheet (used by
                            the print-preview button, and returned
                            in every /api/print response so you can
                            always see exactly what got sent)
"""

import base64
import io
import os
import platform
import subprocess
import uuid

from flask import Flask, jsonify, request, send_file, send_from_directory, render_template_string
from flask_cors import CORS
from PIL import Image

from print_layout import build_sheet

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")
UPLOADS_DIR = os.path.join(BASE_DIR, "static", "uploads")
PRINTS_DIR = os.path.join(BASE_DIR, "static", "prints")
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(PRINTS_DIR, exist_ok=True)

app = Flask(__name__)
CORS(app)  # harmless to leave on even though everything's same-origin now

# Only set this if you want the QR code to point at a fixed public
# domain (e.g. after deploying, or an ngrok tunnel — see README).
# Leave unset and it auto-detects from whatever address was used to
# reach the server, which is correct for the normal "laptop on event
# wifi, guests scan on their phones" setup.
SERVER_PUBLIC_URL = os.environ.get("SNAPANDCO_PUBLIC_URL") or None

# Name of the printer to use for automatic printing. Leave unset to
# use the OS default printer. On Linux/Mac this should match the
# CUPS printer name (`lpstat -p` lists them).
PRINTER_NAME = os.environ.get("SNAPANDCO_PRINTER_NAME") or None


def _decode_data_url(data_url: str) -> Image.Image:
    header, encoded = data_url.split(",", 1)
    raw = base64.b64decode(encoded)
    return Image.open(io.BytesIO(raw))


import socket

_cached_lan_ip = None


def _detect_lan_ip() -> str:
    """
    Finds the machine's real LAN IP (e.g. 192.168.1.9) regardless of
    what address the laptop's own browser happens to be using.

    This matters because request.host_url reflects whatever address
    the REQUEST came in on — if you open the site on the laptop via
    http://localhost:5000, every QR code would encode "localhost",
    which means nothing to a guest's phone ("Safari can't open the
    page" is exactly that failure). Detecting the LAN IP directly
    sidesteps that regardless of how the laptop itself is browsing.

    The trick: opening a UDP "connection" to a public IP doesn't
    actually send any packets, it just asks the OS to pick which
    local network interface *would* be used for that route — which
    is reliably the real LAN interface, even offline, as long as the
    router/gateway is up (true for basically any event wifi).
    """
    global _cached_lan_ip
    if _cached_lan_ip:
        return _cached_lan_ip
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        _cached_lan_ip = s.getsockname()[0]
    except OSError:
        _cached_lan_ip = "127.0.0.1"  # last resort — only reachable from this same machine
    finally:
        s.close()
    return _cached_lan_ip


def _public_url(path: str) -> str:
    if SERVER_PUBLIC_URL:
        base = SERVER_PUBLIC_URL.rstrip("/")
    else:
        port = request.host.split(":")[1] if ":" in request.host else "5000"
        base = f"http://{_detect_lan_ip()}:{port}"
    return f"{base}{path}"


# ---------------------------------------------------------------- #
# frontend — serve the plain HTML/CSS/JS site straight out of ../frontend
# ---------------------------------------------------------------- #

@app.route("/")
def serve_landing():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:filename>")
def serve_frontend_file(filename):
    """
    Catches every page/css/js/asset request (index.html,
    choose-set.html, css/style.css, assets/frames/a1.png, ...).
    Flask/Werkzeug matches more specific routes (/api/save,
    /photo/<id>, /uploads/<file>, /prints/<file>) before falling
    back to this one, so there's no conflict with those.
    """
    return send_from_directory(FRONTEND_DIR, filename)


# ---------------------------------------------------------------- #
# save + QR download
# ---------------------------------------------------------------- #

import time

CLEANUP_AGE_SECONDS = 24 * 60 * 60  # 24 hours


def _cleanup_old_files():
    """Deletes saved photos/sheets older than 24 hours. Called on
    every /api/save so there's no cron job or background thread to
    set up — it just quietly sweeps as people use the booth. Matches
    the "photos deleted automatically in 24 hours" note on the
    download page."""
    cutoff = time.time() - CLEANUP_AGE_SECONDS
    for folder in (UPLOADS_DIR, PRINTS_DIR):
        for name in os.listdir(folder):
            path = os.path.join(folder, name)
            try:
                if os.path.isfile(path) and os.path.getmtime(path) < cutoff:
                    os.remove(path)
            except OSError:
                pass  # file removed by another request already — fine


@app.route("/api/save", methods=["POST"])
def save_photo():
    _cleanup_old_files()

    body = request.get_json(force=True)
    image = body.get("image")
    photos = body.get("photos") or []  # the 4 individual (unframed) shots
    if not image:
        return jsonify({"error": "missing image"}), 400

    photo_id = uuid.uuid4().hex[:10]

    # JPEG, not PNG: these are guest-facing copies that just need to
    # look good on a phone screen and load fast over event wifi — a
    # lossless PNG re-encode of actual photo content runs several
    # times larger for no visible benefit here. This has zero effect
    # on print quality: /api/print always receives a fresh image
    # straight from the browser's own canvas at print time, never
    # these saved files.
    strip_img = _decode_data_url(image).convert("RGB")
    strip_img.save(os.path.join(UPLOADS_DIR, f"{photo_id}.jpg"), "JPEG", quality=90)

    for i, photo_data_url in enumerate(photos[:4], start=1):
        try:
            img = _decode_data_url(photo_data_url).convert("RGB")
            img.save(os.path.join(UPLOADS_DIR, f"{photo_id}_{i}.jpg"), "JPEG", quality=90)
        except Exception:  # noqa: BLE001 — an individual shot failing to save shouldn't break the whole request
            pass

    return jsonify({
        "id": photo_id,
        "download_url": _public_url(f"/photo/{photo_id}"),
    })


DOWNLOAD_PAGE = """
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>snap & co. — your photos</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "Poppins", sans-serif;
      text-align: center;
      padding: 36px 20px 28px;
      background: #fff7ec;
      color: #442f2a;
      margin: 0;
      min-height: 100vh;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #f5cbd7;
      color: #d6316b;
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 0.03em;
      padding: 6px 14px;
      border-radius: 999px;
      margin-bottom: 14px;
    }
    .badge .logo { font-weight: 800; color: #442f2a; }
    h2 { font-size: 22px; margin: 0 0 8px; }
    p.tagline { opacity: 0.75; font-size: 13px; margin: 0 auto 24px; max-width: 300px; line-height: 1.5; }
    .celebrate-gif {
      width: 90px;
      height: 90px;
      margin: 0 auto 8px;
      display: block;
      /* drop your own celebratory GIF at backend/static/celebrate.gif
         (confetti, sparkles, etc.) and it'll show up here automatically */
    }
    .layout {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      gap: 18px;
      max-width: 340px;
      margin: 0 auto;
    }
    .singles {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
    }
    .singles img {
      width: 100%;
      aspect-ratio: 4 / 3;
      object-fit: cover;
      border-radius: 8px;
      background: #eee;
    }
    .strip-col img.strip {
      width: 130px;
      border-radius: 6px;
      box-shadow: 0 10px 26px rgba(68, 47, 42, 0.2);
    }
    .save-all-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      max-width: 340px;
      margin: 26px auto 10px;
      padding: 15px;
      background: #ff69b4;
      border: none;
      border-radius: 999px;
      color: white;
      font-family: "Poppins", sans-serif;
      font-weight: 700;
      font-size: 15px;
      cursor: pointer;
      transition: transform 0.15s ease;
    }
    .save-all-btn:active { transform: scale(0.97); }
    .delete-note { font-size: 11px; color: #8a6f68; display: flex; align-items: center; justify-content: center; gap: 5px; }
    .fallback-hint { font-size: 12px; color: #8a6f68; margin-top: 14px; max-width: 280px; margin-left: auto; margin-right: auto; line-height: 1.5; }
  </style>
</head>
<body>
  {% if has_gif %}<img class="celebrate-gif" src="/static/celebrate.gif" alt="">{% endif %}
  <div class="badge"><span class="logo">sn ap</span> SNAP &amp; CO</div>
  <h2>✨ Your Photos Are Ready! ✨</h2>
  <p class="tagline">Scan successful! Download your high-res prints and sharing strips below.</p>

  <div class="layout">
    <div class="singles">
      {% for n in photo_numbers %}
      <img src="/uploads/{{ photo_id }}_{{ n }}.jpg" alt="Photo {{ n }}">
      {% endfor %}
    </div>
    <div class="strip-col">
      <img class="strip" src="/uploads/{{ photo_id }}.jpg" alt="your strip">
    </div>
  </div>

  <button class="save-all-btn" id="saveAllBtn">⬇ Save All Photos</button>
  <div class="delete-note">🔒 Photos deleted automatically in 24 hours</div>
  <div class="fallback-hint" id="fallbackHint" style="display:none;">
    Tip: press and hold any photo above, then choose "Save Image" — works on any phone.
  </div>

  <script>
    /*
     * iOS Safari intentionally does NOT support the HTML `download`
     * attribute for images — clicking a download link there just
     * NAVIGATES to that image's URL instead. Doing that in a loop
     * for 5 images just means the last one (the strip) is the only
     * one anyone ever sees, because each navigation replaces the
     * last before the previous "download" ever had a chance.
     *
     * The fix: use the native Share Sheet (Web Share API with
     * files), which is the same "Save Image"/"Save to Photos" flow
     * people already know from every other app — and it actually
     * saves every file, not just the last one. Falls back to the
     * old sequential-download approach for browsers that don't
     * support sharing files (mostly desktop), where the download
     * attribute works fine anyway.
     */
    document.getElementById('saveAllBtn').addEventListener('click', async () => {
      const urls = [...document.querySelectorAll('img')]
        .map(img => img.getAttribute('src'))
        .filter(src => src && src.startsWith('/uploads/'));

      if (navigator.canShare) {
        try {
          const files = await Promise.all(urls.map(async (src) => {
            const res = await fetch(src);
            const blob = await res.blob();
            return new File([blob], src.split('/').pop(), { type: blob.type || 'image/jpeg' });
          }));
          if (navigator.canShare({ files })) {
            await navigator.share({ files, title: 'snap & co.' });
            return;
          }
        } catch (err) {
          // user cancelled the share sheet, or sharing failed for
          // some other reason — fall through to direct downloads
          if (err && err.name === 'AbortError') return; // they cancelled on purpose, don't also spam downloads
        }
      }

      // fallback: browsers that support the download attribute
      // properly (desktop Chrome/Firefox/Edge, Android Chrome)
      urls.forEach((src, i) => {
        setTimeout(() => {
          const a = document.createElement('a');
          a.href = src;
          a.download = src.split('/').pop();
          document.body.appendChild(a);
          a.click();
          a.remove();
        }, i * 350);
      });
      document.getElementById('fallbackHint').style.display = 'block';
    });
  </script>
</body>
</html>
"""


@app.route("/photo/<photo_id>")
def photo_page(photo_id):
    path = os.path.join(UPLOADS_DIR, f"{photo_id}.jpg")
    if not os.path.exists(path):
        return "Photo not found (or not saved yet — try again in a moment, or it may have passed the 24-hour auto-delete window).", 404

    has_gif = os.path.exists(os.path.join(BASE_DIR, "static", "celebrate.gif"))
    photo_numbers = [
        n for n in range(1, 5)
        if os.path.exists(os.path.join(UPLOADS_DIR, f"{photo_id}_{n}.jpg"))
    ]
    return render_template_string(
        DOWNLOAD_PAGE, photo_id=photo_id, has_gif=has_gif, photo_numbers=photo_numbers
    )


@app.route("/uploads/<filename>")
def serve_upload(filename):
    return send_file(os.path.join(UPLOADS_DIR, filename))


@app.route("/prints/<filename>")
def serve_print_sheet(filename):
    """Lets you open a generated print sheet in a browser tab to
    check the layout — this is what the "preview layout" button on
    the result page opens, and it's also returned by /api/print
    every time, print-only or not."""
    return send_file(os.path.join(PRINTS_DIR, filename))


# ---------------------------------------------------------------- #
# printing
# ---------------------------------------------------------------- #

def _print_file(path: str, copies: int = 1):
    system = platform.system()
    if system in ("Linux", "Darwin"):
        cmd = ["lp", "-n", str(copies)]
        if PRINTER_NAME:
            cmd += ["-d", PRINTER_NAME]
        cmd.append(path)
        subprocess.run(cmd, check=True)
    elif system == "Windows":
        _print_windows(path, copies)
    else:
        raise RuntimeError(f"Unsupported OS for printing: {system}")


def _get_windows_default_printer() -> str:
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         "(Get-CimInstance -ClassName Win32_Printer | Where-Object {$_.Default -eq $true}).Name"],
        capture_output=True, text=True, check=True,
    )
    name = result.stdout.strip()
    if not name:
        raise RuntimeError(
            "Couldn't find a default Windows printer. Set one as default in "
            "Windows Settings > Printers, or set SNAPANDCO_PRINTER_NAME."
        )
    return name


def _print_windows(path: str, copies: int):
    """
    mspaint (present on every Windows install) has a stable /pt flag
    that prints straight to a named printer with no dialog and no
    window ever appearing:

        mspaint.exe /pt <file> <printer name>

    This uses that printer's *default* print settings, so make sure
    its default paper size is set to 4x6" (Windows Settings >
    Printers > (your printer) > Printing preferences) or it'll scale
    or crop.
    """
    printer = PRINTER_NAME or _get_windows_default_printer()
    for _ in range(copies):
        subprocess.run(["mspaint.exe", "/pt", path, printer], check=True)


@app.route("/api/print", methods=["POST"])
def print_photo():
    """
    Always builds and saves the 4x6" sheet and returns a URL to it
    (sheet_url) so you can SEE exactly what would be/was printed —
    since silent printing has no popup to check, this is how you
    verify the layout and that "copies" is actually being read.

    Pass "preview_only": true to build the sheet WITHOUT sending it
    to the printer at all — useful for checking a layout without
    burning paper. The result page's "preview layout" button uses
    this; the real "print" button does not set it, so it both prints
    AND gives you the same preview link to double check.
    """
    body = request.get_json(force=True)
    image = body.get("image")
    set_number = int(body.get("set", 1))
    copies = int(body.get("copies", 1))
    preview_only = bool(body.get("preview_only", False))

    if not image:
        return jsonify({"error": "missing image"}), 400

    strip_img = _decode_data_url(image)
    sheet = build_sheet(strip_img, set_number)

    sheet_id = body.get("id") or uuid.uuid4().hex[:10]
    sheet_filename = f"{sheet_id}.png"
    sheet_path = os.path.join(PRINTS_DIR, sheet_filename)
    sheet.save(sheet_path, "PNG")
    sheet_url = _public_url(f"/prints/{sheet_filename}")

    if preview_only:
        return jsonify({"ok": True, "printed": False, "copies": copies, "sheet_url": sheet_url})

    try:
        _print_file(sheet_path, copies=copies)
    except Exception as exc:  # noqa: BLE001 — surface any printer error to the kiosk UI
        return jsonify({"error": f"print failed: {exc}", "sheet_url": sheet_url}), 500

    return jsonify({"ok": True, "printed": True, "copies": copies, "sheet_url": sheet_url})


if __name__ == "__main__":
    # IMPORTANT: use_reloader is always off. Flask's debug reloader
    # watches every file under this folder for changes and restarts
    # the whole server when one changes — but /api/save and
    # /api/print write new photo files into static/uploads and
    # static/prints on every single use. The reloader saw those as
    # "code changed," restarted mid-request, and killed whatever
    # request was in flight — which shows up on a guest's phone as
    # "Safari couldn't open the page because the server stopped
    # responding." debug=True still gives you in-browser tracebacks
    # if something errors, it just won't auto-restart on file writes.
    #
    # threaded=True matters just as much: Flask's dev server handles
    # ONE request at a time by default. Without this, if the booth
    # laptop is mid-request (saving a photo, building a print sheet),
    # a guest's phone trying to load the QR page at that exact moment
    # just queues up behind it — and can time out entirely, which
    # looks identical to a crashed server from the guest's side.
    debug_mode = os.environ.get("SNAPANDCO_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=5000, debug=debug_mode, use_reloader=False, threaded=True)