import { Link } from 'react-router-dom';
import { Card } from '../components/Card';

const accessControlSections = [
  { title: 'Service Accounts', path: '/access-control/serviceaccounts', description: 'Service accounts, secrets, and token automount settings' },
  { title: 'Cluster Roles', path: '/access-control/clusterroles', description: 'Cluster-wide RBAC roles with policy rules' },
  { title: 'Roles', path: '/access-control/roles', description: 'Namespace-scoped RBAC roles with policy rules' },
  { title: 'Cluster Role Bindings', path: '/access-control/clusterrolebindings', description: 'Cluster-wide bindings connecting roles to subjects' },
  { title: 'Role Bindings', path: '/access-control/rolebindings', description: 'Namespace-scoped bindings connecting roles to subjects' },
];

export const AccessControlPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Access Control</h1>
        <p className="text-text-secondary mt-1">Explore all RBAC and authentication resources.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accessControlSections.map((section) => (
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
