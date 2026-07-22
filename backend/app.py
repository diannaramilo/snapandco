"""
app.py
-------
Small Flask backend for the snap & co. photobooth.

Responsibilities (only things the frontend genuinely can't do alone
in a browser):
  1. POST /api/save   -> store the composited strip image, hand back
                          a short URL. That URL is what the QR codes
                          on the result page encode, so a guest's
                          phone can open /photo/<id> and download the
                          picture without needing the laptop at all.
  2. GET  /photo/<id>  -> a tiny mobile-friendly download page.
  3. POST /api/print   -> build the correct 4x6" print sheet
                          (see print_layout.py) and send it to the
                          connected printer.

Run it with:
    cd backend
    python -m venv venv && source venv/bin/activate   (or venv\\Scripts\\activate on Windows)
    pip install -r requirements.txt
    python app.py

It listens on http://0.0.0.0:5000 by default so it's reachable both
from the same laptop (localhost) and from phones on the same wifi
(http://<laptop-lan-ip>:5000) — the QR codes need that LAN address,
see SERVER_PUBLIC_URL below.
"""

import base64
import io
import os
import platform
import subprocess
import uuid

from flask import Flask, jsonify, request, send_file, render_template_string
from flask_cors import CORS
from PIL import Image

from print_layout import build_sheet

app = Flask(__name__)
CORS(app)  # frontend may be served from a different origin/port

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "static", "uploads")
PRINTS_DIR = os.path.join(BASE_DIR, "static", "prints")
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(PRINTS_DIR, exist_ok=True)

# IMPORTANT: set this to the address guests' phones can actually
# reach — usually your laptop's LAN IP while at the stall (e.g.
# "http://192.168.1.23:5000"), or your deployed domain if this is
# hosted online. localhost only works for testing on the same machine.
SERVER_PUBLIC_URL = os.environ.get("SNAPANDCO_PUBLIC_URL", "http://localhost:5000")

# Name of the printer to use for automatic printing. Leave as None to
# use the OS default printer. On Linux/Mac this should match the
# CUPS printer name (`lpstat -p` lists them). On Windows, see the
# _print_windows() note below.
PRINTER_NAME = os.environ.get("SNAPANDCO_PRINTER_NAME") or None


def _decode_data_url(data_url: str) -> Image.Image:
    header, encoded = data_url.split(",", 1)
    raw = base64.b64decode(encoded)
    return Image.open(io.BytesIO(raw))


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
        "download_url": f"{SERVER_PUBLIC_URL}/photo/{photo_id}",
    })


DOWNLOAD_PAGE = """
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>snap & co. — your photo</title>
  <style>
    body { font-family: sans-serif; text-align: center; padding: 30px; background:#fdf1de; }
    img { max-width: 260px; border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,0.2); }
    a.button {
      display: inline-block; margin-top: 20px; padding: 12px 26px;
      background: #f3b8c8; border-radius: 999px; text-decoration: none;
      color: #3b2a24; font-weight: 700;
    }
  </style>
</head>
<body>
  <h2>snap & co.</h2>
  <img src="/uploads/{{ photo_id }}.png" alt="your strip">
  <br>
  <a class="button" href="/uploads/{{ photo_id }}.png" download="snap-and-co.png">⬇ save to phone</a>
</body>
</html>
"""


@app.route("/photo/<photo_id>")
def photo_page(photo_id):
    path = os.path.join(UPLOADS_DIR, f"{photo_id}.png")
    if not os.path.exists(path):
        return "Photo not found (or not saved yet — try again in a moment).", 404
    return render_template_string(DOWNLOAD_PAGE, photo_id=photo_id)


@app.route("/uploads/<filename>")
def serve_upload(filename):
    return send_file(os.path.join(UPLOADS_DIR, filename))


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


def _print_windows(path: str, copies: int):
    """
    Windows has no built-in silent-print-with-copies command. The
    reliable options are:
      1. Install win32print (pip install pywin32) and use
         win32api.ShellExecute(..., "print", ...) per copy, or
      2. Use a small dedicated printing utility (e.g. SumatraPDF
         with -print-to / -print-settings for exact 4x6 paper).
    Wiring one of these in is a couple hours of setup depending on
    your printer/driver, so this stub just shells out to the default
    "print" verb `copies` times as a baseline — swap in SumatraPDF
    or win32print here for a production kiosk.
    """
    for _ in range(copies):
        os.startfile(path, "print")  # noqa: F821 (Windows-only builtin)


@app.route("/api/print", methods=["POST"])
def print_photo():
    body = request.get_json(force=True)
    image = body.get("image")
    set_number = int(body.get("set", 1))
    copies = int(body.get("copies", 1))

    if not image:
        return jsonify({"error": "missing image"}), 400

    strip_img = _decode_data_url(image)
    sheet = build_sheet(strip_img, set_number)

    sheet_id = body.get("id") or uuid.uuid4().hex[:10]
    sheet_path = os.path.join(PRINTS_DIR, f"{sheet_id}.png")
    sheet.save(sheet_path, "PNG")

    try:
        _print_file(sheet_path, copies=copies)
    except Exception as exc:  # noqa: BLE001 — surface any printer error to the kiosk UI
        return jsonify({"error": f"print failed: {exc}"}), 500

    return jsonify({"ok": True, "sheet_path": sheet_path})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
