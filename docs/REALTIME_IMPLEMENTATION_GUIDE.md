# Real-time Kubernetes Resource Monitoring Implementation Guide

## Overview

This guide covers implementing real-time monitoring of Kubernetes resources in the Pertisk Kube Dashboard.

## Technology Comparison

### 1. **WebSocket** ⭐ **RECOMMENDED**
**Pros:**
- ✅ Bidirectional communication
- ✅ Standard web technology (RFC 6455)
- ✅ Wide browser support
- ✅ Easy to implement in Rust (tokio-tungstenite, axum support)
- ✅ Automatic reconnection handling
- ✅ Lower overhead than HTTP polling

**Cons:**
- ❌ Slightly more complex than SSE
- ❌ Requires connection management

**Best for:** Two-way communication, multiple resource types, custom queries

### 2. **Server-Sent Events (SSE)**
**Pros:**
- ✅ Simpler than WebSocket
- ✅ Built-in reconnection
- ✅ HTTP-based (easier with proxies)
- ✅ Native browser API (EventSource)

**Cons:**
- ❌ One-way (server to client only)
- ❌ Limited browser connection pool (6 per domain)
- ❌ Text-based only

**Best for:** Simple one-way streaming, logs, events

### 3. **gRPC Streaming**
**Pros:**
- ✅ High performance (HTTP/2)
- ✅ Bidirectional streams
- ✅ Strong typing with Protocol Buffers

**Cons:**
- ❌ Requires grpc-web for browsers
- ❌ More complex setup
- ❌ Limited browser support without proxy

**Best for:** Microservices, high-throughput scenarios

---

## Recommended Approach: WebSocket

For this application, **WebSocket** is the best choice because:
1. Real-time bidirectional communication is needed
2. Users can subscribe/unsubscribe to different resources
3. Excellent Rust ecosystem support (axum-tungstenite)
4. Native browser support without additional libraries

---

## Implementation Plan

### Architecture

```
┌──────────────┐         WebSocket          ┌──────────────┐         Watch API        ┌──────────────┐
│   Browser    │ ◄─────────────────────────► │   Backend    │ ◄──────────────────────► │  Kubernetes  │
│   (React)    │                              │   (Rust)     │                          │     API      │
└──────────────┘                              └──────────────┘                          └──────────────┘
      │                                               │
      │                                               │
      ├─ Connect /ws                                  ├─ Watch Pods
      ├─ Subscribe to resources                      ├─ Watch Deployments
      ├─ Receive updates                             ├─ Watch Services
      └─ Unsubscribe/Disconnect                      └─ Send events to clients
```

---

## Backend Implementation (Rust)

### 1. Add Dependencies to `backend/Cargo.toml`

```toml
[dependencies]
# Existing dependencies...
axum = { version = "0.7", features = ["ws"] }
tokio-tungstenite = "0.21"
futures-util = "0.3"
tokio = { version = "1", features = ["full"] }
dashmap = "5.5"  # Thread-safe HashMap for connection management
```

### 2. WebSocket Message Protocol

Create `backend/src/ws_messages.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Subscribe { resource: ResourceType, namespace: Option<String> },
    Unsubscribe { resource: ResourceType },
    Ping,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    ResourceUpdate { resource: ResourceType, action: WatchAction, data: serde_json::Value },
    Error { message: String },
    Subscribed { resource: ResourceType },
    Unsubscribed { resource: ResourceType },
    Pong,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum ResourceType {
    Pods,
    Deployments,
    Services,
    Nodes,
    Events,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum WatchAction {
    Added,
    Modified,
    Deleted,
    Error,
}
```

### 3. WebSocket Handler

Create `backend/src/ws_handler.rs`:

