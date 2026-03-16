import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
  Panel,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  Boxes,
  Briefcase,
  Cpu,
  Database,
  Globe,
  Maximize2,
  Minimize2,
  Monitor,
  Network,
  X,
} from '../components/Icons';
import type { IconComponent } from '../components/Icons';
import { useNamespace } from '../context/NamespaceContext';
import { useResourceMap } from '../hooks/useKubernetes';
import type { ResourceMapNode as ApiNode, ResourceMapEdge as ApiEdge } from '../types';
import { cn } from '../utils';

// ── Resource kind configuration ───────────────────────────────────────────────
interface KindConfig {
  color: string;
  bg: string;
  border: string;
  icon: IconComponent;
  navPath?: string;
}

const KIND_CONFIG: Record<string, KindConfig> = {
  Pod: {
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    icon: Cpu,
    navPath: '/pods',
  },
  Deployment: {
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    icon: Archive,
    navPath: '/deployments',
  },
  ReplicaSet: {
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/30',
    icon: Boxes,
    navPath: '/replicasets',
  },
  StatefulSet: {
    color: 'text-teal-400',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/30',
    icon: Database,
    navPath: '/statefulsets',
  },
  DaemonSet: {
    color: 'text-pink-400',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/30',
    icon: Monitor,
    navPath: '/daemonsets',
  },
  Job: {
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: Briefcase,
    navPath: '/jobs',
  },
  Service: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    icon: Network,
    navPath: '/network/services',
  },
  Ingress: {
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    icon: Globe,
    navPath: '/network/ingresses',
  },
};

const STATUS_DOT: Record<string, string> = {
  Running: 'bg-emerald-400',
  ready: 'bg-emerald-400',
  active: 'bg-emerald-400',
  completed: 'bg-sky-400',
  Succeeded: 'bg-sky-400',
  running: 'bg-emerald-400',
  degraded: 'bg-red-400',
  failed: 'bg-red-400',
  Failed: 'bg-red-400',
  Pending: 'bg-amber-400',
  pending: 'bg-amber-400',
};

// MiniMap node colors
const MINIMAP_COLOR: Record<string, string> = {
  Pod: '#3b82f6',
  Deployment: '#a855f7',
  ReplicaSet: '#6366f1',
  StatefulSet: '#14b8a6',
  DaemonSet: '#ec4899',
  Job: '#f59e0b',
  Service: '#22c55e',
  Ingress: '#f97316',
};

// ── Column layout ─────────────────────────────────────────────────────────────
const KIND_COL: Record<string, number> = {
  Ingress: 0,
  Service: 1,
  Deployment: 2,
  StatefulSet: 2,
  DaemonSet: 2,
  Job: 2,
  ReplicaSet: 3,
  Pod: 4,
};

const NODE_WIDTH = 192;
const COL_GAP = 272;
const ROW_GAP = 86;

function computeLayout(apiNodes: ApiNode[], apiEdges: ApiEdge[]) {
  const colNodes: Record<number, ApiNode[]> = {};
  for (const n of apiNodes) {
    const col = KIND_COL[n.kind] ?? 5;
    if (!colNodes[col]) colNodes[col] = [];
    colNodes[col].push(n);
  }

  // Sort within each column: namespace first, then name
  for (const col in colNodes) {
    colNodes[col].sort((a, b) => {
      const nsA = a.namespace ?? '';
      const nsB = b.namespace ?? '';
      return nsA !== nsB ? nsA.localeCompare(nsB) : a.name.localeCompare(b.name);
    });
  }

  const posMap: Record<string, { x: number; y: number }> = {};
  for (const [colStr, nodes] of Object.entries(colNodes)) {
    const col = Number(colStr);
    nodes.forEach((n, i) => {
      posMap[n.id] = { x: col * COL_GAP, y: i * ROW_GAP };
    });
  }

  const rfNodes: Node[] = apiNodes.map((n) => ({
    id: n.id,
    type: 'resourceNode',
    position: posMap[n.id] ?? { x: 0, y: 0 },
    data: n as unknown as Record<string, unknown>,
  }));

  const rfEdges: Edge[] = apiEdges.map((e) => {
    const isSelects = e.edge_type === 'selects';
    const isRoutes = e.edge_type === 'routes';
    return {
      id: `${e.source}--${e.target}`,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: isSelects,
      style: {
        stroke: isSelects ? '#22c55e' : isRoutes ? '#f59e0b' : 'var(--color-border)',
        strokeDasharray: isRoutes ? '5 3' : undefined,
        strokeWidth: 1.5,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isSelects ? '#22c55e' : isRoutes ? '#f59e0b' : 'var(--color-border)',
        width: 14,
        height: 14,
      },
    };
  });

  return { rfNodes, rfEdges };
}

