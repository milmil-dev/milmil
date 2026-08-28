#!/usr/bin/env python3
"""Rebuild every milmil brand raster from the master mark.

Source of truth: docs/brand/src/mark.svg — a 64u-grid SVG containing nothing
but the mark. Everything else (favicons, PWA icons, app tiles, the wordmark
lockups, the spec sheet) is composed from it here, so a geometry or colour
change only ever happens in that one file.

    python3 scripts/build-brand-assets.py

Requires rsvg-convert (brew install librsvg). Fonts come from the system —
Avenir Next ships with macOS.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "brand" / "src" / "mark.svg"

# The mark's visual bounding box inside the 64u grid, stroke included.
MARK_BOX = (7.5, 16.0, 49.0, 32.0)  # x, y, w, h

INK_DARK = "#0A0A0F"
INK_LIGHT = "#F7F7FA"
TYPE_DARK = "#EDEDF2"
TYPE_LIGHT = "#141419"
MUTED_DARK = "#6E6E80"
MUTED_LIGHT = "#8A8A9A"

PALETTE = [
    ("#4338CA", "Indigo 700"),
    ("#7C3AED", "Violet 600"),
    ("#A78BFA", "Arch Violet"),
    ("#0A0A0F", "Void"),
]


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def mark_inner(uid: str) -> str:
    """Return the master mark's contents with its ids namespaced by `uid`."""
    svg = SRC.read_text()
    inner = svg[svg.index(">", svg.index("<svg")) + 1 : svg.rindex("</svg>")]
    for ident in re.findall(r'id="([^"]+)"', inner):
        inner = inner.replace(f'id="{ident}"', f'id="{ident}-{uid}"')
        inner = inner.replace(f"url(#{ident})", f"url(#{ident}-{uid})")
    return inner


def mark_at(uid: str, cx: float, cy: float, width: float) -> str:
    """Place the mark with its visual box `width` wide, centred on (cx, cy)."""
    _, _, bw, _ = MARK_BOX
    s = width / bw
    return (
        f'<g transform="translate({cx - 32 * s:.4f} {cy - 32 * s:.4f}) scale({s:.6f})">'
        f"{mark_inner(uid)}</g>"
    )


def svg_doc(w: float, h: float, body: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" '
        f'width="{w:g}" height="{h:g}">{body}</svg>'
    )


# --------------------------------------------------------------------------- #
# compositions
# --------------------------------------------------------------------------- #


def tile(
    size: float = 1024,
    inset: float = 0.0,
    radius: float | None = None,
    fill: float = 0.62,
) -> str:
    """Dark app tile. inset>0 leaves transparent margin (macOS); 0 is full-bleed."""
    x = size * inset
    box = size - 2 * x
    r = radius if radius is not None else (box * 0.2237 if inset else 0)
    body = (
        '<defs><radialGradient id="tile-bg" cx="0.3" cy="0.2" r="1.05">'
        '<stop offset="0" stop-color="#1C1B2E"/>'
        '<stop offset="0.7" stop-color="#0B0B12"/>'
        '<stop offset="1" stop-color="#08080D"/>'
        "</radialGradient></defs>"
        f'<rect x="{x:g}" y="{x:g}" width="{box:g}" height="{box:g}" '
        f'rx="{r:g}" ry="{r:g}" fill="url(#tile-bg)"/>'
        + mark_at("tile", size / 2, size / 2, box * fill)
    )
    return svg_doc(size, size, body)


def mark_on(bg: str, size: float = 512, fill: float = 0.68) -> str:
    body = f'<rect width="{size:g}" height="{size:g}" fill="{bg}"/>' + mark_at(
        "solo", size / 2, size / 2, size * fill
    )
    return svg_doc(size, size, body)


def lockup(dark: bool = True, size: float = 1024) -> str:
    bg = INK_DARK if dark else INK_LIGHT
    type_c = TYPE_DARK if dark else TYPE_LIGHT
    muted = MUTED_DARK if dark else MUTED_LIGHT
    body = (
        f'<rect width="{size:g}" height="{size:g}" fill="{bg}"/>'
        + mark_at("lock", size / 2, size * 0.410, size * 0.391)
        + f'<text x="{size / 2:g}" y="{size * 0.684:g}" text-anchor="middle" '
        f'font-family="Avenir Next, Futura, Helvetica Neue, sans-serif" font-weight="300" '
        f'font-size="{size * 0.115:g}" letter-spacing="{size * 0.004:g}" fill="{type_c}">milmil</text>'
        + f'<text x="{size / 2:g}" y="{size * 0.740:g}" text-anchor="middle" '
        f'font-family="Avenir Next, Futura, Helvetica Neue, sans-serif" font-weight="400" '
        f'font-size="{size * 0.0195:g}" letter-spacing="{size * 0.0092:g}" fill="{muted}">ANIME MEDIA SERVER</text>'
    )
    return svg_doc(size, size, body)


