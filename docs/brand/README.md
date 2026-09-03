# milmil brand assets

Every icon, favicon, app tile and lockup in this repo is generated from one
file: [`src/mark.svg`](src/mark.svg). Nothing here is hand-edited — if a raster
looks wrong, fix the master and rebuild.

```bash
make brand                            # or: python3 scripts/build-brand-assets.py
```

Needs `rsvg-convert` (`brew install librsvg`). Type is set in Avenir Next,
which ships with macOS.

## The mark — Double Arch

The m of milmil, drawn as two identical semicircular arches. milmil is
みるみる: the name doubles, so the letter carrying it doubles too — one arch,
then the same arch again. That is the doubling the
[philosophy](milmil-logo-philosophy.md) asks for, made out of the name itself
rather than borrowed from a picture.

The mark it replaces drew an eye with a play triangle for a pupil. Both halves
were symbols anyone may use, and stacking them did not make the pair any more
ours; the triangle also closed up below about 32px. A letterform can only ever
be milmil's, and it survives the compression test.

| | |
|---|---|
| Grid | 64u, glyph centred on (32, 32) |
| Modulus | stem pitch `s` = 21u — every other number derives from it |
| Stems | three, at x 11 / 32 / 53, standing on a baseline at y 44.5 |
| Arches | two identical semicircles, r = `s`/2 = 10.5u, centres at y 30 |
| Stroke | `s`/3 = 7u, round caps and joins |
| Glyph box | 49 × 32u, stroke included |
| Gradient | `#A78BFA` → `#7C3AED` → `#4338CA`, along that box's diagonal |

The mark carries no background of its own — one open stroke, no fill, so it
sits on dark and light grounds without a second artwork.

`--mm-accent` in `web/src/styles/theme.css` is `#A78BFA`, the light end of the
gradient.

## What gets written where

| Output | From | Notes |
|---|---|---|
| `web/public/favicon.svg` | mark | verbatim copy of the master |
| `web/public/icons/favicon-32.png` | mark | |
| `web/public/icons/icon-{192,512}.png` | mark | transparent; also the sidebar, splash and README image |
| `web/public/icons/maskable-512.png` | tile | full-bleed, mark at 55% so it survives the 80% safe circle |
| `web/public/icons/apple-touch-icon.png` | tile | opaque indigo plate — iOS composites transparency to black |
| `docs-site/public/{favicon.svg,logo.svg}` | mark | |
| `docs-site/public/{favicon-32,icon-192,icon-512,apple-touch-icon}.png` | mark / tile | |
| `docs/brand/milmil-logo.png` | dark lockup | 2400px, mark over the wordmark |
| `docs/brand/milmil-logo-512.png` | dark lockup | |
| `docs/brand/milmil-logo-light-512.png` | light lockup | |
| `docs/brand/milmil-mark-512.png` | mark on void | |
| `docs/brand/milmil-favicon-{32,64}.png` | mark | |
| `docs/brand/milmil-logo.pdf` | dark lockup | vector |
| `docs/design/milmil-logo-sheet.png` | spec sheet | the one-page reference |
| `macos/…/AppIcon.appiconset/*.png` | rounded tile | only when the `macos/` workspace is checked out |

The tile plate is a deep indigo radial (`#2A2558` → `#15122E` → `#0C0A18`),
not void black — a near-black tile dissolves into dark home screens and leaves
the mark unframed.

## Using it

- Give the mark clear space of at least one stem pitch (21u) on every side.
- Below 24px, ship the raster (`favicon-32.png`) rather than scaling the SVG.
- Don't recolour it, outline it, or set it on a mid-tone that swallows the
  `#4338CA` end of the gradient. On busy artwork, put it on the tile.
- The lockup sets the wordmark in Avenir Next 300. Lighter than that and the
  solid mark flattens it; heavier and the two m's start competing.
