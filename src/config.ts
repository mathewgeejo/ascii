export type Scene = 'lilies' | 'stingray' | 'skull' | 'custom';
export type Quality = 'fine' | 'light';
export type Background = 'space' | 'ocean' | 'black' | 'gradient';
export type Motion = 'float-spin' | 'spin' | 'float' | 'still';

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
  background: 'space' as Background,
  motion: 'float-spin' as Motion,
  rotation: .28,
  positionX: 0,
  positionY: 0,
  lightIntensity: 1,
  lightAngle: -33,
  brightness: 1,
  charset: 'classic',
  characters: ' .:-=+*#%@',
  palette: 'original',
  inkColor: '#c9b5ed',
  shadowColor: '#314360',
  fit: 'contain',
};
export type Settings = typeof CONFIG;
export const backgroundIndex = (value: Background) => ['space', 'ocean', 'black', 'gradient'].indexOf(value);
