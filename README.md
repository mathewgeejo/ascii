# Living ASCII studies

Three real-time artworks built with Vite, TypeScript and PixiJS:

- **Space skull** — a natural anatomical human skull, with actual 3D rotation, hollow orbital and nasal cavities, individual teeth, cranial sutures and detailed bone shading. Four depths of parallax stars, faint blue/violet nebula clouds, a distant ringed planet and a small crescent moon establish the deep-space setting. The skull drifts slowly in three dimensions. A brief red laser burst fires from the eye sockets once per turn, about every 22 seconds at the default speed; otherwise the sockets remain empty.
- **Stingray** — the original luminous procedural ray with rippling fins, an undulating tail, animated ocean caustics and drifting plankton.
- **Lilies** — the original twelve-flower procedural bouquet, blooming over 4.2 seconds and holding when complete.

The small selector at the top right switches artwork and remembers the selection. New visits start with the skull. The shark has been removed. No AI-generated image, reference, texture or geometry is used.

## Run

Requires Node.js 22.12+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, normally http://127.0.0.1:5173. `npm run build` creates a static production site in `dist/`; `npm run preview` serves that output. Neither a backend nor an account is required. Run a production build only when requested or needed to investigate a confirmed error.

## Controls

Bottom controls provide pause/resume, restart and Fine/Light quality. **Space** also pauses/resumes unless a form control is focused. **D** opens the studio for timeline seeking, glyph size, density, character spacing, contrast, gamma and smooth-source comparison. Skull controls adjust animation speed, rotation/floating, bone relief, stars and red lasers. Reduced motion shows a stable frame; hidden tabs stop requesting animation frames.

Deep links:

- `?scene=skull`, `?scene=stingray`, `?scene=lilies`
- `?scene=skull&t=0` — deterministic, paused front view
- `?scene=skull&t=4.7` — profile
- `?scene=skull&t=20.25` — brief red laser burst
- `?scene=skull&quality=light&debug` — lighter rendering with the studio open

## Skull reference and attribution

Anatomical reference photograph: [Humanskull ref front.JPG](https://commons.wikimedia.org/wiki/File:Humanskull_ref_front.JPG), by Meddlingwithnature, photographed May 30, 2012, CC BY-SA 3.0. It was consulted to check the skull's proportions and is not bundled in the artwork.

The skull uses [Human Skull](https://opengameart.org/content/human-skull-0), a human-made model and texture set by **CDmir**, published September 23, 2018 under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The downloaded OBJ contains 4,548 triangles. Its geometry and UV layout are preserved; the model is centered, uniformly scaled and packed into GPU buffers. Existing albedo, normal and ambient-occlusion maps are compressed locally. Asset provenance is recorded in `src/assets/skull/LICENSE.md`.

`scripts/prepare-skull.mjs` reproduces the conversion after extracting the original `skull-obj.zip` into `test-results/`. It performs ordinary geometry processing and canvas texture resizing, with no AI tools.

## Rendering

`src/skull.ts` renders the anatomical mesh with a real depth buffer, perspective, rotating surface normals, tangent-space bone relief, ambient occlusion and directional lighting. Red laser cylinders use the same 3D transformation and depth test, so they originate in the sockets and are occluded by bone. `src/space.ts` generates the layered star field, drifting nebula and shaded planets with shader math. Its star cores are sized to survive the ASCII character-grid sampling. All runtime assets are local.

`src/ascii-filter.ts` applies the existing GPU ASCII treatment: a hand-drawn 5×7 glyph atlas, stable cell noise, source colour, contrast and gamma. Scene-specific exposure preserves the skull's natural shading while retaining the original stingray treatment. Fine uses 2.5×4 world-unit cells and a 2× display buffer; Light uses 3.5×5.6 cells and a 1× display buffer.

`src/stingray.ts` retains the original deforming shader meshes. `src/ocean.ts` generates moving water and plankton. `src/bouquet.ts` retains the original procedural flower geometry and character-resolution depth buffer.

## Verification

With the dev server running:

```sh
npm run verify
node scripts/capture.mjs
```

Both scripts accept a local URL as the first argument, or `PREVIEW_URL` in the environment. They use locally installed Chrome through Playwright. Verification checks actual rendered bone and laser pixels, 3D profile rotation, deterministic seeking, pause/restart, hidden-tab suspension, both qualities, source comparison, phone/landscape resizing, the retained lily and stingray scenes, remembered selection, reduced motion, console errors and unexpected remote requests. Screenshots and the JSON report are written to ignored `test-results/` and are not bundled as artwork.
