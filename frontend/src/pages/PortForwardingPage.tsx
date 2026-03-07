import { Card } from '../components/Card';

export const PortForwardingPage = () => {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Port Forwarding <span className="text-base font-normal text-text-secondary">(Create and manage kubectl port-forward sessions.)</span></h1>
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
