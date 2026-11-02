# Hermes Outbound Webhooks & Cortex Integration

This document details the configuration and schema for streaming live Hermes agent activity into Cortex using Hermes's native outbound webhook system.

## 1. Discovery & Source Analysis

Analysis of Hermes Agent source code located on this machine at:
`C:\Users\luche\AppData\Local\hermes\hermes-agent\agent\outbound_webhooks.py`

### Delivery & Failure Mode
- **Fire-and-Forget Architecture**: Events are enqueued onto a bounded queue (`queue.Queue(maxsize=1000)`) and processed by a dedicated daemon background thread.
- **Non-Blocking**: Webhook delivery runs entirely asynchronously. If Cortex is offline, unreachable, or returns an error, the agent's main execution loop is **never blocked or delayed**.
- **Retry Policy**: Failed deliveries retry at most 2 times with a 10-second timeout before being safely dropped.

### Request Headers
- `User-Agent: Hermes-Agent-Outbound-Webhook`
- `Content-Type: application/json`
- `X-Hermes-Event: <event_name>` (e.g. `post_tool_call`, `on_session_start`)
- `X-Hermes-Delivery: <delivery_uuid>`
- `X-Hermes-Signature-256: sha256=<hex_digest>` (HMAC-SHA256 of payload body using configured `secret`)

### Payload Schema
```json
{
  "hook_event_name": "post_tool_call",
  "delivery_id": "8fa20210-ca72-4660-84a1-096a6fbb8d64",
  "timestamp": "2026-11-01T22:15:00.123456Z",
  "tool_name": "read_file",
  "session_id": "0194e43b-3d60-7080-8774-681b49f99f2b",
  "profile": "default"
}
```

> [!IMPORTANT]
> **Privacy & Security Guarantee**: Cortex strictly enforces zero storage of tool parameters, file contents, code snippets, or return values from webhooks. Only metadata (`hook_event_name`, `tool_name`, `session_id`, `timestamp`) is processed and displayed.

---

## 2. Configuration for `~/.hermes/config.yaml`

To connect Hermes to Cortex, add the following snippet to your `~/.hermes/config.yaml` file:

```yaml
hooks:
  outbound:
    - name: "cortex"
      url: "http://127.0.0.1:47821/events"
      events:
        - on_session_start
        - on_session_end
        - post_tool_call
        - subagent_start
        - subagent_stop
      secret: "cortex_live_secret_47821"
```

### Parameter Reference
| Key | Default / Recommended | Description |
| :--- | :--- | :--- |
| `name` | `"cortex"` | Identifier for this hook target |
| `url` | `http://127.0.0.1:47821/events` | Cortex listener endpoint (loopback only) |
| `events` | List of event types | Events streamed to Cortex |
| `secret` | (Optional string) | Shared HMAC secret for tamper verification |

---

## 3. Cortex Listener Rules
1. **Loopback Binding Only**: The listener binds strictly to `127.0.0.1` and rejects any external binding.
2. **Payload Size Guard**: Incoming requests exceeding 64 KB are immediately rejected with `413 Payload Too Large`.
3. **Authentication**: If a `secret` is configured in Cortex, incoming requests without a valid `X-Hermes-Signature-256` matching HMAC-SHA256 will receive `401 Unauthorized`.
4. **Default State**: The HTTP listener is disabled by default and can be toggled on/off in Cortex Settings.
