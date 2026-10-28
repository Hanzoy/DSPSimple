// 预置布局。蓝矩阵模块见 docs/design-overview.md 4.2：6 研究站 : 1 磁线圈 : 1 电路板 : 3 磁铁 : 2 铁块 : 2 铜块。
import { ITEM_BY_KEY, RECIPES } from './data';
import { addCrafter, addExtractor, addLink, addResource, addStorage, dockExtractor } from './commands';
import type { Entity, Position, World } from './ecs';

const item = (key: string) => ITEM_BY_KEY[key].id;
const recipe = (name: string) => RECIPES.find((r) => r.name === name)!.id;

export function buildBlueMatrixModule(w: World, origin: Position = { x: 0, y: 0 }): Record<string, Entity> {
  const at = (x: number, y: number) => ({ x: origin.x + x, y: origin.y + y });

  const ironDeposit = addResource(w, at(-240, 0), item('iron_ore'));
  const copperDeposit = addResource(w, at(-240, 400), item('copper_ore'));
  const ironOre = addExtractor(w, at(0, 0), 8);
  const copperOre = addExtractor(w, at(0, 400), 4);
  dockExtractor(w, ironOre, { resource: ironDeposit, side: 'right', position: at(0, 0) });
  dockExtractor(w, copperOre, { resource: copperDeposit, side: 'right', position: at(0, 400) });
  const magnet = addCrafter(w, at(340, -220), 'smelter', 3, recipe('磁铁'));
  const iron = addCrafter(w, at(340, 100), 'smelter', 2, recipe('铁块'));
  const copper = addCrafter(w, at(340, 420), 'smelter', 2, recipe('铜块'));
  const coil = addCrafter(w, at(680, -160), 'assembler', 1, recipe('磁线圈'));
  const circuit = addCrafter(w, at(680, 240), 'assembler', 1, recipe('电路板'));
  const lab = addCrafter(w, at(1020, 60), 'lab', 6, recipe('电磁矩阵'));
  const store = addStorage(w, at(1360, 60));

  addLink(w, ironOre, magnet, item('iron_ore'));
  addLink(w, ironOre, iron, item('iron_ore'));
  addLink(w, copperOre, copper, item('copper_ore'));
  addLink(w, magnet, coil, item('magnet'));
  addLink(w, copper, coil, item('copper_ingot'));
  addLink(w, iron, circuit, item('iron_ingot'));
  addLink(w, copper, circuit, item('copper_ingot'));
  addLink(w, coil, lab, item('magnetic_coil'));
  addLink(w, circuit, lab, item('circuit_board'));
  addLink(w, lab, store, item('blue_matrix'));

  return { ironDeposit, copperDeposit, ironOre, copperOre, magnet, iron, copper, coil, circuit, lab, store };
}