def spec_sheet(w: float = 1200, h: float = 1600) -> str:
    """The one-page reference in docs/design."""
    font = "Avenir Next, Futura, Helvetica Neue, sans-serif"
    parts = [f'<rect width="{w:g}" height="{h:g}" fill="{INK_DARK}"/>']

    def label(x, y, text, *, size=13, color=MUTED_DARK, weight=400, spacing=2.6, anchor="start"):
        return (
            f'<text x="{x:g}" y="{y:g}" text-anchor="{anchor}" font-family="{font}" '
            f'font-weight="{weight}" font-size="{size:g}" letter-spacing="{spacing:g}" '
            f'fill="{color}">{text}</text>'
        )

    parts.append(label(80, 110, "MILMIL", size=15, color="#A78BFA", spacing=5))
    parts.append(
        f'<text x="80" y="176" font-family="{font}" font-weight="200" font-size="52" '
        f'fill="{TYPE_DARK}">The Double Arch</text>'
    )
    parts.append(
        f'<text x="80" y="214" font-family="{font}" font-weight="400" font-size="17" '
        f'fill="{MUTED_DARK}">Two identical semicircles make the m of milmil.</text>'
    )
    parts.append(f'<rect x="80" y="252" width="{w - 160:g}" height="1" fill="#22222E"/>')

    # hero, dark and light
    parts.append('<rect x="80" y="300" width="500" height="360" rx="20" fill="#12121A"/>')
    parts.append(mark_at("hero-d", 330, 480, 300))
    parts.append('<rect x="620" y="300" width="500" height="360" rx="20" fill="#F5F5F7"/>')
    parts.append(mark_at("hero-l", 870, 480, 300))
    parts.append(label(80, 692, "ON VOID", size=11, spacing=3))
    parts.append(label(620, 692, "ON PAPER", size=11, spacing=3))

    # size ladder
    parts.append(label(80, 776, "SCALE", size=11, color="#A78BFA", spacing=3.6))
    ladder = [(128, "128"), (64, "64"), (48, "48"), (36, "36"), (32, "32"), (16, "16")]
    x = 80
    for px, name in ladder:
        plate = 168
        parts.append(
            f'<rect x="{x:g}" y="808" width="{plate:g}" height="{plate:g}" rx="16" fill="#12121A"/>'
        )
        parts.append(mark_at(f"lad{name}", x + plate / 2, 808 + plate / 2, px * MARK_BOX[2] / 64))
        parts.append(label(x + plate / 2, 1004, f"{name} px", size=11, spacing=2.2, anchor="middle"))
        x += plate + 8

    # palette
    parts.append(label(80, 1088, "PALETTE", size=11, color="#A78BFA", spacing=3.6))
    x = 80
    for hexv, name in PALETTE:
        parts.append(
            f'<rect x="{x:g}" y="1120" width="200" height="120" rx="14" fill="{hexv}" '
            f'stroke="#262634" stroke-width="1"/>'
        )
        parts.append(label(x, 1272, hexv.upper(), size=13, color=TYPE_DARK, spacing=1.4))
        parts.append(label(x, 1294, name, size=12, spacing=0.6))
        x += 208

    # construction notes
    parts.append(label(80, 1382, "CONSTRUCTION", size=11, color="#A78BFA", spacing=3.6))
    notes = [
        "64u grid · one modulus: stem pitch s = 21u, stems standing at 11 / 32 / 53",
        "Arch radius s/2 = 10.5u, stroke s/3 = 7u, round caps · glyph box 49 × 32u on the grid centre",
        "One gradient, #A78BFA → #7C3AED → #4338CA, running the diagonal of that box",
        "No hard-coded background: the mark is a single open stroke, so it sits on any ground",
    ]
    y = 1418
    for line in notes:
        parts.append(
            f'<text x="80" y="{y:g}" font-family="{font}" font-weight="400" font-size="15" '
            f'fill="{MUTED_DARK}">{line}</text>'
        )
        y += 30

    parts.append(
        f'<text x="80" y="{h - 60:g}" font-family="{font}" font-weight="400" font-size="12" '
        f'letter-spacing="1.6" fill="#3E3E4C">docs/brand/src/mark.svg · '
        f'python3 scripts/build-brand-assets.py</text>'
    )
    return svg_doc(w, h, "".join(parts))


# --------------------------------------------------------------------------- #
# build
# --------------------------------------------------------------------------- #

# Android launcher densities: mdpi through xxxhdpi at the legacy 48dp size.
ANDROID_ICONS = [
    ("mipmap-mdpi", 48),
    ("mipmap-hdpi", 72),
    ("mipmap-xhdpi", 96),
    ("mipmap-xxhdpi", 144),
    ("mipmap-xxxhdpi", 192),
]

MACOS_ICONS = [
    ("icon_16x16@1x.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32@1x.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128@1x.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256@1x.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512@1x.png", 512),
    ("icon_512x512@2x.png", 1024),
]


