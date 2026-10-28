// 模拟一步：系统顺序固定，保证同样的存档每次跑出同样的结果。
// P0 没有电力、科研、戴森，系统顺序里先留空位。
import type { World } from './ecs';
import { extractionSystem, productionSystem, statsSystem, transportSystem } from './systems';

export function step(w: World): void {
  extractionSystem(w);
  productionSystem(w);
  transportSystem(w);
  statsSystem(w);
  w.tick++;
}

export function run(w: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(w);
}
