import { memo, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react';
import { setCount, setRecipe } from '../game/commands';
import { RECIPES } from '../game/data';
import { getWorld, publish, useGame, type NodeView, type SlotView } from '../game/store';
import { Icon, ItemMark } from './Icon';

export type FactoryFlowNode = Node<{ docking?: boolean; dockLabel?: string }, 'factory'>;

export function RecipePicker({ node, detail = false }: { node: NodeView; detail?: boolean }) {
  return <label className="recipe-picker nodrag nopan" onClick={(e) => e.stopPropagation()}>
    <span>生产目标</span>
    <select aria-label={`${detail ? '详情' : '节点'}生产目标 #${node.id}`} value={node.recipe ?? ''} onChange={(e) => {
      setRecipe(getWorld(), node.id, e.target.value === '' ? null : Number(e.target.value));
      publish();
    }}>
      <option value="">选择生产目标</option>
      {RECIPES.filter((r) => r.building === node.buildingKind).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
  </label>;
}

function Slot({ slot, input }: { slot: SlotView; input: boolean }) {
  return <div className={`port-row ${input ? 'input-row' : 'output-row'}`}>
    <Handle type={input ? 'target' : 'source'} position={input ? Position.Left : Position.Right} id={`${input ? 'in' : 'out'}-${slot.item}`} aria-label={`${slot.name}${input ? '输入' : '输出'}`} />
    <ItemMark item={slot.item} /><span>{slot.name}</span>
    <span className="port-quantity" title={`缓冲库存 ${slot.held} / ${slot.cap}`}>{slot.held}<small> / {slot.cap}</small></span>
  </div>;
}

export const FactoryNode = memo(function FactoryNode({ id, selected, data }: NodeProps<FactoryFlowNode>) {
  const node = useGame((s) => s.nodes[Number(id)]);
  const updateNodeInternals = useUpdateNodeInternals();
  const slots = `${node?.inputs.map((s) => s.item).join(',')}|${node?.outputs.map((s) => s.item).join(',')}|${node?.recipe}`;
  useEffect(() => { updateNodeInternals(id); }, [id, slots, updateNodeInternals]);
  if (!node) return null;
  const changeCount = (count: number) => { setCount(getWorld(), Number(id), count); publish(); };
  const isStorage = node.kind === 'storage';
  const isResource = node.kind === 'resource';
  const ex = getWorld().extractor.get(node.id);
  const labels = { resource: '自然资源', extractor: '采集设备', crafter: '生产设备', storage: '物流仓储' };
  const machine = node.kind === 'crafter' || node.kind === 'extractor';
  return <article className={`factory-node kind-${node.kind} ${selected ? 'is-selected' : ''} ${data.docking ? 'dock-target' : ''} ${ex?.side ? `mining-side-${ex.side}` : ''}`}>
    <div className="node-heading">
      <span className="node-kind"><Icon name={isResource || node.kind === 'extractor' ? 'mine' : isStorage ? 'cube' : 'factory'} size={14} />{labels[node.kind]}</span>
      <span className="node-id">{id.padStart(3, '0')}</span>
    </div>
    <div className="node-title"><h3>{node.title}</h3><span className={`status-dot ${node.state}`} title={node.statusLabel} /></div>
    <div className="node-subtitle"><span>{isResource ? '有限储量' : isStorage ? node.building : node.kind === 'extractor' ? '30 个 / 分钟 / 台' : '可配置生产目标'}</span><span className={`state-text ${node.state}`}>{node.statusLabel}</span></div>
    {isResource && <div className="deposit-body"><ItemMark item={getWorld().resource.get(node.id)!.item} /><p>{data.docking ? '松开采矿机，吸附到矿脉' : '将采矿机拼到边缘开始开采'}</p></div>}
    {node.kind === 'crafter' && <RecipePicker node={node} />}
    {node.kind === 'extractor' && <div className={`mining-source ${data.dockLabel ? 'snap-ready' : ''}`}><Icon name="mine" size={14} />{data.dockLabel ? `松开以开采 ${data.dockLabel}` : node.building}</div>}
    {machine && <div className="node-production">
      <div><strong>{node.perMinute}</strong><span> 个 / 分钟</span></div>
      <div className="count-stepper nodrag nopan">
        <button aria-label={`减少${node.title} #${id} 台数`} disabled={node.count <= 1} onClick={() => changeCount(node.count - 1)}><Icon name="minus" size={12} /></button>
        <input aria-label={`${node.title} #${id} 台数`} type="number" min="1" max="999" value={node.count} onChange={(e) => changeCount(Number(e.target.value) || 1)} />
        <button aria-label={`增加${node.title} #${id} 台数`} disabled={node.count >= 999} onClick={() => changeCount(node.count + 1)}><Icon name="plus" size={12} /></button>
      </div>
    </div>}
    {!isResource && <div className="node-ports">
      {isStorage ? <div className="storage-inlet"><Handle type="target" position={Position.Left} id="storage-in" aria-label="仓库物品输入" /><Icon name="arrow" size={14} />接收任意物品<span>输入</span></div> : node.inputs.map((slot) => <Slot key={slot.item} slot={slot} input />)}
      {node.inputs.length > 0 && <div className="port-divider" />}
      {node.outputs.map((slot) => <Slot key={slot.item} slot={slot} input={false} />)}
      {isStorage && node.outputs.length === 0 && <p className="empty-storage">连接产线，开始积累物资</p>}
      {machine && node.inputs.length === 0 && node.outputs.length === 0 && <p className="empty-storage">{node.kind === 'extractor' ? '吸附后显示矿物输出端口' : '选择目标后显示物料端口'}</p>}
    </div>}
    {node.reserve !== null && <div className="node-reserve">剩余储量 <span>{node.reserve.toLocaleString('zh-CN')}</span></div>}
  </article>;
});
