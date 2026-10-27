# ASCII studies

A real-time ASCII artwork built with Vite, TypeScript and PixiJS 8. It contains three scenes: a moving knight (the default), a procedural bouquet of lilies, and the knight standing among lilies. The artwork runs locally in the browser; it uses no backend, remote fonts, or account.

## Run

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Build and serve the production bundle with:

```sh
npm run build
npm run preview
```

The static production site is written to `dist/`.

## Scenes and controls

- **Knight** is the default scene. Its ASCII rendering has a moving crimson scarf and grass.
- **Lilies** is an animated, 4.2-second bloom. **Restart** replays it; with reduced motion enabled, the completed bouquet remains visible.
- **Knight in lilies** combines the knight with the flower bed.
- The scene selector is in the upper-right corner. The unobtrusive controls at the bottom pause/resume animation, restart it, and choose fine or light rendering quality.
- Press **D** to toggle the hidden studio panel. **Space** pauses or resumes while focus is not in a form control. The panel offers a timeline, glyph density and size, character spacing, quality, and scene-specific appearance settings.
- Animation suspends while the document is hidden. The application also respects reduced-motion preferences.

## URL parameters and settings

- `?scene=knight`, `?scene=lilies`, or `?scene=garden` selects a scene (`garden` is labelled “Knight in lilies” in the UI).
- `?t=2.7` opens a scene at a timeline position in seconds.
- `?quality=light` starts at light rendering quality.
- `?debug` opens the studio panel.

An explicitly supplied `scene` takes precedence; otherwise, the app remembers the last selected scene locally. Core visual and animation settings are in `src/config.ts`.

## Rendering

No raster artwork is used. The knight is modelled procedurally in `src/knight-sdf.ts` as signed-distance armour (great helm with eye slits and breaths, laminated pauldrons and fauld, rivets, mail skirt, surcoat, tattered cloak, sword) and ray-marched once at start-up on a throwaway WebGL2 context into a cached 800×1000 source canvas. Each frame only the crimson scarf (two ribbon tails plus the neck wrap, `src/knight.ts`) is redrawn on top of that cache.

A PixiJS mesh shader (`src/ascii-filter.ts`) converts the source to a stable character grid. Its glyph atlas holds a blank cell, the ramp `. , : ; - = + * # % @`, and six grass glyphs `. , ' / \ |`. Glyph positions and per-cell noise are anchored to scene coordinates, so armour characters never shimmer; output glyphs keep the source colours.

Grass (`src/grass.ts`) is simulated directly on the same cell grid: seeded blades bend under travelling wind gusts and each cell picks a glyph from the blade's local slope. The grid is uploaded as a small nearest-filtered texture every frame; front blades overlap the knight's feet.

The lilies scene is drawn from procedural geometry to a reusable CPU depth buffer, then submitted to PixiJS with a preallocated sprite pool. Fine and light quality change the logical cell size without changing the composition.

## Scripts and verification

- `npm run dev` — start the Vite development server.
- `npm run build` — run TypeScript checking and create a Vite production build.
- `npm run preview` — serve the production build locally.
- `npm run verify` — run browser checks with Playwright Chromium and SwiftShader. The Vite server must already be running; set `PREVIEW_URL` to verify another local server. Checks cover the default and switched scenes, rendered WebGL output, playback controls, restart, quality, the hidden panel, reduced motion, hidden-document suspension, mobile overflow, and browser/program errors.

Verification screenshots and the JSON report are saved to `/tmp/verify/`, not the repository. `node scripts/capture.mjs` captures desktop scenes and a mobile view to the same directory.

## Reference comparison

The knight was compared frame by frame against the supplied 12-second screen recording of an ASCII knight (laptop, browser chrome and caption excluded).

Matched: black stage; bowed great helm high in the centre; upright sword in the left third with pommel, grip, crossguard and the gauntlet closed on the grip; layered off-white armour separated by black recesses; crimson scarf leaving the neck and streaming right, with displacement growing toward the free ends; sparse, dark olive grass moving more slowly than the scarf; stationary armour, sword and camera.

Remaining differences:
- The pose is a kneeling knight, a little more upright and less compact than the reference's hunched crouch.
- Limbs are built from rounded primitives, so the armour reads cleaner and more geometric than the painted reference.
- The scarf is a shaded 2D ribbon rather than simulated cloth, and there is no bloom glow.
- The reference is a phone recording of a laptop screen, so colour and glyph-size comparison is approximate.
