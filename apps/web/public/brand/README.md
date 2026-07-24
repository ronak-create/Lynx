# Lynx brand kit

Brand purple: **#6D3BAA**  ·  Wordmark typeface: **Brunson** (`apps/web/public/fonts/Brunson.ttf`)

## Vector (scalable — prefer these)
| file | use |
|------|-----|
| `lynx-mark.svg` | icon / mark only, brand purple |
| `lynx-mark-white.svg` | mark on dark surfaces |
| `lynx-mark-mono.svg` | `fill: currentColor` — inherits text/theme colour |
| `lynx-logo-horizontal.svg` / `-white` / `-mono` | mark + LYNX wordmark, side by side |
| `lynx-logo-stacked.svg` / `-white` | mark above LYNX wordmark |

## Raster (transparent PNG, flat purple)
`lynx-mark-16 / 32 / 48 / 64 / 128 / 180 / 192 / 256 / 512 / 1024.png`, plus
`lynx-mark.png` (master) and `lynx-tile-192/512.png` (white mark on a purple tile, for PWA).

## Wired up
- Favicon: `apps/web/src/app/favicon.ico` (16/32/48) + `icon.svg` (vector) + `apple-icon.png` (180).
- README: horizontal lockup, dark/light aware.

Not yet used in the site UI — kept ready for a future design pass.

Source art: `lynx-source.png`.
