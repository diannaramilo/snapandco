<div align="center">

# 📸 snap & co.

**a DIY photobooth, browser-based — works as a physical event stall *and* a plain website**

</div>

---

## what is this?

**snap & co.** is a photobooth experience you run entirely in a browser. Set it up at an event with a DSLR and a printer for the full walk-up-and-print booth experience, or share the link and let people use it from their own laptop with their own webcam — same flow either way.

Take 4 photos, pick a frame, and walk away with a printed strip *and* a digital copy sent straight to your phone via QR code. No app installs, no dedicated booth software.

## features

- 🎬 **guided capture flow** — a countdown timer walks guests through 4 shots, one at a time
- 🖼️ **real frame designs** — pick from a gallery of frames, live-previewed with your own photos before you commit
- ↩️ **one retake, built in** — messed up a shot? retake the whole set once, then choose your favorite 4 out of the 8
- 🧾 **two print layouts** — a double 2x6" strip, or one 2x6" strip plus four mini 1x3" copies, automatically laid out on a single 4x6" sheet
- 📱 **QR to save** — scan to grab the digital copy on your phone, no cables, no cutting in line for the laptop
- 🖨️ **print on the spot** — sent straight to a connected printer at the event
- 💻 **works from any laptop** — no DSLR? no problem, it falls back to a regular webcam

## how it works

```
enter → choose a layout set → smile for 4 photos → pick a frame → scan, download, or print
```

## built with

- vanilla HTML / CSS / JavaScript on the frontend — no framework, no build step
- Python (Flask) on the backend for saving photos, generating the QR-linked download page, and sending the finished sheet to the printer
- a real Nikon DSLR for capture at in-person events, via Nikon's Webcam Utility

## made for

Pop-up events, fairs, birthdays, school orgs — anywhere you'd want a photobooth without renting one.

---

<div align="center">

made with 🩷 by **@yngrie**

</div>