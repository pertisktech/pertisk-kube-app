import { Pencil, Trash2 } from './Icons';
import type { Namespace } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerLabelsAnnotations } from './drawer';

interface NamespaceDetailPanelProps {
  namespace: Namespace;
  onClose: () => void;
  getStatusClass: (phase: string) => string;
  onOpenYamlEditor?: (namespace: Namespace) => void;
  onDelete?: (name: string) => Promise<void>;
}

/** Parse "key1=val1,key2=val2" into Record */
function parseLabelsString(s: string): Record<string, string> {
  if (!s || s === '-') return {};
  const out: Record<string, string> = {};
  s.split(',').forEach((item) => {
    const eq = item.trim().indexOf('=');
    if (eq >= 0) {
      const k = item.trim().slice(0, eq).trim();
      const v = item.trim().slice(eq + 1).trim();
      if (k) out[k] = v;
    }
  });
  return out;
}

export const NamespaceDetailPanel = ({ namespace, onClose, getStatusClass, onOpenYamlEditor, onDelete }: NamespaceDetailPanelProps) => {
  const labels = parseLabelsString(namespace.labels);

  return (
    <ResourceDetailPanelLayout
      title={namespace.name}
      status={namespace.phase}
      keyInfo={[
        { label: 'Phase', value: namespace.phase },
        { label: 'Age', value: timeAgo(namespace.age) },
      ]}
      actions={
        <>
          <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(namespace)} />
          {onDelete && <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete(namespace.name)} />}
        </>
      }
      onClose={onClose}
    >
      <DrawerTitle>Property</DrawerTitle>
      <DrawerItem name="Name">{namespace.name}</DrawerItem>
      <DrawerItem name="Status">
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getStatusClass(namespace.phase)}`}>{namespace.phase}</span>
      </DrawerItem>
      <DrawerItem name="Age">{timeAgo(namespace.age)}</DrawerItem>
      <DrawerLabelsAnnotations labels={labels} annotations={{}} />
    </ResourceDetailPanelLayout>
  );
};