```rust
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use kube::{
    api::ListParams,
    runtime::{watcher, WatchStreamExt},
    Api, ResourceExt,
};
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{error, info, warn};

use crate::ws_messages::{ClientMessage, ResourceType, ServerMessage, WatchAction};
use crate::AppState;

// Connection ID type
type ConnectionId = String;

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    info!("New WebSocket connection");
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let connection_id = uuid::Uuid::new_v4().to_string();
    
    info!("WebSocket connection established: {}", connection_id);

    // Handle incoming messages from client
    let state_clone = state.clone();
    let handle = tokio::spawn(async move {
        while let Some(msg) = receiver.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                        handle_client_message(client_msg, &state_clone, &mut sender).await;
                    }
                }
                Ok(Message::Close(_)) => {
                    info!("WebSocket connection closed: {}", connection_id);
                    break;
                }
                Ok(Message::Ping(_)) => {
                    let _ = sender.send(Message::Pong(vec![])).await;
                }
                Err(e) => {
                    warn!("WebSocket error: {}", e);
                    break;
                }
                _ => {}
            }
        }
    });

    let _ = handle.await;
    info!("WebSocket handler completed: {}", connection_id);
}

async fn handle_client_message(
    msg: ClientMessage,
    state: &AppState,
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
) {
    match msg {
        ClientMessage::Subscribe { resource, namespace } => {
            info!("Client subscribing to {:?}", resource);
            
            // Send confirmation
            let response = ServerMessage::Subscribed { resource: resource.clone() };
            if let Ok(json) = serde_json::to_string(&response) {
                let _ = sender.send(Message::Text(json)).await;
            }

            // Start watching resource
            watch_resource(resource, namespace, state, sender).await;
        }
        ClientMessage::Unsubscribe { resource } => {
            info!("Client unsubscribing from {:?}", resource);
            let response = ServerMessage::Unsubscribed { resource };
            if let Ok(json) = serde_json::to_string(&response) {
                let _ = sender.send(Message::Text(json)).await;
            }
        }
        ClientMessage::Ping => {
            let response = ServerMessage::Pong;
            if let Ok(json) = serde_json::to_string(&response) {
                let _ = sender.send(Message::Text(json)).await;
            }
        }
    }
}

async fn watch_resource(
    resource: ResourceType,
    namespace: Option<String>,
    state: &AppState,
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
) {
    match resource {
        ResourceType::Pods => watch_pods(state, sender, namespace).await,
        ResourceType::Deployments => watch_deployments(state, sender, namespace).await,
        // Add other resource types...
        _ => {
            error!("Resource type not implemented: {:?}", resource);
        }
    }
}

async fn watch_pods(
    state: &AppState,
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    namespace: Option<String>,
) {
    use k8s_openapi::api::core::v1::Pod;

    let api: Api<Pod> = if let Some(ns) = namespace {
        Api::namespaced(state.client.clone(), &ns)
    } else {
        Api::all(state.client.clone())
    };

    let stream = watcher(api, ListParams::default()).applied_objects();
    tokio::pin!(stream);

    while let Some(event) = stream.next().await {
        match event {
            Ok(pod) => {
                // Convert pod to your PodItem struct
                let pod_data = serde_json::to_value(&pod).unwrap_or_default();
                
                let msg = ServerMessage::ResourceUpdate {
                    resource: ResourceType::Pods,
                    action: WatchAction::Modified,
                    data: pod_data,
                };

                if let Ok(json) = serde_json::to_string(&msg) {
                    if sender.send(Message::Text(json)).await.is_err() {
                        break; // Client disconnected
                    }
                }
            }
            Err(e) => {
                error!("Watch error: {}", e);
                let msg = ServerMessage::Error {
                    message: format!("Watch error: {}", e),
                };
                if let Ok(json) = serde_json::to_string(&msg) {
                    let _ = sender.send(Message::Text(json)).await;
                }
                break;
            }
        }
    }
}

async fn watch_deployments(
    state: &AppState,
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    namespace: Option<String>,
) {
    use k8s_openapi::api::apps::v1::Deployment;

    let api: Api<Deployment> = if let Some(ns) = namespace {
        Api::namespaced(state.client.clone(), &ns)
    } else {
        Api::all(state.client.clone())
    };

    let stream = watcher(api, ListParams::default()).applied_objects();
    tokio::pin!(stream);

    while let Some(event) = stream.next().await {
        match event {
            Ok(deployment) => {
                let deployment_data = serde_json::to_value(&deployment).unwrap_or_default();
                
                let msg = ServerMessage::ResourceUpdate {
                    resource: ResourceType::Deployments,
                    action: WatchAction::Modified,
                    data: deployment_data,
                };

                if let Ok(json) = serde_json::to_string(&msg) {
                    if sender.send(Message::Text(json)).await.is_err() {
                        break;
                    }
                }
            }
            Err(e) => {
                error!("Watch error: {}", e);
                break;
            }
        }
    }
}
```

