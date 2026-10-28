// 各系统按 sim.ts 里的固定顺序每步调用一次。
import { LINK_ITEMS_PER_SECOND, MINER_TICKS_PER_ORE, RECIPES, TICKS_PER_SECOND } from './data';
import { available, outputCap, put, space, take } from './buffers';
import type { Link, NodeState, World } from './ecs';

/** 采矿：N 台采矿机每步各推进 1 */
export function extractionSystem(w: World): void {
  for (const [e, ex] of w.extractor) {
    const stats = w.stats.get(e)!;
    const buf = w.buffer.get(e)!;
    const resource = ex.source !== null ? w.resource.get(ex.source) : undefined;
    if (!resource || resource.reserve <= 0) continue;
    ex.progress += ex.count;
    while (ex.progress >= MINER_TICKS_PER_ORE && resource.reserve > 0) {
      const held = buf.output[resource.item] ?? 0;
      if (held >= outputCap(w, e, resource.item)) {
        ex.progress = MINER_TICKS_PER_ORE;
        stats.blockedTicks++;
        break;
      }
      buf.output[resource.item] = held + 1;
      resource.reserve--;
      ex.progress -= MINER_TICKS_PER_ORE;
      stats.produced++;
    }
  }
}

/**
 * 生产：N 台建筑共用缓冲区，每步共有 N 机器·步的预算。
 * 一轮开始时扣原料，推进满 ticks 步后产出；一步内预算够就连做多轮。
 */
export function productionSystem(w: World): void {
  for (const [e, cr] of w.crafter) {
    if (cr.recipe === null) continue;
    const r = RECIPES[cr.recipe];
    const buf = w.buffer.get(e)!;
    const stats = w.stats.get(e)!;
    stats.missing = [];
    let budget = cr.count;

    for (;;) {
      if (!cr.started) {
        // 这一步的时间刚好用完，下一轮留到下一步再开，免得误报缺料
        if (budget === 0) break;
        const missing = r.inputs.filter((i) => (buf.input[i.item] ?? 0) < i.count).map((i) => i.item);
        if (missing.length > 0) {
          stats.missing = missing;
          stats.starvedTicks++;
          cr.progress = 0;
          break;
        }
        for (const i of r.inputs) buf.input[i.item] -= i.count;
        cr.started = true;
      }

      const need = r.ticks - cr.progress;
      if (budget < need) {
        cr.progress += budget;
        break;
      }
      budget -= need;
      cr.progress = r.ticks;

      const full = r.outputs.some((o) => (buf.output[o.item] ?? 0) + o.count > outputCap(w, e, o.item));
      if (full) {
        stats.blockedTicks++;
        break;
      }
      for (const o of r.outputs) buf.output[o.item] = (buf.output[o.item] ?? 0) + o.count;
      stats.produced++;
      cr.progress = 0;
      cr.started = false;
    }
  }
}

/** 连线额度上限：最多攒 1 秒的量，避免停了一阵后瞬间搬一大批 */
const CREDIT_CAP = Math.max(LINK_ITEMS_PER_SECOND, TICKS_PER_SECOND);

/**
 * 运输：每条连线每步获得吞吐额度，然后所有连线轮流每次搬 1 个，
 * 起点每步轮换，保证一个出口接多个下游时分配公平。
 */
export function transportSystem(w: World): void {
  const links: [number, Link][] = [...w.link];
  const n = links.length;
  if (n === 0) return;
  for (const [, l] of links) l.credit = Math.min(l.credit + LINK_ITEMS_PER_SECOND, CREDIT_CAP);

  const start = w.tick % n;
  let moved = true;
  while (moved) {
    moved = false;
    for (let k = 0; k < n; k++) {
      const [id, l] = links[(start + k) % n];
      if (l.credit < TICKS_PER_SECOND) continue;
      if (available(w, l.from, l.item) <= 0 || space(w, l.to, l.item) <= 0) continue;
      take(w, l.from, l.item, 1);
      put(w, l.to, l.item, 1);
      l.credit -= TICKS_PER_SECOND;
      w.flow.get(id)!.moved++;
      moved = true;
    }
  }
}

/** 统计窗口：50 步 = 5 秒 */
export const STATS_WINDOW = 50;
const PER_MINUTE = (60 * TICKS_PER_SECOND) / STATS_WINDOW;

/** 显示用速率做指数平滑：单个 5 秒窗口的精度只有 12/分钟，平滑后读数才稳定 */
function smooth(prev: number, sample: number): number {
  return prev === 0 ? sample : prev * 0.75 + sample * 0.25;
}

/** 统计：每步记录缺料，每个窗口结束时算出速率和颜色状态 */
export function statsSystem(w: World): void {
  for (const [id, l] of w.link) {
    if (w.stats.get(l.to)?.missing.includes(l.item)) w.flow.get(id)!.missingTicks++;
  }

  if ((w.tick + 1) % STATS_WINDOW !== 0) return;

  const threshold = STATS_WINDOW * 0.1;
  for (const s of w.stats.values()) {
    let state: NodeState;
    if (s.produced === 0) state = s.starvedTicks > 0 ? 'starved' : s.blockedTicks > 0 ? 'blocked' : 'idle';
    else if (s.starvedTicks > threshold) state = 'starved';
    else if (s.blockedTicks > threshold) state = 'blocked';
    else state = 'running';
    s.state = state;
    s.perMinute = smooth(s.perMinute, s.produced * PER_MINUTE);
    s.produced = 0;
    s.starvedTicks = 0;
    s.blockedTicks = 0;
  }
  for (const f of w.flow.values()) {
    if (f.moved === 0) f.state = f.missingTicks > 0 ? 'cut' : 'idle';
    else f.state = f.missingTicks > threshold ? 'short' : 'ok';
    f.perMinute = smooth(f.perMinute, f.moved * PER_MINUTE);
    f.moved = 0;
    f.missingTicks = 0;
  }
}
