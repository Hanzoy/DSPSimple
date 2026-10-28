// 玩家操作：建节点、连线、改台数。所有对 World 结构的修改都走这里。
import { RECIPES, type CraftingBuilding, type ItemId, type RecipeId } from './data';
import { emptyFlow, emptyStats, type Entity, type MiningSide, type Position, type World } from './ecs';

export function addResource(w: World, pos: Position, item: ItemId, reserve = 1_000_000): Entity {
  const e = w.create();
  w.position.set(e, { ...pos });
  w.resource.set(e, { item, reserve });
  w.stats.set(e, emptyStats());
  return e;
}

export function addExtractor(w: World, pos: Position, count = 1): Entity {
  const e = w.create();
  w.position.set(e, { ...pos });
  w.extractor.set(e, { source: null, side: null, count, progress: 0 });
  w.buffer.set(e, { input: {}, output: {} });
  w.stats.set(e, emptyStats());
  return e;
}

export function addCrafter(w: World, pos: Position, building: CraftingBuilding, count = 1, recipe: RecipeId | null = null): Entity {
  const e = w.create();
  w.position.set(e, { ...pos });
  w.crafter.set(e, { building, recipe, count, progress: 0, started: false });
  w.buffer.set(e, { input: {}, output: {} });
  w.stats.set(e, emptyStats());
  return e;
}

export function addStorage(w: World, pos: Position): Entity {
  const e = w.create();
  w.position.set(e, { ...pos });
  w.storage.set(e, {});
  w.buffer.set(e, { input: {}, output: {} });
  w.stats.set(e, emptyStats());
  return e;
}

/** 节点能输出哪些物品 */
export function outputsOf(w: World, e: Entity): ItemId[] {
  const ex = w.extractor.get(e);
  const resource = ex?.source != null ? w.resource.get(ex.source) : undefined;
  const cr = w.crafter.get(e);
  const active = resource ? [resource.item] : cr?.recipe != null ? RECIPES[cr.recipe].outputs.map((o) => o.item) : [];
  const stocked = Object.entries(w.buffer.get(e)?.output ?? {}).filter(([, count]) => count > 0).map(([item]) => Number(item));
  const connected = [...w.link.values()].filter((l) => l.from === e).map((l) => l.item);
  return [...new Set([...active, ...stocked, ...connected])];
}

/** 节点能接收哪些物品；null 表示任意物品（仓库） */
export function inputsOf(w: World, e: Entity): ItemId[] | null {
  const cr = w.crafter.get(e);
  if (cr) return cr.recipe === null ? [] : RECIPES[cr.recipe].inputs.map((i) => i.item);
  if (w.storage.has(e)) return null;
  return [];
}

export function canLink(w: World, from: Entity, to: Entity, item: ItemId): boolean {
  if (from === to || !w.isNode(from) || !w.isNode(to)) return false;
  // 仓库可以往外送任意物品（库存为空时就是断供）
  if (!w.storage.has(from) && !outputsOf(w, from).includes(item)) return false;
  const accepts = inputsOf(w, to);
  if (accepts !== null && !accepts.includes(item)) return false;
  for (const l of w.link.values()) {
    if (l.from === from && l.to === to && l.item === item) return false;
  }
  return true;
}

export function addLink(w: World, from: Entity, to: Entity, item: ItemId): Entity | null {
  if (!canLink(w, from, to, item)) return null;
  const e = w.create();
  w.link.set(e, { from, to, item, credit: 0 });
  w.flow.set(e, emptyFlow());
  return e;
}

export function setCount(w: World, e: Entity, count: number): void {
  const n = Math.max(1, Math.min(999, Math.floor(count)));
  const ex = w.extractor.get(e);
  if (ex) ex.count = n;
  const cr = w.crafter.get(e);
  if (cr) cr.count = n;
}

