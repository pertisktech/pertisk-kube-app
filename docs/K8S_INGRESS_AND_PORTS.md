# Kubernetes: Ingress, LoadBalancer, and Access (Web App)

How the web app is exposed when deployed to a **remote** Kubernetes cluster: by **domain** (Ingress) or by **IP:port** (LoadBalancer).

---

## Option A: LoadBalancer — access by IP and port

No domain or Ingress needed. The cluster gets an external IP; you use **http://&lt;IP&gt;:8091**.

1. **Set the service type to LoadBalancer** in `values.yaml` (or override):

   ```yaml
   app:
     service:
       type: LoadBalancer
       port: 8091
       targetPort: 8091
       grpcPort: 50051
       grpcTargetPort: 50051
   ```

2. **Deploy** (Helm/Skaffold to the remote cluster).

3. **Get the app URL** (external IP + port):

   ```bash
   make lb-url
   ```

   Or manually: `kubectl get svc -n <namespace> pertisk-kube` and use the `EXTERNAL-IP` (wait for it to be assigned). Then open:

   - **http://&lt;EXTERNAL-IP&gt;:8091** (web UI + API)
   - **&lt;EXTERNAL-IP&gt;:50051** (gRPC if needed)

So for remote cluster: **LoadBalancer = access at http://&lt;IP&gt;:8091**. Good when you don’t have a domain or don’t want to configure Ingress.

---

## Option B: Ingress — access by domain

Expose the app by **domain** (no port in the URL). Ingress uses 80/443; good when you have DNS and want HTTPS.

```
User / You  →  https://your-domain.com  (or http://your-domain.com)
                    ↓
              Ingress (nginx) on the cluster
                    ↓
              Service pertisk-kube:8091  →  Pod (your app)
```

**Steps:**

1. **Enable Ingress and set your domain** in `values.yaml` (or prod override):

   ```yaml
   ingress:
     enabled: true
     className: nginx
     hosts:
       - host: pertisk-kube.yourdomain.com
         paths:
           - path: /
             pathType: Prefix
     tls:
       - secretName: pertisk-kube-tls
         hosts:
           - pertisk-kube.yourdomain.com
   ```

2. **Deploy** (Helm/Skaffold to the remote cluster).

3. **Get the app URL** (domain(s) from the cluster):

   ```bash
   make ingress-hosts
   ```

   Use one of the printed hosts: open **https://&lt;that-host&gt;** (or http if no TLS). That is the app URL for the remote cluster. No port in the URL (Ingress uses 80/443).

So for remote deploy: **Ingress domain = app URL**. Port 8091 is only inside the cluster; Ingress maps 443 → 8091 for you.

---

## Single source of truth for the app port

The app port is defined once in `values.yaml` and used by Service and Ingress:

| Where              | Port source              | Purpose                    |
|--------------------|--------------------------|----------------------------|
| Service            | `app.service.port`       | In-cluster traffic         |
| Ingress backend    | `app.service.port`       | Domain → your app          |
| Probes (deployment)| 8091 in values           | Health/readiness           |

---

## Port-forward: local / dev only (not for remote cluster)

`kubectl port-forward` is only for **local** access when you have `kubectl` to the cluster (e.g. dev on your laptop). It does **not** replace Ingress and is **not** how you use a remote-deployed app.

- **Remote cluster:** use the Ingress URL from `make ingress-hosts` (e.g. https://pertisk-kube.yourdomain.com).
- **Local dev/debug only:** run `make port-forward` and open http://localhost:8091.

---

## Quick reference

| Scenario              | How to access |
|-----------------------|----------------|
| **Remote — LoadBalancer** | Set `app.service.type: LoadBalancer`, deploy, `make lb-url` → open **http://&lt;IP&gt;:8091**. |
| **Remote — Ingress**  | Enable Ingress, set domain, deploy, `make ingress-hosts` → open **https://&lt;domain&gt;** (no port). |
| Local dev with kubectl | `make port-forward` → http://localhost:8091. |
