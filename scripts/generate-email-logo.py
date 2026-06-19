#!/usr/bin/env python3
"""
Generate the theLeadershipWell email logo — the raster PNG embedded in the
branded email signature (public/logo-email.png).

WHY THIS EXISTS
  Mail clients (Gmail/Outlook/Apple Mail) strip SVG, so the signature must
  reference a raster PNG. This script renders the brand wordmark — "THE
  LEADERSHIP WELL" in a black outlined box with an orange "+" tucked into a
  voided top-right corner — at retina scale with anti-aliasing.

USAGE
  python3 scripts/generate-email-logo.py            # writes public/logo-email.png
  python3 scripts/generate-email-logo.py out.png    # writes a custom path
  Requires Pillow:  pip install Pillow

  This recreates the brand mark to spec. If the official vector/PNG from the
  designer is ever supplied, just drop it in at public/logo-email.png instead —
  the signature points at that path, so no code changes are needed.

BRAND SPEC (keep in sync with lib/signature.ts)
  - Text:   "THE LEADERSHIP WELL", LiberationSans-Bold (Arial/Helvetica clone)
  - Ink:    navy-black  #111226
  - Accent: orange      #F5821F   (the "+", the one permitted accent)
  - Mark:   black outlined rectangle around the text; the top-right CORNER is
            voided (top line stops short, right line starts lower) and a thin
            orange "+" sits in that gap — its TOP edge meets the top border line
            and its RIGHT edge meets the right border line.
  Tweak the dials in CONFIG below (plus weight = PLUS_HALF_THICKNESS, size =
  PLUS_ARM, how deep the void cuts = NOTCH_EXTRA).
"""
import sys
from PIL import Image, ImageDraw, ImageFont

# ── CONFIG ──────────────────────────────────────────────────────────────────
SS = 3  # supersample factor — render big, downsample for crisp edges
FONT_PATH = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
TEXT = "THE LEADERSHIP WELL"
INK = (17, 18, 38, 255)       # #111226
ORANGE = (245, 130, 31, 255)  # #F5821F

FONT_SIZE = 70 * SS
TRACKING = 3 * SS             # letter spacing
PAD_X = 34 * SS               # box <-> text horizontal padding
PAD_Y = 24 * SS               # box <-> text vertical padding
STROKE = 5 * SS               # border line thickness
MARGIN = 14 * SS              # transparent margin around the box

PLUS_ARM = 24 * SS            # half-length of each plus arm (overall size)
PLUS_HALF_THICKNESS = 4 * SS  # half the stroke width of the plus (line weight)
NOTCH_EXTRA = 9 * SS          # gap between the plus and the cut ends of the border
# ─────────────────────────────────────────────────────────────────────────────


def text_width(draw, font):
    w = 0
    for ch in TEXT:
        bb = draw.textbbox((0, 0), ch, font=font)
        w += (bb[2] - bb[0]) + TRACKING
    return w - TRACKING


def main(out_path="public/logo-email.png"):
    font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
    tmp = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    tw = text_width(tmp, font)
    ascent, descent = font.getmetrics()
    th = ascent + descent

    box_w = tw + 2 * PAD_X
    box_h = th + 2 * PAD_Y
    W = int(box_w + 2 * MARGIN)
    H = int(box_h + 2 * MARGIN)

    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    bx0, by0 = MARGIN, MARGIN              # box top-left
    bx1, by1 = MARGIN + box_w, MARGIN + box_h  # box bottom-right

    # Plus: top tip meets the top line (y = by0), right tip meets the right line
    # (x = bx1), tucked inside the corner.
    cx = bx1 - PLUS_ARM
    cy = by0 + PLUS_ARM
    notch = 2 * PLUS_ARM + NOTCH_EXTRA     # how far the top/right lines stop short

    # Border with the top-right corner voided.
    d.line([(bx0, by0), (bx1 - notch, by0)], fill=INK, width=STROKE)   # top (stops short)
    d.line([(bx0, by1), (bx1, by1)], fill=INK, width=STROKE)           # bottom
    d.line([(bx0, by0), (bx0, by1)], fill=INK, width=STROKE)           # left
    d.line([(bx1, by0 + notch), (bx1, by1)], fill=INK, width=STROKE)   # right (starts lower)

    # Wordmark, char by char to apply tracking.
    x = bx0 + PAD_X
    y = by0 + PAD_Y - 2 * SS
    for ch in TEXT:
        d.text((x, y), ch, font=font, fill=INK)
        bb = d.textbbox((0, 0), ch, font=font)
        x += (bb[2] - bb[0]) + TRACKING

    # Orange plus on top.
    d.rectangle([cx - PLUS_ARM, cy - PLUS_HALF_THICKNESS,
                 cx + PLUS_ARM, cy + PLUS_HALF_THICKNESS], fill=ORANGE)
    d.rectangle([cx - PLUS_HALF_THICKNESS, cy - PLUS_ARM,
                 cx + PLUS_HALF_THICKNESS, cy + PLUS_ARM], fill=ORANGE)

    img = img.resize((W // SS, H // SS), Image.LANCZOS)
    img.save(out_path)
    print(f"wrote {out_path}  ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "public/logo-email.png")
