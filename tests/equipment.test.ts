import { describe, expect, it } from 'vitest';
import { addCrafter, addExtractor, addLink, addResource, addStorage, dockExtractor, findMiningDock, inputsOf, moveNode, outputsOf, setRecipe } from '../src/game/commands';
import { World } from '../src/game/ecs';
import { deserialize, serialize } from '../src/game/save';
import { run } from '../src/game/sim';

describe('矿脉与采矿机', () => {
  it('矿脉不提供物流输出，独立采矿机在吸附前不生产', () => {
    const w = new World();
    const deposit = addResource(w, { x: 0, y: 0 }, 0, 100);
    const miner = addExtractor(w, { x: 240, y: 0 });
    run(w, 100);
    expect(outputsOf(w, deposit)).toEqual([]);
    expect(w.resource.get(deposit)!.reserve).toBe(100);
    expect(w.buffer.get(miner)!.output).toEqual({});
    const dock = findMiningDock(w, miner)!;
    expect(dock.resource).toBe(deposit);
    dockExtractor(w, miner, dock);
    run(w, 40);
    expect(w.buffer.get(miner)!.output[0]).toBe(2);
    expect(w.resource.get(deposit)!.reserve).toBe(98);
  });

  it('拖远不吸附，同一矿脉边缘不会重复占用', () => {
    const w = new World();
    const deposit = addResource(w, { x: 0, y: 0 }, 0);
    const first = addExtractor(w, { x: 240, y: 0 });
    dockExtractor(w, first, findMiningDock(w, first)!);
    const second = addExtractor(w, { x: 240, y: 0 });
    expect(findMiningDock(w, second)).toBeNull();
    moveNode(w, second, { x: 1000, y: 1000 });
    expect(findMiningDock(w, second)).toBeNull();
    expect(findMiningDock(w, second, new Map(), deposit)?.side).not.toBe('right');
  });

  it('移动矿脉带动已吸附设备，拖离设备停止采集并保留已采库存', () => {
    const w = new World();
    const deposit = addResource(w, { x: 0, y: 0 }, 1, 100);
    const miner = addExtractor(w, { x: 240, y: 0 });
    dockExtractor(w, miner, findMiningDock(w, miner)!);
    moveNode(w, deposit, { x: 80, y: 120 });
    expect(w.position.get(miner)).toEqual({ x: 320, y: 120 });
    run(w, 40);
    moveNode(w, miner, { x: 1000, y: 0 });
    run(w, 100);
    expect(w.extractor.get(miner)!.source).toBeNull();
    expect(w.buffer.get(miner)!.output[1]).toBe(2);
    expect(w.resource.get(deposit)!.reserve).toBe(98);
  });

  it('多台设备消耗同一份有限矿量，耗尽后不再产出', () => {
    const w = new World();
    const deposit = addResource(w, { x: 0, y: 0 }, 0, 3);
    const a = addExtractor(w, { x: 240, y: 0 });
    const b = addExtractor(w, { x: -240, y: 0 });
    dockExtractor(w, a, findMiningDock(w, a)!);
    dockExtractor(w, b, findMiningDock(w, b)!);
    run(w, 200);
    expect(w.resource.get(deposit)!.reserve).toBe(0);
    expect((w.buffer.get(a)!.output[0] ?? 0) + (w.buffer.get(b)!.output[0] ?? 0)).toBe(3);
  });

  it('删除矿脉只解除设备关联，不删除设备及已采库存', () => {
    const w = new World();
    const deposit = addResource(w, { x: 0, y: 0 }, 0);
    const miner = addExtractor(w, { x: 240, y: 0 });
    dockExtractor(w, miner, findMiningDock(w, miner)!);
    run(w, 40);
    w.destroy(deposit);
    run(w, 100);
    expect(w.extractor.get(miner)!.source).toBeNull();
    expect(w.buffer.get(miner)!.output[0]).toBe(2);
  });
});