### 4. Update `main.rs`

```rust
mod ws_handler;
mod ws_messages;

// In your router setup:
let app = Router::new()
    .nest("/api", api)
    .route("/ws", get(ws_handler::ws_handler))  // Add WebSocket endpoint
    .nest_service("/assets", ServeDir::new(assets_dir))
    // ... rest of routes
    .with_state(state)
    .layer(cors);
```

---

## Frontend Implementation (React/TypeScript)

### 1. Create WebSocket Hook

Create `frontend/src/hooks/useWebSocket.ts`:

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';

export type ResourceType = 'pods' | 'deployments' | 'services' | 'nodes' | 'events';

export type WatchAction = 'ADDED' | 'MODIFIED' | 'DELETED' | 'ERROR';

export interface ResourceUpdate<T = any> {
  type: 'resource_update';
  resource: ResourceType;
  action: WatchAction;
  data: T;
}

export interface ServerMessage {
  type: 'resource_update' | 'error' | 'subscribed' | 'unsubscribed' | 'pong';
  resource?: ResourceType;
  action?: WatchAction;
  data?: any;
  message?: string;
}

export interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping';
  resource?: ResourceType;
  namespace?: string;
}

interface UseWebSocketOptions {
  onMessage?: (message: ServerMessage) => void;
  onError?: (error: Event) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const {
    onMessage,
    onError,
    onConnect,
    onDisconnect,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const subscribedResourcesRef = useRef<Set<ResourceType>>(new Set());

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setReconnectAttempts(0);
      onConnect?.();

      // Re-subscribe to previously subscribed resources
      subscribedResourcesRef.current.forEach((resource) => {
        ws.send(JSON.stringify({ type: 'subscribe', resource }));
      });
    };

    ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        onMessage?.(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      onError?.(error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      onDisconnect?.();
      wsRef.current = null;

      // Attempt reconnection
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts((prev) => prev + 1);
          connect();
        }, reconnectInterval);
      }
    };

    wsRef.current = ws;
  }, [reconnectAttempts, maxReconnectAttempts, reconnectInterval, onConnect, onDisconnect, onMessage, onError]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const subscribe = useCallback((resource: ResourceType, namespace?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message: ClientMessage = { type: 'subscribe', resource, namespace };
      wsRef.current.send(JSON.stringify(message));
      subscribedResourcesRef.current.add(resource);
    }
  }, []);

  const unsubscribe = useCallback((resource: ResourceType) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message: ClientMessage = { type: 'unsubscribe', resource };
      wsRef.current.send(JSON.stringify(message));
      subscribedResourcesRef.current.delete(resource);
    }
  }, []);

  const sendMessage = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return {
    isConnected,
    subscribe,
    unsubscribe,
    sendMessage,
    reconnectAttempts,
  };
};
```

### 2. Create Resource Subscription Hook

Create `frontend/src/hooks/useRealtimeResource.ts`:

```typescript
import { useEffect, useState, useCallback } from 'react';
import { useWebSocket, ResourceType, WatchAction } from './useWebSocket';

export const useRealtimeResource = <T>(
  resource: ResourceType,
  namespace?: string
) => {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const handleMessage = useCallback((message: any) => {
    if (message.type === 'resource_update' && message.resource === resource) {
      const { action, data: resourceData } = message;

      setData((prevData) => {
        switch (action) {
          case 'ADDED':
            return [...prevData, resourceData as T];
          
          case 'MODIFIED':
            return prevData.map((item: any) =>
              item.name === resourceData.name && item.namespace === resourceData.namespace
                ? resourceData
                : item
            );
          
          case 'DELETED':
            return prevData.filter((item: any) =>
              !(item.name === resourceData.name && item.namespace === resourceData.namespace)
            );
          
          default:
            return prevData;
        }
      });
    }

    if (message.type === 'subscribed') {
      setIsLoading(false);
    }
  }, [resource]);

  const { isConnected, subscribe, unsubscribe } = useWebSocket({
    onMessage: handleMessage,
  });

  useEffect(() => {
    if (isConnected) {
      subscribe(resource, namespace);
    }

    return () => {
      if (isConnected) {
        unsubscribe(resource);
      }
    };
  }, [isConnected, resource, namespace, subscribe, unsubscribe]);

  return { data, isLoading, isConnected };
};
```

### 3. Use in Components

Update `frontend/src/pages/PodsPage.tsx`:

```typescript
import { useRealtimeResource } from '../hooks/useRealtimeResource';
import type { Pod } from '../types';