// ── Custom node component ─────────────────────────────────────────────────────
const ResourceNode = memo(({ data, selected }: NodeProps) => {
  const node = data as unknown as ApiNode;
  const config = KIND_CONFIG[node.kind] ?? KIND_CONFIG['Pod'];
  const Icon = config.icon;
  const dotColor = STATUS_DOT[node.status] ?? 'bg-neutral-400';

  return (
    <div
      className={cn(
        'rounded-lg border bg-[var(--color-surface)] shadow-sm px-3 py-2.5 flex items-center gap-2.5 transition-shadow',
        config.border,
        selected && 'ring-2 ring-[var(--color-primary)] ring-offset-0 shadow-md',
      )}
      style={{ width: NODE_WIDTH }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: 'transparent', border: 'none', width: 6, height: 6 }}
      />
      <div className={cn('p-1.5 rounded-md shrink-0', config.bg)}>
        <Icon size={13} className={config.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className={cn('text-[9px] font-bold uppercase tracking-wide leading-none', config.color)}
          >
            {node.kind}
          </span>
          <div
            className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColor)}
            title={node.status}
          />
        </div>
        <div className="text-[11px] font-semibold text-[var(--color-text)] truncate leading-tight">
          {node.name}
        </div>
        {node.namespace && (
          <div className="text-[9px] text-[var(--color-text-secondary)] truncate leading-none mt-0.5">
            {node.namespace}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: 'transparent', border: 'none', width: 6, height: 6 }}
      />
    </div>
  );
});
ResourceNode.displayName = 'ResourceNode';

const nodeTypes = { resourceNode: ResourceNode };

// ── Detail drawer ─────────────────────────────────────────────────────────────
interface DetailDrawerProps {
  node: ApiNode;
  onClose: () => void;
}