describe('设备选择配方', () => {
  it('设备初始没有目标，同一个熔炉可选择铁块、铜块而不改变设备身份', () => {
    const w = new World();
    const smelter = addCrafter(w, { x: 0, y: 0 }, 'smelter');
    run(w, 100);
    expect(outputsOf(w, smelter)).toEqual([]);
    setRecipe(w, smelter, 0);
    expect(inputsOf(w, smelter)).toEqual([0]);
    setRecipe(w, smelter, 1);
    expect(inputsOf(w, smelter)).toEqual([1]);
    expect(outputsOf(w, smelter)).toEqual([3]);
    expect(w.crafter.get(smelter)!.building).toBe('smelter');
    setRecipe(w, smelter, 3);
    expect(w.crafter.get(smelter)!.recipe).toBe(1);
  });

  it('切换目标退回进行中的原料，保留库存，清理不匹配连线', () => {
    const w = new World();
    const input = addStorage(w, { x: 0, y: 0 });
    const smelter = addCrafter(w, { x: 240, y: 0 }, 'smelter', 1, 0);
    const output = addStorage(w, { x: 480, y: 0 });
    addLink(w, input, smelter, 0);
    addLink(w, smelter, output, 2);
    w.buffer.get(smelter)!.input[0] = 4;
    run(w, 1);
    w.buffer.get(smelter)!.output[2] = 2;
    setRecipe(w, smelter, 1);
    expect(w.buffer.get(smelter)!.input).toEqual({});
    expect(w.buffer.get(smelter)!.output).toEqual({ 0: 4, 2: 2 });
    expect(w.crafter.get(smelter)!.started).toBe(false);
    expect(w.link.size).toBe(0);
    expect(outputsOf(w, smelter)).toEqual([3, 0, 2]);
    addLink(w, smelter, output, 0);
    addLink(w, smelter, output, 2);
    w.buffer.get(smelter)!.input[1] = 1;
    run(w, 10);
    expect(w.buffer.get(output)!.output[0]).toBe(4);
    expect(w.buffer.get(output)!.output[2]).toBe(2);
    expect(w.buffer.get(smelter)!.output[3]).toBe(1);
  });

  it('制造台可从齿轮改为电路板，取消目标不继续生产', () => {
    const w = new World();
    const assembler = addCrafter(w, { x: 0, y: 0 }, 'assembler', 1, 3);
    setRecipe(w, assembler, 5);
    w.buffer.get(assembler)!.input = { 2: 2, 3: 1 };
    run(w, 10);
    expect(w.buffer.get(assembler)!.output[7]).toBe(2);
    setRecipe(w, assembler, null);
    run(w, 100);
    expect(w.buffer.get(assembler)!.output[7]).toBe(2);
    expect(inputsOf(w, assembler)).toEqual([]);
  });
});

describe('存档转换', () => {
  it('旧采矿节点拆开，保留节点 ID、矿量、连线、库存、已选配方和进度', () => {
    const old = {
      version: 1, tick: 120,
      position: [[1, { x: 40, y: 60 }], [2, { x: 400, y: 60 }]],
      extractor: [[1, { item: 0, count: 8, reserve: 12345, progress: 7 }]],
      crafter: [[2, { recipe: 0, count: 2, progress: 4, started: true }]],
      storage: [], buffer: [[1, { input: {}, output: { 0: 5 } }], [2, { input: { 0: 3 }, output: { 2: 1 } }]],
      link: [[3, { from: 1, to: 2, item: 0, credit: 5 }]],
    };
    const w = deserialize(JSON.stringify(old));
    const source = w.extractor.get(1)!.source!;
    expect(w.resource.get(source)).toEqual({ item: 0, reserve: 12345 });
    expect(w.position.get(source)).toEqual({ x: -200, y: 60 });
    expect(w.extractor.get(1)).toEqual({ source, side: 'right', count: 8, progress: 7 });
    expect(w.crafter.get(2)).toEqual({ building: 'smelter', recipe: 0, count: 2, progress: 4, started: true });
    expect([...w.link]).toEqual(old.link);
    expect([...w.buffer]).toEqual(old.buffer);
    const restored = deserialize(serialize(w));
    run(w, 75);
    run(restored, 75);
    expect(serialize(restored)).toBe(serialize(w));
  });
});
