# ASCII lilies

A full-viewport, procedural lily bouquet built with Vite, TypeScript and PixiJS 8. No image, video, remote font, backend, or account is used for the artwork.

## Run

Requires Node.js 22.12+ (tested with 22.14).

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. To create and serve the production bundle:

```sh
npm run build
npm run preview
```

The static production site is in `dist/`.

## Controls

- **Replay** restarts the 4.2-second bloom. With reduced motion enabled it keeps the completed bouquet visible.
- **D** opens the hidden studio panel; **Space** pauses/resumes while the panel is open.
- The panel includes timeline seeking, glyph density, and fine/light quality.
- `?debug` opens the panel; `?t=2.7` opens a paused timeline frame; `?quality=light` starts at lower logical resolution.

## Rendering

`src/bouquet.ts` defines a deterministic arrangement of twelve six-petal lilies. Parametric petals unfold by changing their spread, exposed length, twist and backward curl. Folded lanceolate leaves and curved stems use independent growth delays. A fixed orthographic camera projects these surfaces into a reusable CPU depth buffer. Triangles are rasterized at character-cell centres, interpolating surface colours and resolving individual petal/leaf intersections. Two-sided lighting, throat shading, veins and seeded markings give the petals depth. Filaments and pollen are depth-tested too.

`src/main.ts` generates one small monospaced glyph atlas, preallocates a sprite pool, and submits occupied cells to PixiJS's sprite batcher. The grid uses non-square character cells and the entire artwork scales uniformly. Noise is anchored to grid coordinates. Animation uses elapsed time; it suspends while the document is hidden and stops scheduling frames after completion. Resizing redraws the retained scene. Reduced-motion changes are observed live.

Fine quality uses 2.5 × 4 world-unit cells; light quality uses 3.5 × 5.6. Geometry and composition stay the same. The studio density slider deliberately removes a stable subset of glyphs for inspection.

PixiJS APIs were checked against the installed version's official [Texture](https://pixijs.download/v8.22.0/docs/rendering.Texture.html), [Sprite](https://pixijs.download/v8.22.0/docs/scene.Sprite.html), and [Application](https://pixijs.com/8.x/guides/components/application) documentation.

## Browser verification

With the dev server running, `npm run verify` uses locally installed Chrome through Playwright. Set `PREVIEW_URL` to test a different server. It saves early-growth, leaf, partial-bloom, full-bloom and mobile screenshots in `test-results/` and verifies deterministic seeking, replay, idle hold, developer controls, quality, reduced motion and browser errors. Screenshots are verification artifacts, not application assets.

The video referenced in the brief was not available in the supplied conversation or workspace. This arrangement follows the written composition and timing; exact flower positions, petal silhouettes, texture and frame timing have not been compared to the original video.
