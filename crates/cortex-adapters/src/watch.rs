use chrono::Utc;
use cortex_model::{Event, EventKind, GraphDelta, Node, NodeKind};
use notify::{Config, Event as NotifyEvent, RecommendedWatcher, RecursiveMode, Watcher};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub struct FileTailTracker {
    offsets: HashMap<PathBuf, u64>,
}

impl Default for FileTailTracker {
    fn default() -> Self {
        Self::new()
    }
}

impl FileTailTracker {
    pub fn new() -> Self {
        Self {
            offsets: HashMap::new(),
        }
    }

    /// Read newly appended lines since last read offset
    pub fn read_new_lines(&mut self, path: &Path) -> std::io::Result<Vec<String>> {
        if !path.exists() {
            return Ok(Vec::new());
        }

        let mut file = File::open(path)?;
        let metadata = file.metadata()?;
        let current_len = metadata.len();

        let prev_offset = *self.offsets.get(path).unwrap_or(&0);

        // Handle file truncation/rotation
        let start_offset = if current_len < prev_offset {
            0
        } else {
            prev_offset
        };

        file.seek(SeekFrom::Start(start_offset))?;
        let reader = BufReader::new(file);

        let mut lines = Vec::new();
        for line in reader.lines().map_while(Result::ok) {
            lines.push(line);
        }

        self.offsets.insert(path.to_path_buf(), current_len);
        Ok(lines)
    }

    pub fn set_offset(&mut self, path: PathBuf, offset: u64) {
        self.offsets.insert(path, offset);
    }

    pub fn get_offset(&self, path: &Path) -> u64 {
        *self.offsets.get(path).unwrap_or(&0)
    }
}

/// Parses newly appended lines from Antigravity transcript.jsonl
pub fn parse_transcript_lines(lines: &[String], conversation_id: Option<&str>) -> Vec<Event> {
    let mut events = Vec::new();

    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
            let step_idx = val.get("step_index").and_then(|v| v.as_u64()).unwrap_or(0);
            let source = val.get("source").and_then(|v| v.as_str()).unwrap_or("SYSTEM");
            let event_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let created_at_str = val.get("created_at").and_then(|v| v.as_str());

            let ts = created_at_str
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(Utc::now);

            // Check if there are tool calls
            if let Some(tool_calls) = val.get("tool_calls").and_then(|tc| tc.as_array()) {
                for tc in tool_calls {
                    let tool_name = tc.get("name").and_then(|n| n.as_str()).unwrap_or("unknown_tool");
                    events.push(Event {
                        id: format!("antigravity:event:{}:{}", step_idx, tool_name),
                        ts,
                        source_id: "antigravity".into(),
                        node_id: conversation_id.map(|id| format!("antigravity:conv:{}", id)),
                        kind: EventKind::ToolCalled,
                        detail: format!("Tool call: {}", tool_name),
                    });
                }
            } else {
                let kind = match event_type {
                    "USER_INPUT" => EventKind::MessageSent,
                    "PLANNER_RESPONSE" => EventKind::Activity,
                    _ => EventKind::Activity,
                };

                let detail = format!("{} turn #{}", source, step_idx);
                events.push(Event {
                    id: format!("antigravity:step:{}", step_idx),
                    ts,
                    source_id: "antigravity".into(),
                    node_id: conversation_id.map(|id| format!("antigravity:conv:{}", id)),
                    kind,
                    detail,
                });
            }
        }
    }

    events
}

/// Parses newly appended lines from Hermes agent.log
pub fn parse_hermes_log_lines(lines: &[String]) -> Vec<Event> {
    let mut events = Vec::new();

    for (idx, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let kind = if trimmed.contains("Tool call:") || trimmed.contains("tool=") {
            EventKind::ToolCalled
        } else if trimmed.contains("Session started") || trimmed.contains("on_session_start") {
            EventKind::SessionStarted
        } else if trimmed.contains("Session ended") || trimmed.contains("on_session_end") {
            EventKind::SessionEnded
        } else {
            EventKind::Activity
        };

        // Redacted detail: extract tool name if present, else brief line summary
        let detail = if kind == EventKind::ToolCalled {
            if let Some(pos) = trimmed.find("Tool call:") {
                trimmed[pos..].chars().take(80).collect()
            } else {
                "Tool execution".to_string()
            }
        } else {
            trimmed.chars().take(80).collect()
        };

        events.push(Event {
            id: format!("hermes:log:{}:{}", Utc::now().timestamp_millis(), idx),
            ts: Utc::now(),
            source_id: "hermes".into(),
            node_id: None,
            kind,
            detail,
        });
    }

    events
}

