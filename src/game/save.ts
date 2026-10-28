// 存档只保存游戏数据；统计在读档后重新计算。
import { RECIPES, type ItemId } from './data';
import { addResource } from './commands';
import { emptyFlow, emptyStats, World, type Buffer, type Crafter, type Entity, type Extractor, type Link, type Position, type Resource } from './ecs';

export const SAVE_VERSION = 2;
interface SaveV2 {
  version: 2;
  tick: number;
  position: [Entity, Position][];
  resource: [Entity, Resource][];
  extractor: [Entity, Extractor][];
  crafter: [Entity, Crafter][];
  storage: Entity[];
  buffer: [Entity, Buffer][];
  link: [Entity, Link][];
}
interface SaveV1 extends Omit<SaveV2, 'version' | 'resource' | 'extractor' | 'crafter'> {
  version: 1;
  extractor: [Entity, { item: ItemId; reserve: number; count: number; progress: number }][];
  crafter: [Entity, Omit<Crafter, 'building'> & { recipe: number }][];
}
export function serialize(w: World): string {
  const save: SaveV2 = {
    version: SAVE_VERSION, tick: w.tick, position: [...w.position], resource: [...w.resource],
    extractor: [...w.extractor], crafter: [...w.crafter], storage: [...w.storage.keys()],
    buffer: [...w.buffer], link: [...w.link],
  };
  return JSON.stringify(save);
}
export function deserialize(json: string): World {
  const save = JSON.parse(json) as SaveV1 | SaveV2;
  if (save.version !== 1 && save.version !== SAVE_VERSION) throw new Error(`不支持的存档版本 ${(save as { version: number }).version}`);
  const w = new World();
  w.tick = save.tick;
  const ids = new Set<Entity>([...save.position.map(([e]) => e), ...save.link.map(([e]) => e)]);
  for (const e of [...ids].sort((a, b) => a - b)) w.create(e);
  for (const [e, v] of save.position) w.position.set(e, v);
  for (const e of save.storage) w.storage.set(e, {});
  for (const [e, v] of save.buffer) w.buffer.set(e, v);
  for (const [e, v] of save.link) {
    w.link.set(e, v);
    w.flow.set(e, emptyFlow());
  }
  if (save.version === 1) {
    // 原节点 ID 留给采矿机，原连线、库存和生产进度不变；矿脉新建在左侧。
    for (const [e, old] of save.extractor) {
      const pos = w.position.get(e)!;
      const source = addResource(w, { x: pos.x - 240, y: pos.y }, old.item, old.reserve);
      w.extractor.set(e, { source, side: 'right', count: old.count, progress: old.progress });
    }
    for (const [e, old] of save.crafter) w.crafter.set(e, { ...old, building: RECIPES[old.recipe].building });
  } else {
    for (const [e, v] of save.resource) w.resource.set(e, v);
    for (const [e, v] of save.extractor) w.extractor.set(e, v);
    for (const [e, v] of save.crafter) w.crafter.set(e, v);
  }
  for (const e of w.position.keys()) w.stats.set(e, emptyStats());
  return w;
}
