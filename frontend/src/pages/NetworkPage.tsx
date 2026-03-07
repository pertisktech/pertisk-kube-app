import { Link } from 'react-router-dom';
import { Card } from '../components/Card';

const networkSections = [
  { title: 'Services', path: '/network/services', description: 'Service types, ports, and cluster/external IPs' },
  { title: 'Endpoints', path: '/network/endpoints', description: 'Ready and not-ready endpoint addresses' },
  { title: 'Ingresses', path: '/network/ingresses', description: 'Hosts, addresses, classes, and routing rules' },
  { title: 'Ingress Classes', path: '/network/ingressclasses', description: 'Controller mappings and defaults' },
  { title: 'Network Policies', path: '/network/networkpolicies', description: 'Ingress/egress network policy coverage' },
  { title: 'Port Forwarding', path: '/network/portforwarding', description: 'Quick kubectl port-forward command suggestions' },
];

export const NetworkPage = () => {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Network <span className="text-base font-normal text-text-secondary">(Explore all network-related Kubernetes resources.)</span></h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {networkSections.map((section) => (
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
