// 静态游戏数据：物品、配方、建筑。物品和配方用数字 ID，方便以后换成 TypedArray 存储。

/** 模拟步长：每秒 10 步。所有时间都以「步」为单位，保持整数运算。 */
export const TICKS_PER_SECOND = 10;

export type ItemId = number;
export type RecipeId = number;

export interface ItemDef {
  id: ItemId;
  key: string;
  name: string;
  /** 产物分层 L0–L4，用于节点配色 */
  tier: 0 | 1 | 2 | 3 | 4;
}

export const ITEMS: ItemDef[] = [
  { id: 0, key: 'iron_ore', name: '铁矿', tier: 0 },
  { id: 1, key: 'copper_ore', name: '铜矿', tier: 0 },
  { id: 2, key: 'iron_ingot', name: '铁块', tier: 1 },
  { id: 3, key: 'copper_ingot', name: '铜块', tier: 1 },
  { id: 4, key: 'magnet', name: '磁铁', tier: 1 },
  { id: 5, key: 'gear', name: '齿轮', tier: 2 },
  { id: 6, key: 'magnetic_coil', name: '磁线圈', tier: 2 },
  { id: 7, key: 'circuit_board', name: '电路板', tier: 2 },
  { id: 8, key: 'blue_matrix', name: '电磁矩阵', tier: 4 },
];

export const ITEM_BY_KEY: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.key, i]));

export function itemName(id: ItemId): string {
  return ITEMS[id]?.name ?? `#${id}`;
}

export type BuildingKind = 'miner' | 'smelter' | 'assembler' | 'lab';
export type CraftingBuilding = Exclude<BuildingKind, 'miner'>;

export const BUILDING_NAMES: Record<BuildingKind, string> = {
  miner: '采矿机',
  smelter: '电弧熔炉',
  assembler: '制造台',
  lab: '矩阵研究站',
};

export interface Stack {
  item: ItemId;
  count: number;
}

export interface RecipeDef {
  id: RecipeId;
  name: string;
  building: CraftingBuilding;
  /** 一轮耗时（步） */
  ticks: number;
  inputs: Stack[];
  outputs: Stack[];
}

const I = (key: string) => ITEM_BY_KEY[key].id;
const s = (key: string, count: number): Stack => ({ item: I(key), count });

// 按原版配方，设备 1 倍速。
export const RECIPES: RecipeDef[] = [
  { id: 0, name: '铁块', building: 'smelter', ticks: 10, inputs: [s('iron_ore', 1)], outputs: [s('iron_ingot', 1)] },
  { id: 1, name: '铜块', building: 'smelter', ticks: 10, inputs: [s('copper_ore', 1)], outputs: [s('copper_ingot', 1)] },
  { id: 2, name: '磁铁', building: 'smelter', ticks: 15, inputs: [s('iron_ore', 1)], outputs: [s('magnet', 1)] },
  { id: 3, name: '齿轮', building: 'assembler', ticks: 10, inputs: [s('iron_ingot', 1)], outputs: [s('gear', 1)] },
  {
    id: 4,
    name: '磁线圈',
    building: 'assembler',
    ticks: 10,
    inputs: [s('magnet', 2), s('copper_ingot', 1)],
    outputs: [s('magnetic_coil', 2)],
  },
  {
    id: 5,
    name: '电路板',
    building: 'assembler',
    ticks: 10,
    inputs: [s('iron_ingot', 2), s('copper_ingot', 1)],
    outputs: [s('circuit_board', 2)],
  },
  {
    id: 6,
    name: '电磁矩阵',
    building: 'lab',
    ticks: 30,
    inputs: [s('magnetic_coil', 1), s('circuit_board', 1)],
    outputs: [s('blue_matrix', 1)],
  },
];

/** 可开采的资源（P0 只有铁铜） */
export const MINABLE: ItemId[] = [I('iron_ore'), I('copper_ore')];

/** 每台采矿机每产出 1 个矿需要的步数：2 秒一个，即 30/分钟 */
export const MINER_TICKS_PER_ORE = 20;

/** 连线吞吐量（个/秒），先统一按蓝带 30/秒 */
export const LINK_ITEMS_PER_SECOND = 30;

/** 仓库每种物品的上限 */
export const STORAGE_CAP_PER_ITEM = 2000;
