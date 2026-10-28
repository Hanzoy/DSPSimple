import { useCallback, useEffect, useRef, useState } from 'react';
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, applyEdgeChanges, applyNodeChanges, useReactFlow, type Connection, type Edge, type EdgeChange, type NodeChange } from '@xyflow/react';
import { addCrafter, addExtractor, addLink, addResource, addStorage, dockExtractor, findMiningDock, inputsOf, moveNode, outputsOf, type MiningDock } from '../game/commands';
import { BUILDING_NAMES, MINABLE, RECIPES, TICKS_PER_SECOND, itemName, type CraftingBuilding } from '../game/data';
import { buildBlueMatrixModule } from '../game/scenarios';
import { getWorld, publish, saveGame, startLoop, useGame } from '../game/store';
import { FactoryNode, RecipePicker, type FactoryFlowNode } from './FactoryNode';
import { TransportEdge } from './TransportEdge';
import { Icon, ItemMark } from './Icon';

const nodeTypes = { factory: FactoryNode };
const edgeTypes = { transport: TransportEdge };
type BuildChoice = { key: string; name: string; detail: string } & (
  { kind: 'resource'; item: number } | { kind: 'extractor' } |
  { kind: 'crafter'; building: CraftingBuilding } | { kind: 'storage' }
);
const catalog: BuildChoice[] = [
  ...MINABLE.map((item) => ({ key: `resource-${item}`, kind: 'resource' as const, item, name: itemName(item), detail: '自然矿脉 · 初始储量 1,000,000' })),
  { key: 'miner', kind: 'extractor', name: BUILDING_NAMES.miner, detail: '拼在矿脉边缘开采 · 30 个/分/台' },
  { key: 'smelter', kind: 'crafter', building: 'smelter', name: BUILDING_NAMES.smelter, detail: '选择目标：铁块、铜块、磁铁' },
  { key: 'assembler', kind: 'crafter', building: 'assembler', name: BUILDING_NAMES.assembler, detail: '选择目标：齿轮、磁线圈、电路板' },
  { key: 'lab', kind: 'crafter', building: 'lab', name: BUILDING_NAMES.lab, detail: '选择目标：电磁矩阵' },
  { key: 'storage', kind: 'storage', name: '小型储物仓', detail: '每种物品可储存 2,000 个' },
];

function graphNodes(): FactoryFlowNode[] {
  return [...getWorld().position].map(([id, position]) => ({ id: String(id), type: 'factory', position: { ...position }, ariaLabel: `${useGame.getState().nodes[id]?.title ?? '节点'} #${id}`, data: {} }));
}

function graphEdges(): Edge[] {
  const w = getWorld();
  return [...w.link].map(([id, link]) => ({ id: String(id), type: 'transport', source: String(link.from), target: String(link.to), sourceHandle: `out-${link.item}`, targetHandle: w.storage.has(link.to) ? 'storage-in' : `in-${link.item}` }));
}

