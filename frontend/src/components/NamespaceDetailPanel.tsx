import { Pencil, Trash2 } from './Icons';
import type { Namespace } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem } from './drawer';

interface NamespaceDetailPanelProps {
  namespace: Namespace;
  onClose: () => void;
  getStatusClass: (phase: string) => string;
  onOpenYamlEditor?: (namespace: Namespace) => void;
  onDelete?: (name: string) => Promise<void>;
}

export const NamespaceDetailPanel = ({ namespace, onClose, getStatusClass, onOpenYamlEditor, onDelete }: NamespaceDetailPanelProps) => {
  const labelItems = namespace.labels && namespace.labels !== '-'
    ? namespace.labels.split(',').map((item) => item.trim()).filter(Boolean)
    : [];

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
      <DrawerItem name="Name">{namespace.name}</DrawerItem>
      <DrawerItem name="Status">
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getStatusClass(namespace.phase)}`}>{namespace.phase}</span>
      </DrawerItem>
      <DrawerItem name="Age">{timeAgo(namespace.age)}</DrawerItem>
      <DrawerItem name="Labels" labelsOnly>
        {labelItems.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {labelItems.map((label) => (
              <span key={label} className="inline-flex px-2 py-0.5 rounded text-xs border border-border" style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}>{label}</span>
            ))}
          </div>
        ) : (
          '—'
        )}
      </DrawerItem>
    </ResourceDetailPanelLayout>
  );
};
