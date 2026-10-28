import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { useGame } from '../game/store';
import { itemName } from '../game/data';

const states = { ok: '供给正常', short: '供给不足', cut: '断供', idle: '待机 / 堵塞' };

export const TransportEdge = memo(function TransportEdge(props: EdgeProps) {
  const flow = useGame((s) => s.links[Number(props.id)]);
  const [path, x, y] = getBezierPath(props);
  if (!flow) return null;
  return <>
    <BaseEdge id={props.id} path={path} interactionWidth={22} style={{ stroke: `var(--flow-${flow.state})`, strokeWidth: props.selected ? 3 : 1.8 }} />
    <EdgeLabelRenderer><div className={`flow-label nodrag nopan flow-${flow.state} ${props.selected ? 'is-selected' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }} title={`${itemName(flow.item)} · ${states[flow.state]}`}>
      <span className="flow-dot" />{flow.perMinute}<small>/min</small>
    </div></EdgeLabelRenderer>
  </>;
});