function Header({ onMessage }: { onMessage: (message: string) => void }) {
  const running = useGame((s) => s.running);
  const speed = useGame((s) => s.speed);
  const tick = useGame((s) => s.tick);
  const savedAt = useGame((s) => s.savedAt);
  const saveFailed = useGame((s) => s.saveFailed);
  const minutes = Math.floor(tick / TICKS_PER_SECOND / 60);
  const seconds = Math.floor(tick / TICKS_PER_SECOND) % 60;
  return <header className="app-header">
    <div className="brand"><span className="brand-orbit" aria-hidden="true"><i /></span><div><strong>DSP<span> SIMPLE</span></strong><small>无限画布 · 工业计划</small></div><span className="version-badge">P0</span></div>
    <div className="session-label"><span className="planet-dot" /><span>起始行星<small>蓝矩阵生产区</small></span></div>
    <div className="simulation-controls">
      <span className="simulation-clock" title="模拟运行时间">{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</span>
      <button className={`run-button ${running ? 'active' : ''}`} onClick={() => useGame.setState({ running: !running })}><Icon name={running ? 'pause' : 'play'} size={15} />{running ? '暂停' : '继续'}</button>
      <div className="speed-options" aria-label="模拟速度">{[1, 2, 5].map((s) => <button key={s} aria-pressed={speed === s} onClick={() => useGame.setState({ speed: s })}>{s}×</button>)}</div>
      <div className="save-control"><button className="secondary-button" onClick={() => onMessage(saveGame() ? '已保存到此浏览器，下次打开可继续。' : '保存失败，浏览器存储不可用或空间不足。')}><Icon name="save" size={16} />保存</button><small>{saveFailed ? '本地保存失败' : savedAt ? '已自动保存到本地' : '每 5 秒自动保存'}</small></div>
    </div>
  </header>;
}

function Library({ onBuild, onClose }: { onBuild: (choice: BuildChoice) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const choices = catalog.filter((c) => (filter === 'all' || c.kind === filter || (filter === 'equipment' && (c.kind === 'extractor' || c.kind === 'crafter'))) && `${c.name} ${c.detail}`.includes(query.trim()));
  return <aside className="build-library" aria-label="建造目录">
    <div className="sidebar-heading"><div><span className="eyebrow">CONSTRUCTION</span><h2>建造目录</h2></div><button className="icon-button library-close" aria-label="收起建造目录" onClick={onClose}><Icon name="close" /></button><span className="count-badge">{catalog.length}</span></div>
    <label className="search-box"><Icon name="search" size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索设备或矿产" aria-label="搜索设备或矿产" /></label>
    <div className="catalog-filters">{[['all', '全部'], ['resource', '矿产'], ['equipment', '设备'], ['storage', '仓储']].map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>
    <div className="catalog-list">
      {choices.map((c) => <button key={c.key} className="catalog-item" onClick={() => onBuild(c)} title={`添加${c.name}`}>
        {c.kind === 'resource' ? <ItemMark item={c.item} /> : <span className="warehouse-mark"><Icon name={c.kind === 'extractor' ? 'mine' : c.kind === 'storage' ? 'cube' : 'factory'} size={20} /></span>}
        <span className="catalog-copy"><strong>{c.name}</strong><small>{c.detail}</small></span><Icon name="plus" size={14} />
      </button>)}
      {choices.length === 0 && <p className="empty-search">没有匹配的设施</p>}
    </div>
    <div className="library-help"><span className="eyebrow">从一条产线开始</span><p>先放置矿脉，再把采矿机拼到旁边。<br />熔炉和制造台选择生产目标，<br />连接物料端口，让工厂运转。</p><div><span>铁矿</span><Icon name="arrow" size={12} /><span>采矿机</span><Icon name="arrow" size={12} /><span>仓库</span></div></div>
    <div className="library-footer"><span className="status-dot running" />自由建造<small>原型阶段 · 无建造消耗</small></div>
  </aside>;
}

function Inspector({ selected, onClose, onMessage, onDock }: { selected: string; onClose: () => void; onMessage: (message: string) => void; onDock: (miner: number, resource: number) => void }) {
  const nodes = useGame((s) => s.nodes);
  const node = nodes[Number(selected)];
  const [outputItem, setOutputItem] = useState('');
  const [destination, setDestination] = useState('');
  const [depositChoice, setDepositChoice] = useState('');
  useEffect(() => { setOutputItem(''); setDestination(''); setDepositChoice(''); }, [selected]);
  if (!node) return null;
  const w = getWorld();
  const outputs = outputsOf(w, Number(selected));
  const selectedItem = outputItem !== '' && outputs.includes(Number(outputItem)) ? Number(outputItem) : outputs[0];
  const targets = Object.values(nodes).filter((n) => n.id !== node.id && (inputsOf(w, n.id)?.includes(selectedItem) ?? true));
  const targetId = targets.some((n) => String(n.id) === destination) ? destination : String(targets[0]?.id ?? '');
  const cr = w.crafter.get(node.id);
  const recipe = cr?.recipe != null ? RECIPES[cr.recipe] : undefined;
  const deposits = Object.values(nodes).filter((n) => n.kind === 'resource');
  const depositId = deposits.some((n) => String(n.id) === depositChoice) ? depositChoice : String(deposits[0]?.id ?? '');
  const theoretical = recipe ? recipe.outputs[0].count * node.count * TICKS_PER_SECOND * 60 / recipe.ticks : node.kind === 'extractor' && node.source !== null ? node.count * 30 : 0;
  return <aside className="inspector" aria-label="节点详情">
    <div className="inspector-top"><span className="eyebrow">NODE {selected.padStart(3, '0')}</span><button className="icon-button" aria-label="关闭节点详情" onClick={onClose}><Icon name="close" size={16} /></button></div>
    <h2>{node.title}</h2><p className="inspector-subtitle">{node.building} {node.kind !== 'storage' && node.kind !== 'resource' && `× ${node.count}`} </p>
    <div className="inspector-state"><span className={`status-dot ${node.state}`} />{node.statusLabel}</div>
    {node.kind !== 'storage' && node.kind !== 'resource' && <div className="detail-stats"><div><small>实际产出 / 分钟</small><strong>{node.perMinute}</strong></div><div><small>理论产出 / 分钟</small><strong>{Math.round(theoretical)}</strong></div></div>}
    {node.kind === 'crafter' && <><RecipePicker node={node} detail /><p className="mining-help">切换目标会退回未完成生产的原料。剩余物料保留在输出区，可送入仓库。</p></>}
    {node.kind === 'resource' && <><div className="inspector-reserve">矿脉剩余储量<strong>{node.reserve?.toLocaleString('zh-CN')}</strong></div><p className="mining-help">矿脉不直接输出物品。把采矿机拖到矿脉任意空闲边缘，松开后开始开采。移动矿脉时，已吸附的采矿机会一起移动。</p></>}
    {node.kind === 'extractor' && <div className="connection-form"><h3>开采矿脉</h3><p className="mining-help">拖到矿脉边缘吸附，拖离即停止开采。也可选择矿脉，将设备移到旁边。</p><label>目标矿脉<select value={depositId} onChange={(e) => setDepositChoice(e.target.value)}>{deposits.length === 0 && <option value="">请先添加矿脉</option>}{deposits.map((n) => <option key={n.id} value={n.id}>#{n.id} {n.title} · {n.reserve?.toLocaleString('zh-CN')}</option>)}</select></label><button className="secondary-button" disabled={!depositId} onClick={() => onDock(node.id, Number(depositId))}><Icon name="mine" size={14} />移到矿旁</button></div>}
    {recipe && <div className="recipe-detail"><span className="eyebrow">单次配方 · {recipe.ticks / TICKS_PER_SECOND} 秒</span><p>{recipe.inputs.map((i) => `${itemName(i.item)} × ${i.count}`).join(' + ')}</p><Icon name="arrow" size={14} /><p>{recipe.outputs.map((o) => `${itemName(o.item)} × ${o.count}`).join(' + ')}</p></div>}
    {outputs.length > 0 && <div className="connection-form"><h3>连接下游</h3><label>输出物品<select value={selectedItem} onChange={(e) => setOutputItem(e.target.value)}>{outputs.map((i) => <option key={i} value={i}>{itemName(i)}</option>)}</select></label><label>接收设施<select value={targetId} onChange={(e) => setDestination(e.target.value)}>{targets.length === 0 && <option value="">暂无可接收的设施</option>}{targets.map((n) => <option key={n.id} value={n.id}>#{n.id} {n.title}</option>)}</select></label><button className="secondary-button" disabled={!targetId} onClick={() => { const link = addLink(w, node.id, Number(targetId), selectedItem); publish(); onMessage(link === null ? '这两个设施之间已有该物品的连线。' : '已连接，物品将自动运往下游。'); }}><Icon name="plus" size={14} />建立连接</button></div>}
    <button className="delete-button" onClick={() => { w.destroy(node.id); publish(); onClose(); onMessage(`已移除${node.title}及其连线。`); }}><Icon name="trash" size={15} />{node.kind === 'resource' ? '移除矿脉' : '移除设施'}</button>
  </aside>;
}

function Workspace() {
  const [nodes, setNodes] = useState(graphNodes);
  const [edges, setEdges] = useState(graphEdges);
  const [selected, setSelected] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [fitRequested, setFitRequested] = useState(false);
  const [dockHint, setDockHint] = useState<{ miner: number; dock: MiningDock } | null>(null);
  const structure = useGame((s) => s.structure);
  const { screenToFlowPosition, fitView, getNodes } = useReactFlow<FactoryFlowNode>();
  const getSizes = useCallback(() => new Map(getNodes().map((n) => [Number(n.id), { width: n.measured?.width ?? 224, height: n.measured?.height ?? (getWorld().resource.has(Number(n.id)) ? 196 : 260) }])), [getNodes]);
  const canvas = useRef<HTMLDivElement>(null);
  const placement = useRef(0);

  useEffect(() => startLoop(), []);
  useEffect(() => {
    setNodes((previous) => graphNodes().map((n) => ({ ...previous.find((p) => p.id === n.id), ...n })));
    setEdges((previous) => graphEdges().map((e) => ({ ...e, selected: previous.find((p) => p.id === e.id)?.selected })));
    setSelected((id) => id && getWorld().isNode(Number(id)) ? id : null);
  }, [structure]);
  useEffect(() => {
    if (!fitRequested) return;
    const timer = window.setTimeout(() => { void fitView({ padding: 0.18, duration: 250 }); setFitRequested(false); }, 100);
    return () => window.clearTimeout(timer);
  }, [fitRequested, fitView, nodes.length]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const onNodesChange = useCallback((changes: NodeChange<FactoryFlowNode>[]) => {
    const w = getWorld();
    const before = w.structureVersion;
    for (const change of changes) {
      if (change.type === 'position' && change.position) moveNode(w, Number(change.id), change.position);
      if (change.type === 'remove') w.destroy(Number(change.id));
    }
    setNodes((current) => applyNodeChanges(changes, current).map((n) => ({ ...n, position: { ...(w.position.get(Number(n.id)) ?? n.position) } })));
    if (w.structureVersion !== before) publish();
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
    for (const change of changes) if (change.type === 'remove') getWorld().destroy(Number(change.id));
    if (changes.some((c) => c.type === 'remove')) publish();
  }, []);
  const onConnect = useCallback((connection: Connection) => {
    const item = Number(connection.sourceHandle?.replace('out-', ''));
    if (connection.targetHandle !== 'storage-in' && connection.targetHandle !== `in-${item}`) { setMessage('请连接同一种物品的输出与输入。'); return; }
    const id = addLink(getWorld(), Number(connection.source), Number(connection.target), item);
    publish();
    if (id === null) setMessage('无法建立连线：请检查设施，或移除已有的重复连线。');
  }, []);
  const build = (choice: BuildChoice) => {
    const bounds = canvas.current!.getBoundingClientRect();
    const offset = (placement.current++ % 5) * 28;
    const position = screenToFlowPosition({ x: bounds.left + bounds.width / 2 - 100 + offset, y: bounds.top + bounds.height / 2 - 100 + offset });
    const w = getWorld();
    const id = choice.kind === 'resource' ? addResource(w, position, choice.item) : choice.kind === 'extractor' ? addExtractor(w, position) : choice.kind === 'crafter' ? addCrafter(w, position, choice.building) : addStorage(w, position);
    publish();
    setSelected(String(id));
    setLibraryOpen(false);
    setMessage(`已添加${choice.name}，可拖动调整位置。`);
  };
  const attachMiner = (miner: number, resource: number) => {
    const w = getWorld();
    const dock = findMiningDock(w, miner, getSizes(), resource);
    if (!dock) { setMessage('矿脉边缘已被占满，可增加现有采矿机的台数。'); return; }
    dockExtractor(w, miner, dock);
    publish();
    setMessage(`采矿机已吸附到 ${itemName(w.resource.get(resource)!.item)} #${resource}。`);
  };
  const onNodeDrag = useCallback((_: unknown, node: FactoryFlowNode) => {
    const w = getWorld();
    if (!w.extractor.has(Number(node.id))) return;
    moveNode(w, Number(node.id), node.position);
    const dock = findMiningDock(w, Number(node.id), getSizes());
    setDockHint(dock ? { miner: Number(node.id), dock } : null);
  }, [getSizes]);
  const onNodeDragStop = useCallback((_: unknown, node: FactoryFlowNode) => {
    const w = getWorld();
    moveNode(w, Number(node.id), node.position);
    if (w.extractor.has(Number(node.id))) {
      const dock = findMiningDock(w, Number(node.id), getSizes());
      if (dock) {
        dockExtractor(w, Number(node.id), dock);
        setMessage(`已吸附到 ${itemName(w.resource.get(dock.resource)!.item)}，开始开采。`);
      }
    }
    setDockHint(null);
    publish();
  }, [getSizes]);
  const addExample = () => {
    const w = getWorld();
    const right = w.position.size === 0 ? 0 : Math.max(...[...w.position.values()].map((p) => p.x)) + 400;
    buildBlueMatrixModule(w, { x: right, y: 0 });
    publish();
    setFitRequested(true);
    setMessage('已添加完整蓝矩阵产线，稳定产量为 120 个 / 分钟。');
  };
  return <div className="app-shell">
    <Header onMessage={setMessage} />
    <main className={`workspace ${libraryOpen ? 'library-open' : ''}`}>
      <Library onBuild={build} onClose={() => setLibraryOpen(false)} />
      <section className="canvas-section" aria-label="工厂画布" ref={canvas}>
        <button className="secondary-button mobile-build canvas-build" onClick={() => setLibraryOpen(true)}><Icon name="menu" size={15} />建造</button>
        <ReactFlow<FactoryFlowNode> nodes={dockHint ? nodes.map((n) => ({ ...n, data: { docking: Number(n.id) === dockHint.dock.resource, dockLabel: Number(n.id) === dockHint.miner ? itemName(getWorld().resource.get(dockHint.dock.resource)!.item) : undefined } })) : nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop} onNodeClick={(_, node) => setSelected(node.id)} onPaneClick={() => setSelected(null)} fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.2} maxZoom={1.8} snapToGrid snapGrid={[20, 20]} onlyRenderVisibleElements deleteKeyCode={['Backspace', 'Delete']} colorMode="dark">
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--grid-dot)" />
          <Controls showInteractive={false} />
          <MiniMap nodeColor={(n) => getWorld().storage.has(Number(n.id)) ? '#a89bea' : getWorld().resource.has(Number(n.id)) ? '#73b4ce' : '#5d8ff5'} maskColor="rgba(7, 14, 24, 0.8)" pannable zoomable />
        </ReactFlow>
        {nodes.length === 0 && <div className="empty-canvas"><Icon name="factory" size={36} /><h2>第一座工厂，从这里开始</h2><p>先添加矿脉和采矿机，或载入一条完整示例。</p><button className="primary-button" onClick={addExample}>添加蓝矩阵示例<Icon name="arrow" size={16} /></button></div>}
        {selected && <Inspector selected={selected} onClose={() => setSelected(null)} onMessage={setMessage} onDock={attachMiner} />}
        <div className="canvas-footer"><span>拖动空白处平移<span className="hint-divider">·</span>滚轮缩放<span className="hint-divider">·</span>选中后 Delete 删除</span><div className="flow-legend"><span><i className="legend-ok" />正常</span><span><i className="legend-short" />不足</span><span><i className="legend-cut" />断供</span><span><i className="legend-idle" />待机 / 堵塞</span></div></div>
        <div className={`toast ${message ? 'visible' : ''}`} role="status">{message && <><Icon name="check" size={16} />{message}</>}</div>
      </section>
    </main>
  </div>;
}

export function App() {
  return <ReactFlowProvider><Workspace /></ReactFlowProvider>;
}
