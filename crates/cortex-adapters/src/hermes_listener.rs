use chrono::{DateTime, Utc};
use cortex_model::{Event, EventKind};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tiny_http::{Header, Response, Server};

type HmacSha256 = Hmac<Sha256>;

const MAX_PAYLOAD_BYTES: usize = 64 * 1024; // 64 KB

#[derive(Debug, Deserialize)]
pub struct HermesRawPayload {
    pub hook_event_name: Option<String>,
    pub delivery_id: Option<String>,
    pub timestamp: Option<String>,
    pub tool_name: Option<String>,
    pub session_id: Option<String>,
    pub profile: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HermesValidatedEvent {
    pub event_name: String,
    pub session_id: Option<String>,
    pub tool_name: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub delivery_id: Option<String>,
}

pub struct HermesListenerConfig {
    pub host: String, // must be 127.0.0.1
    pub port: u16,    // default 47821
    pub secret: Option<String>,
}

impl Default for HermesListenerConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".into(),
            port: 47821,
            secret: None,
        }
    }
}

pub fn verify_signature(secret: &str, body: &[u8], signature_header: &str) -> bool {
    let signature_hex = match signature_header.strip_prefix("sha256=") {
        Some(s) => s,
        None => signature_header,
    };

    let expected_bytes = match hex::decode(signature_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };

    let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };

    mac.update(body);
    mac.verify_slice(&expected_bytes).is_ok()
}

pub fn parse_and_validate_payload(
    body: &[u8],
) -> Result<HermesValidatedEvent, String> {
    if body.len() > MAX_PAYLOAD_BYTES {
        return Err("Payload exceeds 64 KB limit".into());
    }

    let raw: HermesRawPayload =
        serde_json::from_slice(body).map_err(|e| format!("Invalid JSON: {}", e))?;

    let event_name = raw
        .hook_event_name
        .ok_or_else(|| "Missing hook_event_name".to_string())?;

    let timestamp = if let Some(ts_str) = raw.timestamp {
        DateTime::parse_from_rfc3339(&ts_str)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now())
    } else {
        Utc::now()
    };

    Ok(HermesValidatedEvent {
        event_name,
        session_id: raw.session_id,
        tool_name: raw.tool_name,
        timestamp,
        delivery_id: raw.delivery_id,
    })
}

pub fn to_cortex_event(v: &HermesValidatedEvent) -> Event {
    let kind = match v.event_name.as_str() {
        "on_session_start" => EventKind::SessionStarted,
        "on_session_end" => EventKind::SessionEnded,
        "post_tool_call" => EventKind::ToolCalled,
        _ => EventKind::Activity,
    };

    let detail = if let Some(tool) = &v.tool_name {
        format!("Tool call: {}", tool)
    } else {
        v.event_name.clone()
    };

    let node_id = v
        .session_id
        .as_ref()
        .map(|sid| format!("hermes:session:{}", sid));

    Event {
        id: v
            .delivery_id
            .clone()
            .unwrap_or_else(|| uuid_simple(v.timestamp.timestamp_nanos_opt().unwrap_or(0))),
        ts: v.timestamp,
        source_id: "hermes".into(),
        node_id,
        kind,
        detail,
    }
}

fn uuid_simple(seed: i64) -> String {
    format!("event-{:x}", seed)
}

pub struct HermesListenerHandle {
    shutdown_signal: Arc<AtomicBool>,
}

impl HermesListenerHandle {
    pub fn stop(&self) {
        self.shutdown_signal.store(true, Ordering::SeqCst);
    }
}