def main() -> int:
    if not shutil.which("rsvg-convert"):
        print("rsvg-convert not found — brew install librsvg", file=sys.stderr)
        return 1
    if not SRC.exists():
        print(f"missing master mark: {SRC}", file=sys.stderr)
        return 1

    tmp = Path(tempfile.mkdtemp(prefix="milmil-brand-"))
    written: list[Path] = []

    def stage(name: str, content: str) -> Path:
        p = tmp / name
        p.write_text(content)
        return p

    def png(svg: Path, out: Path, size: int) -> None:
        out.parent.mkdir(parents=True, exist_ok=True)
        run("rsvg-convert", "-w", str(size), "-h", str(size), str(svg), "-o", str(out))
        written.append(out)

    def copy_svg(out: Path) -> None:
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(SRC, out)
        written.append(out)

    s_mark = SRC
    s_tile = stage("tile.svg", tile())
    # Maskable icons are cropped to the centre 80% circle, so the mark sits smaller.
    s_maskable = stage("maskable.svg", tile(fill=0.55))
    # The macOS tile is inset to 80% of the canvas, so the mark is filled further
    # to land on the same share of the icon as the full-bleed tiles above.
    s_tile_rounded = stage("tile-rounded.svg", tile(inset=0.098, fill=0.72))
    s_lock_dark = stage("lockup-dark.svg", lockup(dark=True))
    s_lock_light = stage("lockup-light.svg", lockup(dark=False))
    s_mark_dark = stage("mark-dark.svg", mark_on(INK_DARK))
    s_sheet = stage("sheet.svg", spec_sheet())

    # web/
    copy_svg(ROOT / "web/public/favicon.svg")
    png(s_mark, ROOT / "web/public/icons/favicon-32.png", 32)
    png(s_mark, ROOT / "web/public/icons/icon-192.png", 192)
    png(s_mark, ROOT / "web/public/icons/icon-512.png", 512)
    png(s_maskable, ROOT / "web/public/icons/maskable-512.png", 512)
    png(s_tile, ROOT / "web/public/icons/apple-touch-icon.png", 180)

    # docs-site/
    copy_svg(ROOT / "docs-site/public/favicon.svg")
    copy_svg(ROOT / "docs-site/public/logo.svg")
    png(s_mark, ROOT / "docs-site/public/favicon-32.png", 32)
    png(s_mark, ROOT / "docs-site/public/icon-192.png", 192)
    png(s_mark, ROOT / "docs-site/public/icon-512.png", 512)
    png(s_tile, ROOT / "docs-site/public/apple-touch-icon.png", 180)

    # docs/brand/
    png(s_lock_dark, ROOT / "docs/brand/milmil-logo.png", 2400)
    png(s_lock_dark, ROOT / "docs/brand/milmil-logo-512.png", 512)
    png(s_lock_light, ROOT / "docs/brand/milmil-logo-light-512.png", 512)
    png(s_mark_dark, ROOT / "docs/brand/milmil-mark-512.png", 512)
    png(s_mark, ROOT / "docs/brand/milmil-favicon-32.png", 32)
    png(s_mark, ROOT / "docs/brand/milmil-favicon-64.png", 64)

    pdf = ROOT / "docs/brand/milmil-logo.pdf"
    run("rsvg-convert", "-f", "pdf", "-w", "1024", "-h", "1024", str(s_lock_dark), "-o", str(pdf))
    written.append(pdf)

    sheet = ROOT / "docs/design/milmil-logo-sheet.png"
    sheet.parent.mkdir(parents=True, exist_ok=True)
    run("rsvg-convert", "-w", "1200", "-h", "1600", str(s_sheet), "-o", str(sheet))
    written.append(sheet)

    # Android client — only when that workspace is checked out.
    android_res = ROOT / "android/app/src/main/res"
    if android_res.is_dir():
        # The adaptive foreground is drawn at 1/3 the mark's usual fill: the
        # launcher masks the outer third away and may parallax what is left,
        # so anything sized for a full-bleed tile gets its edges eaten.
        s_adaptive = stage("android-adaptive.svg", mark_on("none", 1024, fill=0.42))
        for folder, size in ANDROID_ICONS:
            png(s_tile_rounded, android_res / folder / "ic_launcher.png", size)
            png(s_adaptive, android_res / folder / "ic_launcher_foreground.png", round(size * 108 / 48))

    # iOS client — one 1024 icon; iOS masks the corners itself, so the tile is
    # full-bleed rather than the rounded one macOS needs.
    ios_icon = ROOT / "ios/Milmil/Resources/Assets.xcassets/AppIcon.appiconset"
    if ios_icon.is_dir():
        png(s_tile, ios_icon / "icon_1024.png", 1024)

    # macOS client — only when that workspace is checked out.
    appicon = ROOT / "macos/Milmil/Resources/Assets.xcassets/AppIcon.appiconset"
    if appicon.is_dir():
        for name, size in MACOS_ICONS:
            png(s_tile_rounded, appicon / name, size)
        contents = appicon / "Contents.json"
        if contents.exists():
            json.loads(contents.read_text())  # sanity: leave it alone, just verify

    shutil.rmtree(tmp, ignore_errors=True)
    for p in written:
        print(p.relative_to(ROOT))
    print(f"\n{len(written)} assets written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