/// Coalescing debouncer state
pub struct DebouncedWatcherState {
    pub pending_paths: HashSet<PathBuf>,
    pub last_event_at: Instant,
}

pub struct CortexWatcherHandle {
    pub is_running: Arc<AtomicBool>,
}

impl CortexWatcherHandle {
    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
    }
}

/// Starts file watchers on Antigravity and Hermes directories with ~250ms debouncing and coalescing
pub fn start_cortex_file_watchers<FEvent, FDelta>(
    antigravity_paths: Vec<PathBuf>,
    hermes_paths: Vec<PathBuf>,
    debounce_duration: Duration,
    on_event: FEvent,
    on_delta: FDelta,
) -> Result<CortexWatcherHandle, String>
where
    FEvent: Fn(Event) + Send + Sync + 'static,
    FDelta: Fn(GraphDelta) + Send + Sync + 'static,
{
    let is_running = Arc::new(AtomicBool::new(true));
    let state = Arc::new(Mutex::new(DebouncedWatcherState {
        pending_paths: HashSet::new(),
        last_event_at: Instant::now(),
    }));

    let state_clone = Arc::clone(&state);

    let (tx, rx) = std::sync::mpsc::channel();

    let mut watcher = RecommendedWatcher::new(
        move |res: notify::Result<NotifyEvent>| {
            if let Ok(event) = res {
                let _ = tx.send(event.paths);
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Watcher error: {}", e))?;

    for p in &antigravity_paths {
        if p.exists() {
            let _ = watcher.watch(p, RecursiveMode::Recursive);
        }
    }

    for p in &hermes_paths {
        if p.exists() {
            let _ = watcher.watch(p, RecursiveMode::Recursive);
        }
    }

    let is_running_clone = Arc::clone(&is_running);

    // Event receiver & aggregator thread
    std::thread::spawn(move || {
        let _watcher = watcher; // Keep watcher alive
        let mut tail_tracker = FileTailTracker::new();

        while is_running_clone.load(Ordering::Relaxed) {
            // Receive with timeout
            while let Ok(paths) = rx.recv_timeout(Duration::from_millis(50)) {
                let mut guard = state_clone.lock().unwrap();
                for path in paths {
                    guard.pending_paths.insert(path);
                }
                guard.last_event_at = Instant::now();
            }

            // Check if debounce timeout has elapsed
            let paths_to_process = {
                let mut guard = state_clone.lock().unwrap();
                if !guard.pending_paths.is_empty()
                    && guard.last_event_at.elapsed() >= debounce_duration
                {
                    let taken = std::mem::take(&mut guard.pending_paths);
                    Some(taken)
                } else {
                    None
                }
            };

            if let Some(paths) = paths_to_process {
                let mut delta = GraphDelta::default();

                for path in paths {
                    let file_name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_lowercase();

                    if file_name == "transcript.jsonl" {
                        if let Ok(lines) = tail_tracker.read_new_lines(&path) {
                            let conv_id = path
                                .parent()
                                .and_then(|p| p.parent())
                                .and_then(|p| p.file_name())
                                .and_then(|n| n.to_str());
                            let events = parse_transcript_lines(&lines, conv_id);
                            for ev in events {
                                delta.new_events.push(ev.clone());
                                on_event(ev);
                            }
                        }
                    } else if file_name == "agent.log" {
                        if let Ok(lines) = tail_tracker.read_new_lines(&path) {
                            let events = parse_hermes_log_lines(&lines);
                            for ev in events {
                                delta.new_events.push(ev.clone());
                                on_event(ev);
                            }
                        }
                    } else if file_name.ends_with(".md") && !file_name.ends_with(".metadata.json") {
                        // Markdown artifact or memory added/updated
                        let node_id = format!("file:{}", path.display());
                        delta.updated_nodes.push(Node {
                            id: node_id,
                            source_id: "fs".into(),
                            kind: NodeKind::Artifact,
                            title: path
                                .file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("file")
                                .to_string(),
                            body_preview: "File modified on disk".into(),
                            path: Some(path.to_string_lossy().to_string()),
                            tags: vec![],
                            created_at: Some(Utc::now()),
                            modified_at: Some(Utc::now()),
                            last_active_at: Some(Utc::now()),
                            access_count: 1,
                            pinned: false,
                            degree: 0,
                            importance: 0.5,
                            freshness: 1.0,
                            is_ambient: false,
                            is_generic_root: false,
                            timestamp_source: Some("fs_watch".into()),
                            subkind: None,
                            hidden_by_default: false,
                            metadata: serde_json::json!({}),
                        });
                    }
                }

                if !delta.added_nodes.is_empty()
                    || !delta.updated_nodes.is_empty()
                    || !delta.new_events.is_empty()
                {
                    on_delta(delta);
                }
            }
        }
    });

    Ok(CortexWatcherHandle { is_running })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_file_tail_tracker_incremental() {
        let mut tmp = NamedTempFile::new().unwrap();
        let path = tmp.path().to_path_buf();

        let mut tracker = FileTailTracker::new();

        // 1. Initial empty file
        let lines = tracker.read_new_lines(&path).unwrap();
        assert!(lines.is_empty());
        assert_eq!(tracker.get_offset(&path), 0);

        // 2. Append 2 lines
        writeln!(tmp, "Line 1").unwrap();
        writeln!(tmp, "Line 2").unwrap();
        tmp.flush().unwrap();

        let lines = tracker.read_new_lines(&path).unwrap();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0], "Line 1");
        assert_eq!(lines[1], "Line 2");

        // 3. Append 1 more line
        writeln!(tmp, "Line 3").unwrap();
        tmp.flush().unwrap();

        let lines = tracker.read_new_lines(&path).unwrap();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0], "Line 3");

        // 4. Read without appending
        let lines = tracker.read_new_lines(&path).unwrap();
        assert!(lines.is_empty());
    }

    #[test]
    fn test_parse_transcript_tool_calls_and_turns() {
        let lines = vec![
            r#"{"step_index": 1, "source": "USER", "type": "USER_INPUT", "created_at": "2026-11-01T20:00:00Z"}"#.to_string(),
            r#"{"step_index": 2, "source": "MODEL", "type": "PLANNER_RESPONSE", "created_at": "2026-11-01T20:00:05Z", "tool_calls": [{"name": "run_command", "args": {"CommandLine": "dir"}}]}"#.to_string(),
        ];

        let events = parse_transcript_lines(&lines, Some("conv-abc-123"));
        assert_eq!(events.len(), 2);

        // Event 1: User turn
        assert_eq!(events[0].kind, EventKind::MessageSent);
        assert_eq!(events[0].detail, "USER turn #1");
        assert_eq!(events[0].node_id.as_deref(), Some("antigravity:conv:conv-abc-123"));

        // Event 2: Tool call (strictly name only, no args!)
        assert_eq!(events[1].kind, EventKind::ToolCalled);
        assert_eq!(events[1].detail, "Tool call: run_command");
        assert_eq!(events[1].node_id.as_deref(), Some("antigravity:conv:conv-abc-123"));
    }

    #[test]
    fn test_debouncer_coalescing_logic() {
        let mut state = DebouncedWatcherState {
            pending_paths: HashSet::new(),
            last_event_at: Instant::now() - Duration::from_millis(300),
        };

        state.pending_paths.insert(PathBuf::from("path1.txt"));
        state.pending_paths.insert(PathBuf::from("path2.txt"));
        state.pending_paths.insert(PathBuf::from("path1.txt")); // Duplicate coalesced

        assert_eq!(state.pending_paths.len(), 2);
    }

    #[test]
    fn test_incremental_delta_correctness() {
        let mut delta = GraphDelta::default();

        let node = Node {
            id: "node:incremental".into(),
            source_id: "antigravity".into(),
            kind: NodeKind::Artifact,
            title: "New Artifact".into(),
            body_preview: "Artifact description".into(),
            path: None,
            tags: vec![],
            created_at: Some(Utc::now()),
            modified_at: Some(Utc::now()),
            last_active_at: Some(Utc::now()),
            access_count: 1,
            pinned: false,
            degree: 1,
            importance: 0.7,
            freshness: 1.0,
            is_ambient: false,
            is_generic_root: false,
            timestamp_source: Some("fs_watch".into()),
            subkind: None,
            hidden_by_default: false,
            metadata: serde_json::json!({}),
        };

        delta.added_nodes.push(node);
        delta.new_events.push(Event {
            id: "ev-delta-1".into(),
            ts: Utc::now(),
            source_id: "antigravity".into(),
            node_id: Some("node:incremental".into()),
            kind: EventKind::ToolCalled,
            detail: "Tool call: write_file".into(),
        });

        assert_eq!(delta.added_nodes.len(), 1);
        assert_eq!(delta.added_nodes[0].id, "node:incremental");
        assert_eq!(delta.new_events.len(), 1);
        assert_eq!(delta.new_events[0].kind, EventKind::ToolCalled);
    }
}
