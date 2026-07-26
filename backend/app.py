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


def _public_url(path: str) -> str:
    base = SERVER_PUBLIC_URL or request.host_url.rstrip("/")
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

@app.route("/api/save", methods=["POST"])
def save_photo():
    body = request.get_json(force=True)
    image = body.get("image")
    if not image:
        return jsonify({"error": "missing image"}), 400

    photo_id = uuid.uuid4().hex[:10]
    img = _decode_data_url(image).convert("RGB")
    path = os.path.join(UPLOADS_DIR, f"{photo_id}.png")
    img.save(path, "PNG")

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
  <title>snap & co. — your photo</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "Poppins", sans-serif;
      text-align: center;
      padding: 40px 20px;
      background: #fff7ec;
      color: #442f2a;
      margin: 0;
      min-height: 100vh;
    }
    h2 { font-size: 22px; margin-bottom: 4px; }
    p.tagline { opacity: 0.7; font-size: 13px; margin-top: 0; margin-bottom: 24px; }
    .celebrate-gif {
      width: 120px;
      height: 120px;
      margin: 0 auto 12px;
      display: block;
      /* drop your own celebratory GIF at backend/static/celebrate.gif
         (confetti, sparkles, etc.) and it'll show up here automatically */
    }
    img.strip {
      max-width: 260px;
      width: 100%;
      border-radius: 8px;
      box-shadow: 0 10px 26px rgba(68, 47, 42, 0.25);
    }
    a.button {
      display: inline-block;
      margin-top: 22px;
      padding: 14px 30px;
      background: #ff69b4;
      border-radius: 999px;
      text-decoration: none;
      color: white;
      font-weight: 600;
      font-size: 15px;
      transition: transform 0.15s ease;
    }
    a.button:active { transform: scale(0.97); }
  </style>
</head>
<body>
  {% if has_gif %}<img class="celebrate-gif" src="/static/celebrate.gif" alt="">{% endif %}
  <h2>snap &amp; co.</h2>
  <p class="tagline">your strip is ready ✨</p>
  <img class="strip" src="/uploads/{{ photo_id }}.png" alt="your strip">
  <br>
  <a class="button" href="/uploads/{{ photo_id }}.png" download="snap-and-co.png">⬇ save to your phone</a>
</body>
</html>
"""


@app.route("/photo/<photo_id>")
def photo_page(photo_id):
    path = os.path.join(UPLOADS_DIR, f"{photo_id}.png")
    if not os.path.exists(path):
        return "Photo not found (or not saved yet — try again in a moment).", 404
    has_gif = os.path.exists(os.path.join(BASE_DIR, "static", "celebrate.gif"))
    return render_template_string(DOWNLOAD_PAGE, photo_id=photo_id, has_gif=has_gif)


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
    # debug=True is handy while you're setting this up (auto-reloads
    # on file changes, shows tracebacks in the browser) but turn it
    # off for the actual event — set the env var below, or just
    # change this line to debug=False.
    debug_mode = os.environ.get("SNAPANDCO_DEBUG", "1") == "1"
    app.run(host="0.0.0.0", port=5000, debug=debug_mode)