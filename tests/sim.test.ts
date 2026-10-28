import { describe, expect, it } from 'vitest';
import { ITEM_BY_KEY, RECIPES, TICKS_PER_SECOND } from '../src/game/data';
import { addCrafter, addExtractor, addLink, addResource, addStorage, dockExtractor } from '../src/game/commands';
import { World } from '../src/game/ecs';
import { buildBlueMatrixModule } from '../src/game/scenarios';
import { run } from '../src/game/sim';

const item = (key: string) => ITEM_BY_KEY[key].id;
const recipe = (name: string) => RECIPES.find((r) => r.name === name)!.id;
const minutes = (m: number) => m * 60 * TICKS_PER_SECOND;

function stored(w: World, e: number, key: string): number {
  return w.buffer.get(e)!.output[item(key)] ?? 0;
}

function miningSite(w: World, count: number): number {
  const resource = addResource(w, { x: 0, y: 0 }, item('iron_ore'));
  const miner = addExtractor(w, { x: 240, y: 0 }, count);
  dockExtractor(w, miner, { resource, side: 'right', position: { x: 240, y: 0 } });
  return miner;
}

describe('蓝矩阵模块 6:1:1:3:2:2', () => {
  it('稳定后每分钟产出 120 个蓝矩阵，连线全绿', () => {
    const w = new World();
    const m = buildBlueMatrixModule(w);
    run(w, minutes(1)); // 预热，缓冲区填满
    const before = stored(w, m.store, 'blue_matrix');
    run(w, minutes(5));
    const perMinute = (stored(w, m.store, 'blue_matrix') - before) / 5;

    expect(perMinute).toBeGreaterThanOrEqual(118);
    expect(perMinute).toBeLessThanOrEqual(122);
    expect(w.stats.get(m.lab)!.state).toBe('running');
    for (const f of w.flow.values()) expect(f.state).toBe('ok');
  });

  it('磁铁熔炉只有 1 台时，研究站缺料，磁铁连线变黄', () => {
    const w = new World();
    const m = buildBlueMatrixModule(w);
    w.crafter.get(m.magnet)!.count = 1;
    run(w, minutes(1));
    const before = stored(w, m.store, 'blue_matrix');
    run(w, minutes(5));

    // 1 台磁铁熔炉 = 40 磁铁/分 → 40 磁线圈/分（2 磁铁出 2 个）→ 蓝矩阵 40/分
    const perMinute = (stored(w, m.store, 'blue_matrix') - before) / 5;
    expect(perMinute).toBeGreaterThanOrEqual(39);
    expect(perMinute).toBeLessThanOrEqual(41);
    expect(w.stats.get(m.lab)!.state).toBe('starved');
    const magnetLink = [...w.link].find(([, l]) => l.from === m.magnet)![0];
    expect(w.flow.get(magnetLink)!.state).toBe('short');
  });
});

describe('运输', () => {
  it('一个出口接两个下游时平均分配', () => {
    const w = new World();
    const ore = miningSite(w, 2); // 60/分
    const a = addCrafter(w, { x: 0, y: 0 }, 'smelter', 1, recipe('铁块')); // 各需要 60/分
    const b = addCrafter(w, { x: 0, y: 0 }, 'smelter', 1, recipe('铁块'));
    const sa = addStorage(w, { x: 0, y: 0 });
    const sb = addStorage(w, { x: 0, y: 0 });
    addLink(w, ore, a, item('iron_ore'));
    addLink(w, ore, b, item('iron_ore'));
    addLink(w, a, sa, item('iron_ingot'));
    addLink(w, b, sb, item('iron_ingot'));
    run(w, minutes(4));

    const ia = stored(w, sa, 'iron_ingot');
    const ib = stored(w, sb, 'iron_ingot');
    expect(Math.abs(ia - ib)).toBeLessThanOrEqual(2);
    expect(ia + ib).toBeGreaterThan(230);
  });

  it('下游堵住时上游停工，不丢物品', () => {
    const w = new World();
    const ore = miningSite(w, 4);
    const smelter = addCrafter(w, { x: 0, y: 0 }, 'smelter', 1, recipe('铁块'));
    addLink(w, ore, smelter, item('iron_ore'));
    run(w, minutes(1));

    expect(w.stats.get(smelter)!.state).toBe('blocked');
    expect(w.stats.get(ore)!.state).toBe('blocked');
    const reserveUsed = 1_000_000 - w.resource.get(w.extractor.get(ore)!.source!)!.reserve;
    const buf = (e: number) => w.buffer.get(e)!;
    const held =
      (buf(ore).output[item('iron_ore')] ?? 0) +
      (buf(smelter).input[item('iron_ore')] ?? 0) +
      (buf(smelter).output[item('iron_ingot')] ?? 0) +
      (w.crafter.get(smelter)!.started ? 1 : 0);
    expect(held).toBe(reserveUsed);
  });
});

describe('确定性', () => {
  it('同样的布局跑同样的步数，结果完全一致', () => {
    const snapshot = () => {
      const w = new World();
      buildBlueMatrixModule(w);
      run(w, 1234);
      return JSON.stringify({ buffers: [...w.buffer], crafters: [...w.crafter], links: [...w.link] });
    };
    expect(snapshot()).toBe(snapshot());
  });
});