export const PodsPage = () => {
  // Option 1: Use real-time data
  const { data: realtimeData, isLoading: realtimeLoading, isConnected } = useRealtimeResource<Pod>('pods');
  
  // Option 2: Use REST API (existing)
  const { data: restData, isLoading: restLoading } = usePods();
  
  // Choose which data source to use
  const useRealtime = true; // Make this configurable
  const data = useRealtime ? realtimeData : restData;
  const isLoading = useRealtime ? realtimeLoading : restLoading;

  // Show connection status
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text">Pods</h1>
          <p className="text-text-secondary mt-1">View all pods in the cluster</p>
        </div>
        {useRealtime && (
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-text-secondary">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        // ... rest of props
      />
    </div>
  );
};
```

---

## Performance Considerations

### 1. Rate Limiting
Implement rate limiting to prevent overwhelming clients:

```rust
use tokio::time::{interval, Duration};

// In watch function
let mut rate_limiter = interval(Duration::from_millis(100));

while let Some(event) = stream.next().await {
    rate_limiter.tick().await;
    // Process event...
}
```

### 2. Batching
Batch multiple updates before sending:

```rust
let mut buffer = Vec::new();
let mut flush_timer = interval(Duration::from_millis(500));

loop {
    tokio::select! {
        Some(event) = stream.next() => {
            buffer.push(event);
            if buffer.len() >= 10 {
                send_batch(&mut sender, &buffer).await;
                buffer.clear();
            }
        }
        _ = flush_timer.tick() => {
            if !buffer.is_empty() {
                send_batch(&mut sender, &buffer).await;
                buffer.clear();
            }
        }
    }
}
```

### 3. Filtering
Filter on server-side to reduce data transfer:

```rust
// Only send updates for specific namespaces
if let Some(ns) = &namespace {
    if pod.namespace() != ns {
        continue;
    }
}
```

---

## Testing

### Backend Testing
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_ws_connection() {
        // Test WebSocket connection
    }

    #[tokio::test]
    async fn test_subscribe_unsubscribe() {
        // Test subscription lifecycle
    }
}
```

### Frontend Testing
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { useWebSocket } from './useWebSocket';

describe('useWebSocket', () => {
  it('should connect and subscribe', async () => {
    const { result } = renderHook(() => useWebSocket());
    
    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
  });
});
```

---

## Deployment Considerations

### 1. Load Balancing
Ensure sticky sessions for WebSocket connections:

```yaml
# nginx ingress
nginx.ingress.kubernetes.io/affinity: "cookie"
nginx.ingress.kubernetes.io/session-cookie-name: "route"
```

### 2. Connection Limits
Configure appropriate limits:

```rust
// Limit connections per client
const MAX_CONNECTIONS_PER_IP: usize = 10;

// Implement connection tracking
```

### 3. Health Checks
Update health check to include WebSocket status:

```rust
async fn readiness(State(state): State<AppState>) -> impl IntoResponse {
    // Check K8s API and WebSocket capacity
}
```

---

## Alternative: Server-Sent Events (Simpler Implementation)

If you prefer a simpler approach:

```rust
use axum::response::sse::{Event, Sse};
use futures_util::stream::{self, Stream};

async fn sse_handler(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let stream = watch_pods_stream(state);
    Sse::new(stream).keep_alive(KeepAlive::default())
}
```

Frontend:
```typescript
const eventSource = new EventSource('/api/stream/pods');
eventSource.onmessage = (event) => {
  const update = JSON.parse(event.data);
  // Handle update
};
```

---

## Conclusion

**Recommended Implementation Order:**

1. ✅ **Phase 1**: Implement WebSocket endpoint with Pods only
2. ✅ **Phase 2**: Add frontend hook and test with Pods page
3. ✅ **Phase 3**: Extend to other resources (Deployments, Services)
4. ✅ **Phase 4**: Add performance optimizations (batching, filtering)
5. ✅ **Phase 5**: Add connection management UI

**Start with WebSocket** for the most flexible and performant solution!