export function moveNode(w: World, e: Entity, pos: Position): void {
  const p = w.position.get(e);
  if (p) {
    const dx = pos.x - p.x;
    const dy = pos.y - p.y;
    if (dx === 0 && dy === 0) return;
    const movingMiner = w.extractor.get(e);
    if (movingMiner?.source != null) {
      movingMiner.source = null;
      movingMiner.side = null;
      movingMiner.progress = 0;
      w.stats.set(e, emptyStats());
      w.structureVersion++;
    }
    for (const [miner, ex] of w.extractor) {
      if (ex.source === e) {
        const attached = w.position.get(miner)!;
        attached.x += dx;
        attached.y += dy;
      }
    }
    p.x = pos.x;
    p.y = pos.y;
  }
}

export interface MiningDock {
  resource: Entity;
  side: MiningSide;
  position: Position;
}
export type NodeSizes = ReadonlyMap<Entity, { width: number; height: number }>;

/** 拖动时只吸附近邻；指定矿脉时供「移到矿旁」操作选择空闲边缘。 */
export function findMiningDock(w: World, miner: Entity, sizes: NodeSizes = new Map(), target?: Entity): MiningDock | null {
  if (!w.extractor.has(miner)) return null;
  const pos = w.position.get(miner)!;
  const size = sizes.get(miner) ?? { width: 224, height: 260 };
  let nearest: MiningDock | null = null;
  let distance = target === undefined ? 85 : Infinity;
  for (const [resource] of w.resource) {
    if (target !== undefined && resource !== target) continue;
    const at = w.position.get(resource)!;
    const depositSize = sizes.get(resource) ?? { width: 224, height: 196 };
    const docks: [MiningSide, Position][] = [
      ['right', { x: at.x + depositSize.width + 16, y: at.y }],
      ['left', { x: at.x - size.width - 16, y: at.y }],
      ['bottom', { x: at.x, y: at.y + depositSize.height + 16 }],
      ['top', { x: at.x, y: at.y - size.height - 16 }],
    ];
    for (const [side, position] of docks) {
      if ([...w.extractor].some(([id, ex]) => id !== miner && ex.source === resource && ex.side === side)) continue;
      const d = Math.hypot(pos.x - position.x, pos.y - position.y);
      if (d < distance) {
        distance = d;
        nearest = { resource, side, position };
      }
    }
  }
  return nearest;
}

export function dockExtractor(w: World, miner: Entity, dock: MiningDock): void {
  const ex = w.extractor.get(miner)!;
  const resource = w.resource.get(dock.resource)!;
  w.position.set(miner, { ...dock.position });
  ex.source = dock.resource;
  ex.side = dock.side;
  ex.progress = 0;
  w.stats.set(miner, emptyStats());
  for (const [id, link] of w.link) {
    if (link.from === miner && link.item !== resource.item) w.destroy(id);
  }
  w.structureVersion++;
}

export function setRecipe(w: World, e: Entity, recipe: RecipeId | null): void {
  const cr = w.crafter.get(e)!;
  if (cr.recipe === recipe || (recipe !== null && RECIPES[recipe].building !== cr.building)) return;
  const buffer = w.buffer.get(e)!;
  if (cr.started && cr.recipe !== null) {
    for (const input of RECIPES[cr.recipe].inputs) buffer.input[input.item] = (buffer.input[input.item] ?? 0) + input.count;
  }
  // 未用完的原料和取消生产退回的原料保留在输出区，可接到仓库回收。
  for (const [item, count] of Object.entries(buffer.input)) buffer.output[Number(item)] = (buffer.output[Number(item)] ?? 0) + count;
  buffer.input = {};
  cr.recipe = recipe;
  cr.progress = 0;
  cr.started = false;
  w.stats.set(e, emptyStats());
  const inputs = recipe === null ? [] : RECIPES[recipe].inputs.map((i) => i.item);
  const outputs = recipe === null ? [] : RECIPES[recipe].outputs.map((o) => o.item);
  for (const [id, link] of w.link) {
    if ((link.to === e && !inputs.includes(link.item)) || (link.from === e && !outputs.includes(link.item))) w.destroy(id);
  }
  w.structureVersion++;
}
