# ASCII Studio

A visual, browser-local editor for making ASCII artwork and animations without code. The site opens in the original minimal artwork view. Use the small **Studio** button at the top right (or **D**) to turn the editor on. Built with TypeScript, PixiJS and Three.js. No AI image generation is used.

## Use the studio

1. Start with **Space skull**, **Stingray** or **Lilies**, or drop in your own artwork.
2. Use **Look** to choose characters, colours, density, brightness, contrast and a background. Classic ASCII, halftone dots, solid blocks, binary and custom character ramps are available, with four quick style presets.
3. Use **Motion & scene** to adjust floating, rotation, playback speed, scale, position and 3D lighting. Choose a square, portrait, landscape or workspace-sized canvas.
4. Name your scene and click **Save scene**. Saved scenes include the imported files and appear in the left library. The collection button in the header also opens them on phones.
5. Click **Export** for a clean PNG, a recorded video, or an editable scene file.

**Focus view** returns to the original full-window artwork view with its small scene selector and playback controls. **D** toggles the editor, **Space** pauses/resumes, and **Ctrl/Cmd+S** saves. Timeline seeking, restart, reduced-motion preferences and hidden-tab suspension are supported.

## Import and storage

- Photos: browser-supported image formats, including PNG, JPEG and WebP. Transparent images retain their cutout over the selected background.
- Video: browser-supported video such as MP4 and WebM. The video loops and can be paused or sought with the scene timeline.
- 3D: GLB, glTF, OBJ and STL. Existing glTF animation is retained. Draco and Meshopt decoders are bundled locally. Select/drop all companion files together for multi-file glTF or OBJ/MTL models. Prefer a self-contained GLB for the easiest import. KTX2/Basis-compressed textures are not currently supported.
- Scene files: `.ascii.json` exports contain the scene settings and embedded imported files, so they can be moved between devices and opened again.

Files stay in the browser. Saved projects use IndexedDB on the current browser/device; no account, upload service or backend is required. Imported assets are limited to 200 MB per import. Browser storage can be cleared by the browser/user, so download a scene file for a portable backup.

An image rotates in its canvas plane. True 3D rotation requires a 3D model. The existing stingray retains its procedural swimming animation; arbitrary imported photos are not converted into 3D models.

## Export

- **PNG** exports the current frame without editor controls, with a selected long edge of 720, 1080 or 1920 pixels.
- **Video** records 5, 10, 24 or 30 seconds in real time. It downloads a silent WebM (or MP4 when that is the available browser recording format), without editor controls. Keep the tab open while recording; cancellation restores the preview state.
- **Scene** downloads the editable `.ascii.json` file with its original assets.

Imported glTF materials and animations are rendered using Three.js. Photos/video and model frames pass through the same GPU ASCII conversion as the built-in artwork. Rendering and export require WebGL; 3D file import also requires WebGL 2. Video export needs a browser supporting canvas capture and MediaRecorder, such as current Chrome or Edge.

## Run locally

Requires Node.js 22.12+.

```sh
npm install
npm run dev
```

Open the URL printed by Vite, normally http://127.0.0.1:5173. This is a static app with no server-side data or credentials. `npm run build` creates the production output in `dist/`; run a build only when requested or needed to investigate a confirmed error.

Useful URLs: `?scene=skull`, `?scene=stingray`, `?scene=lilies`, `?scene=skull&t=0` for a deterministic paused frame, and `?scene=skull&studio=1` to explicitly open the editor.

## Verification

With the dev server running:

```sh
npm run verify
node scripts/verify-studio.mjs http://127.0.0.1:5180
```

The browser checks use local Chrome through Playwright. They exercise the actual editor, image/video/model import, retained presets, custom styles, backgrounds, lighting, saved assets across reloads, PNG dimensions, portable scene round-tripping, recorded video output, responsive layout and console errors. Screenshots, exported files and the report are written to ignored `test-results/`.

## Skull attribution

The skull uses [Human Skull](https://opengameart.org/content/human-skull-0), a human-made model and texture set by **CDmir**, published September 23, 2018 under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Its 4,548-triangle anatomy and UV layout are preserved. Asset provenance is in `src/assets/skull/LICENSE.md`; `scripts/prepare-skull.mjs` reproduces the packing/texture conversion from the original OBJ archive.

The anatomical photograph [Humanskull ref front.JPG](https://commons.wikimedia.org/wiki/File:Humanskull_ref_front.JPG), by **Meddlingwithnature**, photographed May 30, 2012, CC BY-SA 3.0, was consulted as a reference and is not bundled in the artwork. Backgrounds, lily/ray geometry and glyph atlases are drawn with code.
