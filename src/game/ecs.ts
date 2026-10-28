// 轻量 ECS：实体是自增 ID，组件是按 ID 存的表，系统是按固定顺序调用的函数（见 sim.ts）。
import type { CraftingBuilding, ItemId, RecipeId } from './data';

export type Entity = number;

export interface Position {
  x: number;
  y: number;
}

/** 矿脉独立存储资源种类和剩余储量，不参与物流。 */
export interface Resource {
  item: ItemId;
  reserve: number;
}

export type MiningSide = 'right' | 'left' | 'top' | 'bottom';

/** 采矿设备：只有吸附到矿脉后才能生产。 */
export interface Extractor {
  source: Entity | null;
  side: MiningSide | null;
  count: number;
  /** 采矿进度（机器·步） */
  progress: number;
}

/** 设备类型固定，生产目标可在该设备支持的配方中切换。 */
export interface Crafter {
  building: CraftingBuilding;
  recipe: RecipeId | null;
  count: number;
  /** 当前这一轮已推进的步数 */
  progress: number;
  /** 当前这一轮是否已扣过原料 */
  started: boolean;
}

/** 仓库节点（标记组件，库存在 Buffer.output 里） */
export type Storage = Record<string, never>;

/** 缓冲区。配方节点：input 收原料、output 放产物；仓库和资源节点只用 output。 */
export interface Buffer {
  input: Record<ItemId, number>;
  output: Record<ItemId, number>;
}

/** 连线也是实体 */
export interface Link {
  from: Entity;
  to: Entity;
  item: ItemId;
  /** 吞吐额度，单位是 1/TICKS_PER_SECOND 个物品，满 TICKS_PER_SECOND 才能搬 1 个 */
  credit: number;
}

export type NodeState = 'running' | 'starved' | 'blocked' | 'idle';

/** 节点统计，只用于显示。produced/starvedTicks/blockedTicks 是当前窗口的计数，state/perMinute 是上一个窗口的结果。 */
export interface NodeStats {
  state: NodeState;
  perMinute: number;
  produced: number;
  starvedTicks: number;
  blockedTicks: number;
  /** 本步缺的原料 */
  missing: ItemId[];
}

export type LinkState = 'ok' | 'short' | 'cut' | 'idle';

/** 连线在一个统计窗口内的流量，只用于显示 */
export interface Flow {
  moved: number;
  /** 窗口内下游因缺这种物品而停工的步数 */
  missingTicks: number;
  perMinute: number;
  state: LinkState;
}

export class World {
  tick = 0;
  private nextId = 1;

  position = new Map<Entity, Position>();
  resource = new Map<Entity, Resource>();
  extractor = new Map<Entity, Extractor>();
  crafter = new Map<Entity, Crafter>();
  storage = new Map<Entity, Storage>();
  buffer = new Map<Entity, Buffer>();
  link = new Map<Entity, Link>();
  stats = new Map<Entity, NodeStats>();
  flow = new Map<Entity, Flow>();

  /** 节点或连线增删时 +1，界面据此重建画布结构 */
  structureVersion = 0;

  create(id?: Entity): Entity {
    const e = id ?? this.nextId;
    this.nextId = Math.max(this.nextId, e + 1);
    this.structureVersion++;
    return e;
  }

  destroy(e: Entity): void {
    for (const [miner, ex] of this.extractor) {
      if (ex.source === e) {
        ex.source = null;
        ex.side = null;
        ex.progress = 0;
        this.stats.set(miner, emptyStats());
      }
    }
    for (const [l, link] of this.link) {
      if (link.from === e || link.to === e) this.destroy(l);
    }
    this.position.delete(e);
    this.resource.delete(e);
    this.extractor.delete(e);
    this.crafter.delete(e);
    this.storage.delete(e);
    this.buffer.delete(e);
    this.link.delete(e);
    this.stats.delete(e);
    this.flow.delete(e);
    this.structureVersion++;
  }

  isNode(e: Entity): boolean {
    return this.position.has(e);
  }
}

export function emptyStats(): NodeStats {
  return { state: 'idle', perMinute: 0, produced: 0, starvedTicks: 0, blockedTicks: 0, missing: [] };
}

export function emptyFlow(): Flow {
  return { moved: 0, missingTicks: 0, perMinute: 0, state: 'idle' };
}