pub fn start_hermes_listener<F>(
    config: HermesListenerConfig,
    on_event: F,
) -> Result<HermesListenerHandle, String>
where
    F: Fn(Event) + Send + Sync + 'static,
{
    // Enforce 127.0.0.1 binding only
    let addr = format!("127.0.0.1:{}", config.port);
    let server = Server::http(&addr).map_err(|e| format!("Failed to bind to {}: {}", addr, e))?;

    let shutdown_signal = Arc::new(AtomicBool::new(false));
    let shutdown_clone = shutdown_signal.clone();

    std::thread::spawn(move || {
        let server = server;
        while !shutdown_clone.load(Ordering::Relaxed) {
            // Check for incoming request with 100ms timeout so we can exit on shutdown
            match server.recv_timeout(Duration::from_millis(100)) {
                Ok(Some(mut request)) => {
                    let url = request.url().to_string();
                    let method = request.method().as_str().to_string();

                    // Only POST /events accepted
                    if method != "POST" || (url != "/events" && url != "/events/") {
                        let resp = Response::from_string("Not Found").with_status_code(404);
                        let _ = request.respond(resp);
                        continue;
                    }

                    // Check Content-Length if present
                    let content_length = request
                        .headers()
                        .iter()
                        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case("content-length"))
                        .and_then(|h| h.value.as_str().parse::<usize>().ok())
                        .unwrap_or(0);

                    if content_length > MAX_PAYLOAD_BYTES {
                        let resp =
                            Response::from_string("Payload Too Large").with_status_code(413);
                        let _ = request.respond(resp);
                        continue;
                    }

                    let mut body = Vec::new();
                    if request.as_reader().read_to_end(&mut body).is_err() {
                        let resp =
                            Response::from_string("Read Error").with_status_code(400);
                        let _ = request.respond(resp);
                        continue;
                    }

                    if body.len() > MAX_PAYLOAD_BYTES {
                        let resp =
                            Response::from_string("Payload Too Large").with_status_code(413);
                        let _ = request.respond(resp);
                        continue;
                    }

                    // Secret validation if configured
                    if let Some(ref sec) = config.secret {
                        let sig_header = request
                            .headers()
                            .iter()
                            .find(|h| {
                                h.field
                                    .as_str()
                                    .as_str()
                                    .eq_ignore_ascii_case("x-hermes-signature-256")
                            })
                            .map(|h| h.value.as_str());

                        match sig_header {
                            Some(sig) if verify_signature(sec, &body, sig) => {
                                // Verified
                            }
                            _ => {
                                let resp =
                                    Response::from_string("Unauthorized").with_status_code(401);
                                let _ = request.respond(resp);
                                continue;
                            }
                        }
                    }

                    match parse_and_validate_payload(&body) {
                        Ok(val) => {
                            let event = to_cortex_event(&val);
                            on_event(event);
                            let json_ok = r#"{"status":"ok"}"#;
                            let resp = Response::from_string(json_ok)
                                .with_status_code(200)
                                .with_header(
                                    Header::from_bytes(
                                        &b"Content-Type"[..],
                                        &b"application/json"[..],
                                    )
                                    .unwrap(),
                                );
                            let _ = request.respond(resp);
                        }
                        Err(err) => {
                            let resp = Response::from_string(format!("Bad Request: {}", err))
                                .with_status_code(400);
                            let _ = request.respond(resp);
                        }
                    }
                }
                Ok(None) => {}
                Err(_) => {}
            }
        }
    });

    Ok(HermesListenerHandle { shutdown_signal })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verify_signature_correct() {
        let secret = "my_secret_token";
        let body = b"{\"hook_event_name\":\"post_tool_call\"}";
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(body);
        let digest = hex::encode(mac.finalize().into_bytes());

        let sig_with_prefix = format!("sha256={}", digest);
        assert!(verify_signature(secret, body, &sig_with_prefix));
        assert!(verify_signature(secret, body, &digest));

        // Wrong secret
        assert!(!verify_signature("wrong_secret", body, &sig_with_prefix));
        // Wrong body
        assert!(!verify_signature(secret, b"other", &sig_with_prefix));
    }

    #[test]
    fn test_strict_validation_no_tool_args() {
        let json_with_args = r#"{
            "hook_event_name": "post_tool_call",
            "delivery_id": "del-123",
            "timestamp": "2026-11-01T12:00:00Z",
            "tool_name": "bash",
            "tool_args": {"command": "rm -rf / sensitive args"},
            "tool_output": "super secret output",
            "session_id": "sess-456"
        }"#;

        let parsed = parse_and_validate_payload(json_with_args.as_bytes()).unwrap();
        assert_eq!(parsed.event_name, "post_tool_call");
        assert_eq!(parsed.tool_name.as_deref(), Some("bash"));
        assert_eq!(parsed.session_id.as_deref(), Some("sess-456"));
        assert_eq!(parsed.delivery_id.as_deref(), Some("del-123"));

        let cortex_event = to_cortex_event(&parsed);
        // Assert cortex event details contain only tool name, zero args or output
        assert_eq!(cortex_event.detail, "Tool call: bash");
        assert_eq!(cortex_event.kind, EventKind::ToolCalled);
        assert_eq!(cortex_event.node_id.as_deref(), Some("hermes:session:sess-456"));
    }

    #[test]
    fn test_payload_limit_enforced() {
        let large_body = vec![b'a'; 70 * 1024]; // 70 KB
        let res = parse_and_validate_payload(&large_body);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("64 KB"));
    }
}
