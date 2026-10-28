// 界面和模拟之间的桥：World 是唯一的数据源，这里定期从它推导出只读的「视图」给 React 订阅。
// 每个节点/连线组件只订阅自己那份视图，视图没变就复用旧对象，避免整张画布重渲染。
import { create } from 'zustand';
import { BUILDING_NAMES, RECIPES, TICKS_PER_SECOND, itemName, type BuildingKind, type ItemId, type RecipeId } from './data';
import { inputCap, outputCap } from './buffers';
import { outputsOf } from './commands';
import { World, type Entity, type LinkState, type NodeState } from './ecs';
import { deserialize, serialize } from './save';
import { step } from './sim';

export type NodeKind = 'resource' | 'extractor' | 'crafter' | 'storage';

export interface SlotView {
  item: ItemId;
  name: string;
  held: number;
  cap: number;
}

export interface NodeView {
  id: Entity;
  kind: NodeKind;
  title: string;
  building: string;
  buildingKind: BuildingKind | null;
  recipe: RecipeId | null;
  source: Entity | null;
  statusLabel: string;
  count: number;
  state: NodeState;
  perMinute: number;
  reserve: number | null;
  inputs: SlotView[];
  outputs: SlotView[];
}

export interface LinkView {
  id: Entity;
  item: ItemId;
  state: LinkState;
  perMinute: number;
}

interface GameStore {
  /** 节点或连线增删时变化，画布据此重建结构 */
  structure: number;
  nodes: Record<Entity, NodeView>;
  links: Record<Entity, LinkView>;
  tick: number;
  running: boolean;
  speed: number;
  savedAt: number | null;
  saveFailed: boolean;
}

export const useGame = create<GameStore>(() => ({
  structure: 0,
  nodes: {},
  links: {},
  tick: 0,
  running: true,
  speed: 1,
  savedAt: null,
  saveFailed: false,
}));

let world = new World();
export const getWorld = () => world;

export function kindOf(w: World, e: Entity): NodeKind {
  if (w.resource.has(e)) return 'resource';
  if (w.extractor.has(e)) return 'extractor';
  if (w.crafter.has(e)) return 'crafter';
  return 'storage';
}

function nodeView(w: World, e: Entity): NodeView {
  const stats = w.stats.get(e)!;
  const resource = w.resource.get(e);
  const base: NodeView = {
    id: e, kind: 'storage', title: '仓库', building: '小型储物仓', buildingKind: null,
    recipe: null, source: null, statusLabel: '共享库存', count: 1, state: 'idle', perMinute: 0,
    reserve: null, inputs: [], outputs: [],
  };
  if (resource) {
    const miners = [...w.extractor.values()].filter((ex) => ex.source === e).length;
    return { ...base, kind: 'resource', title: itemName(resource.item), building: '自然矿脉', count: 0,
      reserve: resource.reserve, state: resource.reserve > 0 && miners > 0 ? 'running' : 'idle',
      statusLabel: resource.reserve <= 0 ? '矿脉耗尽' : miners > 0 ? `已接入 ${miners} 组采矿机` : '等待采矿机',
    };
  }
  const buf = w.buffer.get(e)!;
  const slot = (item: ItemId, held: number, cap: number): SlotView => ({ item, name: itemName(item), held, cap });
  const outputs = outputsOf(w, e).map((i) => slot(i, buf.output[i] ?? 0, outputCap(w, e, i)));
  const stateLabels = { running: '生产中', starved: '缺少原料', blocked: '出口堵塞', idle: '待机' };
  const ex = w.extractor.get(e);
  if (ex) {
    const deposit = ex.source !== null ? w.resource.get(ex.source) : undefined;
    const available = deposit && deposit.reserve > 0;
    return { ...base, kind: 'extractor', title: BUILDING_NAMES.miner, buildingKind: 'miner',
      building: deposit ? `开采 ${itemName(deposit.item)} · #${ex.source}` : '拖到矿脉边缘开始开采',
      source: ex.source, count: ex.count, state: available ? stats.state : 'idle',
      statusLabel: !deposit ? '未连接矿脉' : deposit.reserve <= 0 ? '矿脉耗尽' : stateLabels[stats.state],
      perMinute: available ? Math.round(stats.perMinute) : 0, outputs,
    };
  }
  const cr = w.crafter.get(e);
  if (cr) {
    const r = cr.recipe !== null ? RECIPES[cr.recipe] : undefined;
    return { ...base, kind: 'crafter', title: BUILDING_NAMES[cr.building], buildingKind: cr.building,
      building: r?.name ?? '未选择生产目标', recipe: cr.recipe, count: cr.count,
      state: r ? stats.state : 'idle', statusLabel: r ? stateLabels[stats.state] : '未选择目标',
      perMinute: r ? Math.round(stats.perMinute * r.outputs[0].count) : 0,
      inputs: r?.inputs.map((i) => slot(i.item, buf.input[i.item] ?? 0, inputCap(w, e, i.item))) ?? [], outputs,
    };
  }
  return { ...base, outputs };
}

