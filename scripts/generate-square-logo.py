#!/usr/bin/env python3
"""
Generate the SQUARE theLeadershipWell logo — the stacked version of the brand
wordmark in public/logo-email.png, for places that need a square mark:
Google's OAuth consent-screen logo (120x120) and the app homepage.

WHY THIS EXISTS
  Google rejected the plain square-and-plus icon as "does not uniquely
  identify your brand". The consent-screen logo must carry the brand and
  match what the app's homepage shows, so this renders the wordmark itself —
  "THE / LEADERSHIP / WELL" stacked in the navy outlined box with the orange
  "+" in the voided top-right corner (same spec as generate-email-logo.py).

USAGE
  python3 scripts/generate-square-logo.py
    → public/logo-square.png      (512x512, the homepage + any large use)
    → public/logo-square-120.png  (120x120, upload to Google Auth Platform → Branding)
  Requires Pillow:  pip install Pillow

BRAND SPEC (keep in sync with scripts/generate-email-logo.py + lib/signature.ts)
  Ink #111226 · Accent #F5821F (the "+", the one permitted accent) ·
  LiberationSans-Bold · white background (Google shows the logo on white and
  may crop it to a circle, so the box sits well inside the canvas).
"""
from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
INK = (17, 18, 38, 255)
ORANGE = (245, 130, 31, 255)
WHITE = (255, 255, 255, 255)

SIZE = 1536                 # render large, downsample for clean edges
LINES = ["THE", "LEADERSHIP", "WELL"]
BOX = (150, 190, 1370, 1386)  # outlined box; leaves room above for the plus
STROKE = 40
TRACKING = 10
LINE_GAP = 70
PLUS_ARM = 110               # half-length of each plus arm
PLUS_HALF = 22              # half the plus stroke
NOTCH_EXTRA = 40            # gap between the plus and the cut border ends


def line_width(draw, text, font):
    w = 0
    for ch in text:
        bb = draw.textbbox((0, 0), ch, font=font)
        w += (bb[2] - bb[0]) + TRACKING
    return w - TRACKING


def draw_tracked(draw, x, y, text, font):
    for ch in text:
        bb = draw.textbbox((0, 0), ch, font=font)
        draw.text((x - bb[0], y), ch, font=font, fill=INK)
        x += (bb[2] - bb[0]) + TRACKING


def render():
    img = Image.new("RGBA", (SIZE, SIZE), WHITE)
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = BOX

    # Text: size the widest line ("LEADERSHIP") to the box's inner width.
    inner = (x1 - x0) - 2 * 70
    size = 400
    while size > 20:
        font = ImageFont.truetype(FONT_PATH, size)
        if line_width(d, "LEADERSHIP", font) <= inner:
            break
        size -= 2
    cap = d.textbbox((0, 0), "H", font=font)
    cap_h = cap[3] - cap[1]
    block_h = len(LINES) * cap_h + (len(LINES) - 1) * LINE_GAP
    ty = y0 + ((y1 - y0) - block_h) // 2 - cap[1]
    for text in LINES:
        w = line_width(d, text, font)
        draw_tracked(d, x0 + ((x1 - x0) - w) // 2, ty, text, font)
        ty += cap_h + LINE_GAP

    # The plus: its top edge on the top border line, its right edge on the right border line.
    cx = x1 + STROKE // 2 - PLUS_ARM
    cy = y0 - STROKE // 2 + PLUS_ARM
    notch_left = cx - PLUS_ARM - NOTCH_EXTRA
    notch_bottom = cy + PLUS_ARM + NOTCH_EXTRA

    h = STROKE // 2
    d.rectangle([x0 - h, y0 - h, notch_left, y0 + h], fill=INK)        # top (stops short)
    d.rectangle([x0 - h, y0 - h, x0 + h, y1 + h], fill=INK)            # left
    d.rectangle([x0 - h, y1 - h, x1 + h, y1 + h], fill=INK)            # bottom
    d.rectangle([x1 - h, notch_bottom, x1 + h, y1 + h], fill=INK)      # right (starts lower)
    d.rectangle([cx - PLUS_ARM, cy - PLUS_HALF, cx + PLUS_ARM, cy + PLUS_HALF], fill=ORANGE)
    d.rectangle([cx - PLUS_HALF, cy - PLUS_ARM, cx + PLUS_HALF, cy + PLUS_ARM], fill=ORANGE)
    return img.convert("RGB")


if __name__ == "__main__":
    big = render()
    big.resize((512, 512), Image.LANCZOS).save("public/logo-square.png", optimize=True)
    big.resize((120, 120), Image.LANCZOS).save("public/logo-square-120.png", optimize=True)
    print("wrote public/logo-square.png (512) and public/logo-square-120.png (120)")
