export type Scene = 'lilies' | 'knight' | 'garden';
export type Quality = 'fine' | 'light';

// All units are independent of the viewport and device-pixel ratio.
export const CONFIG = {
  scale: 1,
  glyphSize: 1,
  spacing: 1,
  density: 1,
  contrast: 1.12,
  gamma: .86,
  scarfSpeed: 1,
  scarfAmplitude: 1,
  grassMotion: 1,
  source: false,
};
export type Settings = typeof CONFIG;
