# snap & co. 📸

A DIY photobooth system that works two ways at once:

- **At your stall**: a laptop running this in a browser, connected to
  a **Nikon D3500** acting as the camera, hooked up to a **printer**
  loaded with 4x6" photo paper.
- **As a plain website**: anyone can open the same site on their own
  laptop and use their built-in webcam instead — same flow, just
  laptop-camera quality instead of DSLR quality, and they use
  download/QR instead of the in-person printer.

## How the flow works

```
index.html            landing page, "enter →"
  └─ choose-set.html   set 1 = two 2x6 strips | set 2 = one 2x6 + four 1x3
       └─ camera.html          4 photos, 10s apart, no retake shown
            └─ choose-layout.html   pick a frame (photos live-previewed in it)
                 │  "← retake" (only if not used yet) goes back to
                 │  camera.html?retake=1 → merges into a pool of 8 →
                 │  select-pictures.html (pick 4 of 8) → choose-layout.html
                 │  (now shows "← back" instead, retake is used up)
                 └─ result.html   final strip + QR (scan to save) +
                                  download / print / restart + copies
```

State (which set, which photos, which frame, retake-used flag) is
kept in `sessionStorage` — see `frontend/js/state.js` — so it clears
itself automatically for the next guest and there's nothing to reset
by hand between sessions except pressing "restart".

## Project structure

```
snapandco/
├── frontend/                 all client-side code, plain HTML/CSS/JS
│   ├── index.html            landing
│   ├── choose-set.html       set 1 / set 2
│   ├── camera.html           capture 4 photos
│   ├── select-pictures.html  only shown after a retake (choose 4 of 8)
│   ├── choose-layout.html    frame picker
│   ├── result.html           QR + download + print + restart
│   ├── css/                  one stylesheet per page + shared style.css
│   ├── js/
│   │   ├── state.js          sessionStorage helpers
│   │   ├── transition.js     page fade/slide transitions
│   │   ├── strip-render.js   canvas frame drawing (shared by layout + result)
│   │   ├── camera.js
│   │   ├── choose-set.js
│   │   ├── select-pictures.js
│   │   ├── choose-layout.js
│   │   └── result.js
│   └── assets/frames/        drop real frame PNG overlays here if you
│                              want actual artwork instead of the
│                              canvas-drawn placeholder frames
└── backend/                   Python/Flask, only needed for QR-saving
    │                          and automatic printing
    ├── app.py                 /api/save, /photo/<id>, /api/print
    ├── print_layout.py        builds the actual 4x6" print sheet
    ├── requirements.txt
    └── static/
        ├── uploads/           saved strips (served for QR download)
        └── prints/            generated 4x6" print sheets
```

## Running it

### Frontend only (no printing/QR-saving, just try the flow)
Any static file server works, e.g. from `frontend/`:
```bash
python -m http.server 8000
```
then open `http://localhost:8000`. Download still works with no
backend running; QR/print need the backend below.

### Full setup (stall laptop)
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py                   # runs on http://0.0.0.0:5000
```
Then serve `frontend/` the same way as above. In
`frontend/js/result.js`, `BACKEND_URL` defaults to
`http://localhost:5000` — change it (or set
`window.SNAPANDCO_BACKEND_URL` before the script loads) to your
laptop's LAN IP so guests' **phones** can reach it for the QR scan,
e.g. `http://192.168.1.23:5000`. Also set that same address as
`SNAPANDCO_PUBLIC_URL` when starting `app.py` so the QR link matches:
```bash
SNAPANDCO_PUBLIC_URL=http://192.168.1.23:5000 python app.py
```

## Using the Nikon D3500 as the camera

The D3500 is on Nikon's officially supported list for **Nikon Webcam
Utility**:
1. Install "Nikon Webcam Utility" from Nikon's download center on
   the stall laptop.
2. Connect the D3500 via USB, turn it on, set it to **Photo mode**
   (Live View).
3. Once the utility is running, the OS sees the camera as a normal
   webcam device — no special driver work needed on the web app
   side.
4. On `camera.html`, pick "Nikon Webcam Utility" from the camera
   dropdown instead of the laptop's built-in webcam.

Two caveats worth knowing before your event: the Nikon utility
currently only supports Windows and Mac (not Linux), and Nikon's own
Live View has a hard-coded ~30 minute timeout — not an issue per
session, but worth restarting the utility occasionally during a long
event if the feed ever freezes.

## Printing automatically

`backend/print_layout.py` takes the single 2x6" strip image and lays
it out onto a 4x6" sheet:
- **Set 1** → the same strip printed twice, side by side (two 2x6"
  strips on one 4x6" sheet — cut down the middle).
- **Set 2** → one full-size 2x6" strip + four half-size (1x3") copies
  of the same strip in a 2x2 grid next to it.

`app.py`'s `/api/print` route calls this, saves the sheet, and sends
it to the printer with `lp` (Linux/Mac via CUPS). On Windows there's
no equivalent single command with copy count + exact paper size
control — the current code shells out to the default print verb per
copy as a placeholder; for a real kiosk, swap in
[SumatraPDF](https://www.sumatrapdfreader.org/) command-line printing
or `pywin32`'s `win32print`, both of which can force the 4x6" tray
and skip the print dialog. Either way, load your printer with 4x6"
photo paper and set that as its default paper size so nothing gets
cropped.

For the browser fallback (`window.print()` if the backend is
unreachable), add a print stylesheet with `@page { size: 4in 6in; }`
and run the browser in kiosk print mode
(`--kiosk-printing` Chrome flag) so it skips the print dialog and
prints straight to the default printer.

## Frames

Frames are real transparent PNGs in `frontend/assets/frames/`
(`a1.png`, `a2.png`, `b1.png`, `b2.png`, `c1.png`, `c2.png`, `d1.png`,
`d2.png` — 8 designs). Each one is the frame's border/branding/
decorations with the 4 photo areas cut out as transparent windows.

`frontend/assets/frames/frames.json` is the catalog: for each frame
it lists the file name and the 4 window rectangles (as fractions of
the image's width/height, so they scale to any canvas size) — these
were auto-detected from each PNG's transparent regions. At render
time (`strip-render.js`), the 4 captured photos are cover-fit into
those window rectangles on the canvas, then the frame PNG is drawn
on top so the photos show through the cutouts.

**To add a new frame later:** export a transparent PNG the same way
(frame art with 4 clear rectangular holes for photos, ~600x1800px or
larger), drop it in `frontend/assets/frames/`, and add an entry to
`frames.json` with its 4 window fractions. No JS changes needed —
the gallery and result page both read from `frames.json`.

## Pushing this to GitHub

This folder is already an initialized git repo. To push it to a new
GitHub repo named `snapandco`:
```bash
git add .
git commit -m "Initial snap & co. photobooth"
gh repo create snapandco --public --source=. --remote=origin --push
```
(or, without the `gh` CLI: create an empty repo called `snapandco` on
github.com, then `git remote add origin <the repo's URL>` and
`git push -u origin main`.)
