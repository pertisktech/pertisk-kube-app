import { useNodes } from '../hooks/useKubernetes';
import { Card } from './Card';
import { Loader } from 'lucide-react';
import type { K8sNode } from '../types';

interface NodeGroupInfo {
  name: string;
  count: number;
  readyCount: number;
  roles: string[];
  color: string;
}

export const NodeGroups = () => {
  const { data: nodes, isLoading } = useNodes();

  if (isLoading) {
    return (
      <Card title="Node Groups">
        <div className="flex items-center justify-center h-32">
          <Loader size={24} className="animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  // Group nodes by roles or labels
  const nodeGroups = new Map<string, { nodes: K8sNode[]; roles: string[] }>();

  nodes?.forEach((node) => {
    const roles = node.roles?.length > 0 ? node.roles.join('-') : 'worker';
    
    if (!nodeGroups.has(roles)) {
      nodeGroups.set(roles, { nodes: [], roles: node.roles || ['worker'] });
    }
    
    const group = nodeGroups.get(roles)!;
    group.nodes.push(node);
  });

  const colorMap: { [key: string]: string } = {
    'control-plane': 'bg-dashboard-danger',
    'control-plane-worker': 'bg-dashboard-warning',
    'worker': 'bg-dashboard-success',
    'default': 'bg-dashboard-metric-primary',
  };

  const groups: NodeGroupInfo[] = Array.from(nodeGroups.entries()).map(
    ([, group]) => {
      const readyCount = group.nodes.filter((node) => {
        if (typeof node.ready === 'boolean') return node.ready;
        return String(node.ready).toLowerCase() === 'true';
      }).length;

      const colorKey = group.roles.join('-') || 'worker';
      const color = colorMap[colorKey] || colorMap['default'];

      return {
        name: group.roles.join(' + ') || 'Worker',
        count: group.nodes.length,
        readyCount,
        roles: group.roles,
        color,
      };
    }
  );

  if (groups.length === 0) {
    return (
      <Card title="Node Groups">
        <div className="text-center text-text-secondary py-8">No node groups found</div>
      </Card>
    );
  }

  return (
    <Card title="Node Groups">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map((group) => (
          <div
            key={group.name}
            className="bg-surface-elevated border border-border rounded-lg p-4"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`${group.color} w-4 h-4 rounded-full flex-shrink-0`} />
              <h3 className="font-semibold text-text">{group.name}</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Total Nodes:</span>
                <span className="font-medium text-text">{group.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Ready:</span>
                <span className="font-medium text-text">
                  {group.readyCount}/{group.count}
                </span>
              </div>
              {group.readyCount < group.count && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Not Ready:</span>
                  <span className="font-medium text-icon-danger">
                    {group.count - group.readyCount}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