/** 新视图和旧视图内容相同时返回旧对象，让订阅它的组件不重渲染 */
function reuse<T>(prev: T | undefined, next: T): T {
  return prev !== undefined && JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}

export function publish(): void {
  const w = world;
  const prev = useGame.getState();
  const nodes: Record<Entity, NodeView> = {};
  for (const e of w.position.keys()) nodes[e] = reuse(prev.nodes[e], nodeView(w, e));
  const links: Record<Entity, LinkView> = {};
  for (const [e, l] of w.link) {
    const f = w.flow.get(e)!;
    links[e] = reuse(prev.links[e], { id: e, item: l.item, state: f.state, perMinute: Math.round(f.perMinute) });
  }
  useGame.setState({ nodes, links, tick: w.tick, structure: w.structureVersion });
}

// ---- 存档 ----

const SAVE_KEY = 'dsp-simple-save';

export function saveGame(): boolean {
  try {
    localStorage.setItem(SAVE_KEY, serialize(world));
    useGame.setState({ savedAt: Date.now(), saveFailed: false });
    return true;
  } catch {
    useGame.setState({ saveFailed: true });
    return false;
  }
}

/** 读取本地存档，成功返回 true */
export function loadGame(): boolean {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    if (!json) return false;
    const loaded = deserialize(json);
    if (JSON.parse(json).version === 1) {
      try { localStorage.setItem(`${SAVE_KEY}-v1-backup`, json); } catch { /* 备份失败不影响读取现有存档。 */ }
    }
    replaceWorld(loaded);
    return true;
  } catch {
    return false;
  }
}

export function replaceWorld(next: World): void {
  // 保证新世界的结构版本号一定和旧的不同，画布才会重建
  next.structureVersion = world.structureVersion + 1;
  world = next;
  publish();
}

// ---- 模拟循环 ----

/** 一帧最多补跑的步数，切回标签页时不会一下子卡住 */
const MAX_TICKS_PER_FRAME = 50;
/** 界面刷新间隔（毫秒） */
const PUBLISH_INTERVAL = 200;
const AUTOSAVE_INTERVAL = 5000;

export function startLoop(): () => void {
  let last = performance.now();
  let debt = 0;
  let lastPublish = 0;
  let lastSave = last;
  let raf = 0;
  const onVisibilityChange = () => {
    last = performance.now();
    debt = 0;
    if (document.hidden) saveGame();
  };
  const onPageHide = () => { saveGame(); };
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);

  const frame = (now: number) => {
    const { running, speed } = useGame.getState();
    if (running && !document.hidden) {
      debt += ((now - last) / 1000) * TICKS_PER_SECOND * speed;
      let n = Math.min(Math.floor(debt), MAX_TICKS_PER_FRAME * speed);
      debt = Math.min(debt - n, TICKS_PER_SECOND);
      while (n-- > 0) step(world);
    }
    last = now;
    if (now - lastPublish >= PUBLISH_INTERVAL) {
      publish();
      lastPublish = now;
    }
    if (now - lastSave >= AUTOSAVE_INTERVAL) {
      saveGame();
      lastSave = now;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
  };
}
