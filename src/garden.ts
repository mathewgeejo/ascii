import { Bouquet, hash, type Flower } from './bouquet';
import type { Quality } from './config';

const palette = [[244, 62, 142], [255, 193, 29], [241, 226, 188], [233, 73, 48], [167, 114, 234], [252, 160, 108]] as const;
function flower(x: number, y: number, size: number, i: number): Flower {
  return { x: x - 400, y: 935 - y, z: i * 20, size, color: palette[i % palette.length],
    tilt: .18 + hash(i + 7) * .32, yaw: (hash(i + 20) - .5) * 1.15,
    rotation: hash(i + 9) * 2, delay: 1.3, baseX: x - 400 + (hash(i) - .5) * 65, baseY: 10 + hash(i + 5) * 16 };
}

export function createGarden(quality: Quality, glyphSize: number) {
  // Uneven ground-level planting, rather than a second upright bouquet.
  const rear = new Bouquet(quality, [
    flower(125, 723, 65, 0), flower(191, 662, 69, 1), flower(282, 734, 59, 2),
    flower(623, 655, 69, 3), flower(687, 749, 62, 4), flower(586, 753, 65, 5),
    flower(103, 814, 45, 6), flower(245, 819, 59, 7), flower(647, 829, 54, 8),
  ], glyphSize);
  const front = new Bouquet(quality, [
    flower(160, 873, 49, 9), flower(274, 883, 51, 10), flower(345, 838, 49, 11),
    flower(422, 908, 38, 12), flower(519, 879, 51, 13), flower(596, 893, 43, 14),
    flower(707, 878, 44, 15),
  ], glyphSize);
  rear.render(4.2); front.render(4.2);
  return { rear, front };
}
