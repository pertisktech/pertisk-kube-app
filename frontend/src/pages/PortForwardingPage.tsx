import { Card } from '../components/Card';

export const PortForwardingPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Port Forwarding</h1>
        <p className="text-text-secondary mt-1">Create and manage kubectl port-forward sessions.</p>
      </div>

      <Card title="Port Forward Sessions">
        <div className="space-y-3 text-sm text-text-secondary">
          <p>Port-forward session management is not connected in this web backend yet.</p>
          <p>Use kubectl directly for now:</p>
          <p className="font-mono text-text">kubectl -n &lt;namespace&gt; port-forward svc/&lt;service&gt; 8080:80</p>
          <p className="font-mono text-text">kubectl -n &lt;namespace&gt; port-forward pod/&lt;pod&gt; 8080:8080</p>
        </div>
      </Card>
    </div>
  );
};
