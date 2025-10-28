# Voyage to Mars — NASA Textures (WebGL PWA)

Minimal WebGL ray-sphere renderer with **equirectangular planet textures**.

## Replace with real NASA textures
Drop JPG files in `/tex` with **exact** names:
- `earth.jpg` – Earth (Blue Marble 8K equirectangular)
- `mars.jpg` – Mars (MOLA/MGS shaded color map)
- `jupiter.jpg` – Jupiter (Cylindrical map)
- `neptune.jpg` – Neptune (Cylindrical map)

> All textures must be **equirectangular** (width = 2 × height), RGB JPG, recommended 4K–8K.

## Controls
Space (play/pausa) • +/- (speed) • C (camera AUTO/LIBERA) • R (restart) • Drag to orbit in FREE.

## Deploy
Static host (GitHub Pages). PWA: `manifest.json` + `service-worker.js` (cache-first).
