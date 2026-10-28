// 缓冲区容量与存取规则
import { RECIPES, STORAGE_CAP_PER_ITEM, type ItemId } from './data';
import type { Entity, World } from './ecs';

/** 配方节点每种原料/产物的缓冲上限：够 N 台各备一轮，再多两轮余量 */
function crafterCap(perCraft: number, count: number): number {
  return perCraft * (count + 2);
}

export function inputCap(w: World, e: Entity, item: ItemId): number {
  if (w.storage.has(e)) return STORAGE_CAP_PER_ITEM;
  const cr = w.crafter.get(e);
  if (!cr || cr.recipe === null) return 0;
  const stack = RECIPES[cr.recipe].inputs.find((i) => i.item === item);
  return stack ? crafterCap(stack.count, cr.count) : 0;
}

export function outputCap(w: World, e: Entity, item: ItemId): number {
  if (w.storage.has(e)) return STORAGE_CAP_PER_ITEM;
  const ex = w.extractor.get(e);
  if (ex) return ex.source !== null && w.resource.get(ex.source)?.item === item ? ex.count + 10 : STORAGE_CAP_PER_ITEM;
  const cr = w.crafter.get(e);
  if (!cr) return 0;
  if (cr.recipe === null) return STORAGE_CAP_PER_ITEM;
  const stack = RECIPES[cr.recipe].outputs.find((o) => o.item === item);
  return stack ? crafterCap(stack.count, cr.count) : STORAGE_CAP_PER_ITEM;
}

/** 连线可以从 e 取走多少 */
export function available(w: World, e: Entity, item: ItemId): number {
  return w.buffer.get(e)?.output[item] ?? 0;
}

/** 连线可以往 e 放多少 */
export function space(w: World, e: Entity, item: ItemId): number {
  const buf = w.buffer.get(e);
  if (!buf) return 0;
  // 仓库只有一组库存，放在 output 里，取和放是同一份
  const held = w.storage.has(e) ? buf.output[item] ?? 0 : buf.input[item] ?? 0;
  return inputCap(w, e, item) - held;
}

export function take(w: World, e: Entity, item: ItemId, n: number): void {
  const out = w.buffer.get(e)!.output;
  out[item] = (out[item] ?? 0) - n;
}

export function put(w: World, e: Entity, item: ItemId, n: number): void {
  const buf = w.buffer.get(e)!;
  const slots = w.storage.has(e) ? buf.output : buf.input;
  slots[item] = (slots[item] ?? 0) + n;
}
