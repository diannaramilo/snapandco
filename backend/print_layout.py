"""
print_layout.py
-----------------
Takes the single composited 2x6" strip image (the same PNG shown on
the result page / encoded for download) and arranges it onto one
4x6" sheet, ready to send to the printer, so the booth operator just
loads 4x6 photo paper and doesn't have to cut anything except along
the printed strip edges.

Set 1: two identical 2x6" strips side by side -> fills a 4x6" sheet.
Set 2: one full 2x6" strip + four 1x3" mini copies of the same strip
       (a 1x3" mini has the exact same 1:3 aspect ratio as the 2x6"
       strip, so it's just the same image scaled to half size),
       arranged 2x2 next to the full strip -> also fills 4x6".

All of this is done at 300dpi:
  2x6" strip  -> 600 x 1800 px
  4x6" sheet  -> 1200 x 1800 px
  1x3" mini   -> 300 x 900 px
"""

from PIL import Image

DPI = 300
STRIP_W, STRIP_H = 2 * DPI, 6 * DPI      # 600 x 1800
SHEET_W, SHEET_H = 4 * DPI, 6 * DPI      # 1200 x 1800
MINI_W, MINI_H = 1 * DPI, 3 * DPI        # 300 x 900


def _prepped_strip(strip_img: Image.Image) -> Image.Image:
    """Make sure the incoming strip image is exactly 600x1800."""
    if strip_img.size != (STRIP_W, STRIP_H):
        strip_img = strip_img.resize((STRIP_W, STRIP_H), Image.LANCZOS)
    return strip_img.convert("RGB")


def build_sheet(strip_img: Image.Image, set_number: int) -> Image.Image:
    strip_img = _prepped_strip(strip_img)
    sheet = Image.new("RGB", (SHEET_W, SHEET_H), "white")

    if set_number == 1:
        # two full strips side by side
        sheet.paste(strip_img, (0, 0))
        sheet.paste(strip_img, (STRIP_W, 0))

    elif set_number == 2:
        # one full strip on the left
        sheet.paste(strip_img, (0, 0))

        # four mini (half-size) copies in a 2x2 grid on the right
        mini = strip_img.resize((MINI_W, MINI_H), Image.LANCZOS)
        positions = [
            (STRIP_W, 0),
            (STRIP_W + MINI_W, 0),
            (STRIP_W, MINI_H),
            (STRIP_W + MINI_W, MINI_H),
        ]
        for pos in positions:
            sheet.paste(mini, pos)

    else:
        raise ValueError(f"Unknown set number: {set_number}")

    return sheet