const DetailDrawer = ({ node, onClose }: DetailDrawerProps) => {
  const navigate = useNavigate();
  const config = KIND_CONFIG[node.kind] ?? KIND_CONFIG['Pod'];
  const Icon = config.icon;
  const dotColor = STATUS_DOT[node.status] ?? 'bg-neutral-400';

  return (
    <div className="w-60 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={cn('p-1.5 rounded-md', config.bg)}>
            <Icon size={14} className={config.color} />
          </div>
          <span className={cn('text-[10px] font-bold uppercase tracking-wide', config.color)}>
            {node.kind}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)] transition-colors"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      <div>
        <div className="text-[10px] text-[var(--color-text-secondary)] mb-0.5">Name</div>
        <div className="text-[12px] font-semibold text-[var(--color-text)] break-all">
          {node.name}
        </div>
      </div>

      {node.namespace && (
        <div>
          <div className="text-[10px] text-[var(--color-text-secondary)] mb-0.5">Namespace</div>
          <div className="text-[12px] text-[var(--color-text)]">{node.namespace}</div>
        </div>
      )}

      <div>
        <div className="text-[10px] text-[var(--color-text-secondary)] mb-0.5">Status</div>
        <div className="flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full shrink-0', dotColor)} />
          <span className="text-[12px] text-[var(--color-text)] capitalize">{node.status}</span>
        </div>
      </div>

      {config.navPath && (
        <button
          onClick={() => navigate(config.navPath!)}
          className="w-full text-[11px] px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)] transition-colors text-left"
        >
          View all {node.kind}s →
        </button>
      )}
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
export const ResourceMapPage = () => {
  const { selectedNamespaces } = useNamespace();
  const nsParam = selectedNamespaces.join(',');
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading, error, refetch } = useResourceMap(nsParam);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<ApiNode | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { rfNodes, rfEdges } = useMemo(() => {
    if (!data) return { rfNodes: [], rfEdges: [] };
    return computeLayout(data.nodes, data.edges);
  }, [data]);

  useEffect(() => {
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [rfNodes, rfEdges, setNodes, setEdges]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node.data as unknown as ApiNode);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;

    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
        return;
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }

      if ('requestFullscreen' in el) {
        await el.requestFullscreen();
        return;
      }

      // Safari fallback
      const safariEl = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
      if (typeof safariEl.webkitRequestFullscreen === 'function') {
        await safariEl.webkitRequestFullscreen();
      }
    } catch {
      // Ignore fullscreen errors; user gesture or browser policy may block it.
    }
  }, []);

  // Kind counts for the stats bar
  const stats = useMemo(() => {
    if (!data) return [];
    const map: Record<string, number> = {};
    data.nodes.forEach((n) => {
      map[n.kind] = (map[n.kind] ?? 0) + 1;
    });
    const order = Object.keys(KIND_CONFIG);
    return Object.entries(map).sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
    );
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--color-text-secondary)]">
        <span className="text-sm">Loading resource map…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-red-400">Failed to load resource map.</p>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 text-xs rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-hover)]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[var(--color-text-secondary)] gap-2">
        <p className="text-sm font-medium">No resources found</p>
        <p className="text-xs text-center max-w-xs">
          {selectedNamespaces.length === 0
            ? 'Select a namespace from the header filter to visualize resource relationships.'
            : 'No resources with relationships found in the selected namespace(s).'}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative', isFullscreen ? 'm-0' : '-m-4')}
      style={{ height: isFullscreen ? '100vh' : 'calc(100vh - 64px)' }}
    >
      <style>{`
        .resource-map-controls {
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          overflow: hidden;
        }

        .resource-map-controls .react-flow__controls-button {
          background: var(--color-surface);
          border-bottom: 1px solid var(--color-border);
          color: var(--color-text-secondary);
        }

        .resource-map-controls .react-flow__controls-button:last-child {
          border-bottom: 0;
        }

        .resource-map-controls .react-flow__controls-button:hover {
          background: var(--color-hover);
          color: var(--color-text);
        }

        .resource-map-controls .react-flow__controls-button svg {
          fill: currentColor;
        }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelectedNode(null)}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.05}
        maxZoom={3}
        style={{ background: 'transparent' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="var(--color-border)"
        />
        <Controls
          className="resource-map-controls"
          position="bottom-right"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
          }}
        />
        <MiniMap
          position="bottom-left"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
          }}
          nodeColor={(node) => MINIMAP_COLOR[(node.data as unknown as ApiNode)?.kind] ?? '#6b7280'}
          maskColor="rgba(0,0,0,0.15)"
        />

        {/* Stats & legend panel */}
        <Panel position="top-left">
          <div className="flex flex-col gap-2">
            {/* Kind counts */}
            <div
              className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm"
              style={{ maxWidth: 480 }}
            >
              {stats.map(([kind, count]) => {
                const cfg = KIND_CONFIG[kind];
                if (!cfg) return null;
                const Icon = cfg.icon;
                return (
                  <div
                    key={kind}
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold',
                      cfg.bg,
                      cfg.color,
                    )}
                  >
                    <Icon size={10} />
                    <span>
                      {kind}: {count}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Edge legend */}
            <div className="p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
                <svg width="28" height="8">
                  <line x1="0" y1="4" x2="28" y2="4" stroke="var(--color-border)" strokeWidth="1.5" />
                  <polygon points="22,1 28,4 22,7" fill="var(--color-border)" />
                </svg>
                <span>owns (controller → workload)</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
                <svg width="28" height="8">
                  <line x1="0" y1="4" x2="28" y2="4" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4 2" />
                  <polygon points="22,1 28,4 22,7" fill="#22c55e" />
                </svg>
                <span>selects (Service → Pod)</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
                <svg width="28" height="8">
                  <line x1="0" y1="4" x2="28" y2="4" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5 3" />
                  <polygon points="22,1 28,4 22,7" fill="#f59e0b" />
                </svg>
                <span>routes (Ingress → Service)</span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel position="top-right">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] text-[11px] font-medium transition-colors shadow-sm"
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            <span>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span>
          </button>
        </Panel>
      </ReactFlow>

      {/* Node detail drawer — absolutely positioned outside ReactFlow */}
      {selectedNode && (
        <div className="absolute top-4 right-4 z-10">
          <DetailDrawer node={selectedNode} onClose={() => setSelectedNode(null)} />
        </div>
      )}
    </div>
  );
};
