# ASCII studies

Three real-time artworks built with Vite, TypeScript and PixiJS 8.22:

- **Lilies** — the original twelve-flower procedural bouquet, blooming once over 4.2 seconds.
- **Knight** — a large, broad armoured figure kneeling beside a planted sword, with the other gauntlet resting on the opposite thigh. A crimson scarf, grass and sparse windborne dust move continuously.
- **Knight in lilies** — the same knight surrounded by a dense, colourful lily field extending across the complete viewport width.

The small selector in the top-right switches scenes and remembers the last choice. A first visit starts with the knight. No AI-generated image, reference screenshot, prerecorded video, remote font or external artwork is used by the site.

## Run

Requires Node.js 22.12+ (tested with 22.14):

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite, normally http://127.0.0.1:5173.

```sh
npm run build
npm run preview
```

`dist/` contains the complete static production site; it needs no backend or account. Preview normally runs at http://127.0.0.1:4173.

## Controls and configuration

Bottom controls provide pause/resume, restart and Fine/Light quality. **Space** also pauses/resumes when a form control is not focused. **D** opens the hidden studio panel, which provides timeline seeking, glyph size/density/spacing, contrast, gamma, scarf speed/amplitude, grass motion, wind particles and source/ASCII comparison. Knight-specific controls are hidden in the lily scene.

Defaults are in `src/config.ts`. `scale` controls uniform scene scale. Fine quality uses 2.5 × 4 world-unit cells and a 2× display buffer; Light uses 3.5 × 5.6 cells and a 1× buffer. Glyph size multiplies the logical cell size independently of display resolution. Character spacing adjusts the ink coverage within each cell. All randomness is seeded.

Deep links:

- `?scene=knight`, `?scene=lilies`, `?scene=garden`
- `?scene=knight&t=2.7` — deterministic, paused frame at 2.7 seconds
- `?scene=garden&quality=light&debug` — lower density with the studio open

Reduced motion displays a stable knight frame or the completed bouquet, including after restart. Hidden documents stop requesting animation frames. The knight wind uses continuous time without a timeline reset, so there is no artificial loop boundary. The lily scene stops rendering after its bloom is complete. Resizing preserves proportions and the complete sword, scarf and figure.

## Source and rendering

`src/knight-art.svg` is an original hand-built layered vector illustration. Its bowed helmet, raised sword-side gauntlet, broad cuirass, overlapping pauldrons, waist lames, tassets, knee plates, greaves and sabatons use shaped gradients and black separations. `src/knight.ts` caches this artwork once, adds seeded surface wear, and draws the moving cloth/grass/dust into an offscreen source canvas. Scarf strips use independent travelling waves, a fixed root, increasing tip displacement, twist, and changing fold shadows. Rear/front layers protect the helmet and shoulder overlap.

`src/ascii-filter.ts` performs the knight's ASCII conversion on the GPU using PixiJS's supported v8 Filter/GlProgram APIs. A cached, explicitly drawn 5×7 monospaced glyph atlas makes texture independent of operating-system font rasterization. Source colours, gamma, contrast and stable cell noise determine glyph coverage. No text objects, DOM characters, CPU pixel readbacks or large typed-array allocations are created during the animation loop. Warm grey metal, crimson cloth, muted olive grass and dust use the same ASCII filter.

`src/bouquet.ts` generates curved stems, folded leaves, six-petal lily surfaces and stamens, rasterizes their 3D surfaces into reusable character-resolution colour/depth buffers, and resolves intersections per cell. The original bouquet retains its pooled PixiJS sprite renderer. `src/garden.ts` generates several seeded rows of lilies across the scene width. The complete flower field is cached in front/rear layers and regenerated only when its width, glyph resolution or quality changes.

The knight is drawn larger than the original bouquet, and its garden source canvas expands horizontally on wide screens to cover the full ground while retaining the figure's proportions. Armour geometry remains static while cloth, dust and grass animate.

PixiJS APIs were checked against official [Filters](https://pixijs.com/8.x/guides/components/filters), [Filter](https://pixijs.download/v8.22.0/docs/filters.Filter.html), [Texture](https://pixijs.download/v8.22.0/docs/rendering.Texture.html), and [Sprite](https://pixijs.download/v8.22.0/docs/scene.Sprite.html) documentation.

## Verification

With the dev server running:

```sh
npm run verify
```

The browser checks use locally installed Chrome through Playwright. Set `PREVIEW_URL` to run against a production preview or another server. They verify rendered armour/scarf pixels, stable armour while the scarf moves, deterministic seeking, pause/resume, restart, hidden-tab suspension, all three scenes, quality settings, advanced controls, source comparison, remembered selection, mobile/landscape layouts, lily growth/replay/hold, reduced motion and console errors. Screenshots and a JSON report are saved under `test-results/`; these are QA artifacts and are not bundled as artwork.

`node scripts/capture.mjs` captures quick desktop/source/mobile comparison views.

## Reference matching limits

The supplied knight still image was used to refine the bowed angular helmet, left sword, raised arm, pale armour against black, crimson scarf and grassy silhouette. Subsequent requested changes broaden and enlarge the figure, make the kneeling pose explicit, move the free hand onto the opposite thigh, strengthen the wind and add dust. Fine armour contours remain an original vector interpretation rather than an exact tracing. No playable reference video was available, so the wind motion is procedural and has not been matched frame for frame. The original lily video was also unavailable.
