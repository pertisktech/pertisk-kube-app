import { Link } from 'react-router-dom';
import { Card } from '../components/Card';

const storageSections = [
  { title: 'Persistent Volume Claims', path: '/storage/pvc', description: 'PVC status, bound volumes, capacity, and storage classes' },
  { title: 'Persistent Volumes', path: '/storage/pv', description: 'PV capacity, access modes, reclaim policies, and claim bindings' },
  { title: 'Storage Classes', path: '/storage/storageclasses', description: 'Provisioners, reclaim policies, default classes, volume expansion' },
];

export const StoragePage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text">Storage <span className="text-base font-normal text-text-secondary">(Explore all storage-related Kubernetes resources.)</span></h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {storageSections.map((section) => (
          <Card key={section.path} title={section.title}>
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">{section.description}</p>
              <Link
                to={section.path}
                className="inline-block text-sm font-medium text-primary hover:underline"
              >
                Open {section.title}
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
