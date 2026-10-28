export type Scene = 'lilies' | 'stingray';
export type Quality = 'fine' | 'light';

// All units are independent of the viewport and device-pixel ratio.
export const CONFIG = {
  scale: 1,
  glyphSize: 1,
  spacing: 1,
  density: 1,
  contrast: 1.12,
  gamma: .86,
  swimSpeed: 1,
  finAmplitude: 1,
  tailAmplitude: 1,
  water: 1.35,
  glow: 1,
  source: false,
};
export type Settings = typeof CONFIG;
