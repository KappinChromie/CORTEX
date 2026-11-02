use chrono::{DateTime, Timelike, Utc};
use cortex_model::{
    AdapterHealth, AdapterWarning, Edge, EdgeKind, Event, EventKind, HealthStatus, Node, NodeKind,
    NodeId,
};
use rusqlite::Connection;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::path_norm::{
    is_generic_root_path, normalize_project_path, project_node_id, project_title_from_path,
};
use crate::redaction::redact_and_truncate;
use crate::sqlite_helpers::open_readonly_sqlite;

pub struct AntigravityOutput {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub events: Vec<Event>,
    pub health: AdapterHealth,
    pub output_txt_count: usize,
}

pub struct AntigravityAdapter {
    pub root_path: PathBuf,
}

impl AntigravityAdapter {
    pub fn new(root_path: PathBuf) -> Self {
        Self { root_path }
    }

    pub fn default_path() -> Option<PathBuf> {
        dirs::home_dir().map(|h| h.join(".gemini").join("antigravity"))
    }

    pub fn scan(&self) -> AntigravityOutput {
        let start_time = Instant::now();
        let mut warnings = Vec::new();
        let mut nodes: HashMap<NodeId, Node> = HashMap::new();
        let mut edges: HashSet<(NodeId, NodeId, EdgeKind)> = HashSet::new();
        let mut events = Vec::new();
        let mut items_scanned = 0;
        let mut output_txt_count = 0;

        if !self.root_path.exists() {
            return AntigravityOutput {
                nodes: Vec::new(),
                edges: Vec::new(),
                events: Vec::new(),
                health: AdapterHealth {
                    source_id: "antigravity".into(),
                    name: "Google Antigravity".into(),
                    status: HealthStatus::Missing,
                    version: None,
                    base_path: Some(self.root_path.to_string_lossy().to_string()),
                    warnings: vec![AdapterWarning {
                        code: "DIR_NOT_FOUND".into(),
                        message: format!("Directory does not exist: {:?}", self.root_path),
                        path: Some(self.root_path.to_string_lossy().to_string()),
                    }],
                    items_scanned: 0,
                    scan_duration_ms: start_time.elapsed().as_millis() as u64,
                },
                output_txt_count: 0,
            };
        }

        // 1. Ingest conversation_summaries.db
        let summaries_db_path = self.root_path.join("conversation_summaries.db");
        let mut conversation_workspaces: HashMap<String, String> = HashMap::new();

        if summaries_db_path.exists() {
            items_scanned += 1;
            match open_readonly_sqlite(&summaries_db_path) {
                Ok(conn) => {
                    self.read_conversation_summaries(
                        &conn,
                        &mut nodes,
                        &mut edges,
                        &mut conversation_workspaces,
                        &mut warnings,
                    );
                }
                Err(e) => {
                    warnings.push(AdapterWarning {
                        code: "SQLITE_READ_ERROR".into(),
                        message: format!("Failed to open conversation_summaries.db: {e}"),
                        path: Some(summaries_db_path.to_string_lossy().to_string()),
                    });
                }
            }
        }

        // 2. Ingest conversations/ directory
        let conv_dir = self.root_path.join("conversations");
        if conv_dir.exists() {
            if let Ok(entries) = fs::read_dir(&conv_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let fname = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

                    if fname.ends_with(".pb") {
                        warnings.push(AdapterWarning {
                            code: "PROTOBUF_CONVERSATION_SKIPPED".into(),
                            message: format!(
                                "Encountered .pb conversation file; skipping per addendum: {fname}"
                            ),
                            path: Some(path.to_string_lossy().to_string()),
                        });
                        continue;
                    }

                    if fname.ends_with(".db") {
                        items_scanned += 1;
                        let conv_id = fname.trim_end_matches(".db").to_string();
                        let conv_node_id = format!("antigravity:conv:{}", conv_id);

                        // If not already discovered in conversation_summaries.db
                        if !nodes.contains_key(&conv_node_id) {
                            let mtime = fs::metadata(&path)
                                .and_then(|m| m.modified())
                                .ok()
                                .map(DateTime::<Utc>::from);

                            nodes.insert(
                                conv_node_id.clone(),
                                Node {
                                    id: conv_node_id.clone(),
                                    source_id: "antigravity".into(),
                                    kind: NodeKind::Conversation,
                                    title: format!("Conversation {}", &conv_id[..conv_id.len().min(8)]),
                                    body_preview: "Discovered from SQLite session database".into(),
                                    path: Some(path.to_string_lossy().to_string()),
                                    tags: vec!["antigravity".into()],
                                    created_at: mtime,
                                    modified_at: mtime,
                                    last_active_at: mtime,
                                    access_count: 1,
                                    pinned: false,
                                    degree: 0,
                                    importance: 0.5,
                                    freshness: 0.8,
                                    is_ambient: false,
                                    is_generic_root: false,
                                    timestamp_source: Some("mtime".into()),
                                    subkind: None,
                                    hidden_by_default: false,
                                    metadata: serde_json::json!({
                                        "conversation_id": conv_id,
                                    }),
                                },
                            );
                        }

                        // Inspect steps count read-only without decoding blobs
                        if let Ok(conn) = open_readonly_sqlite(&path) {
                            let step_count: i64 = conn
                                .query_row("SELECT count(*) FROM steps", [], |row| row.get(0))
                                .unwrap_or(0);
                            if let Some(node) = nodes.get_mut(&conv_node_id) {
                                if let Value::Object(ref mut map) = node.metadata {
                                    map.insert("db_step_count".into(), Value::from(step_count));
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Ingest brain/<uuid>/
        let brain_dir = self.root_path.join("brain");
        if brain_dir.exists() {
            if let Ok(conv_folders) = fs::read_dir(&brain_dir) {
                for conv_entry in conv_folders.flatten() {
                    let conv_path = conv_entry.path();
                    if !conv_path.is_dir() {
                        continue;
                    }
                    let conv_folder_name = conv_path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();

                    // Skip non-uuid folders like tempmediaStorage
                    if conv_folder_name == "tempmediaStorage" {
                        continue;
                    }

                    items_scanned += 1;
                    let conv_node_id = format!("antigravity:conv:{}", conv_folder_name);

                    // A. Read artifacts in brain/<uuid>/*.md and *.md.metadata.json
                    if let Ok(files) = fs::read_dir(&conv_path) {
                        for f_entry in files.flatten() {
                            let fpath = f_entry.path();
                            if fpath.is_file() {
                                let name = fpath.file_name().and_then(|n| n.to_str()).unwrap_or("");
                                if name.ends_with(".md") {
                                    items_scanned += 1;
                                    self.ingest_artifact(
                                        &fpath,
                                        &conv_folder_name,
                                        &conv_node_id,
                                        &mut nodes,
                                        &mut edges,
                                        &mut events,
                                        &mut warnings,
                                    );
                                }
                            }
                        }
                    }

                    // B. Count .system_generated/steps/*/output.txt without reading contents
                    let steps_dir = conv_path.join(".system_generated").join("steps");
                    if steps_dir.exists() {
                        if let Ok(step_entries) = fs::read_dir(&steps_dir) {
                            for s_entry in step_entries.flatten() {
                                let out_file = s_entry.path().join("output.txt");
                                if out_file.exists() {
                                    output_txt_count += 1;
                                }
                            }
                        }
                    }

                    // C. Stream transcript.jsonl
                    let transcript_path = conv_path
                        .join(".system_generated")
                        .join("logs")
                        .join("transcript.jsonl");

                    if transcript_path.exists() {
                        items_scanned += 1;
                        self.ingest_transcript(
                            &transcript_path,
                            &conv_folder_name,
                            &conv_node_id,
                            &mut nodes,
                            &mut edges,
                            &mut events,
                            &mut conversation_workspaces,
                            &mut warnings,
                        );
                    }
                }
            }
        }

        // 4. Ingest builtin/skills/*/SKILL.md
        let builtin_skills = self.root_path.join("builtin").join("skills");
        if builtin_skills.exists() {
            self.ingest_skills(&builtin_skills, &mut nodes, &mut edges, &mut warnings, &mut items_scanned);
        }

        // 5. Ingest knowledge/ if present
        let knowledge_dir = self.root_path.join("knowledge");
        if knowledge_dir.exists() {
            if let Ok(k_entries) = fs::read_dir(&knowledge_dir) {
                for k in k_entries.flatten() {
                    let kpath = k.path();
                    let kname = kpath.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if kname != "knowledge.lock" && kpath.is_dir() {
                        items_scanned += 1;
                        let kid = format!("antigravity:knowledge:{}", kname);
                        nodes.insert(
                            kid.clone(),
                            Node {
                                id: kid,
                                source_id: "antigravity".into(),
                                kind: NodeKind::Skill,
                                title: kname.to_string(),
                                body_preview: "Antigravity Knowledge Item".into(),
                                path: Some(kpath.to_string_lossy().to_string()),
                                tags: vec!["knowledge".into()],
                                created_at: None,
                                modified_at: None,
                                last_active_at: None,
                                access_count: 1,
                                pinned: false,
                                degree: 0,
                                importance: 0.6,
                                freshness: 0.7,
                                is_ambient: true,
                                is_generic_root: false,
                                timestamp_source: None,
                                subkind: None,
                                hidden_by_default: false,
                                metadata: Value::Null,
                            },
                        );
                    }
                }
            }
        }

        let edge_list: Vec<Edge> = edges
            .into_iter()
            .map(|(from, to, kind)| Edge {
                from,
                to,
                kind,
                weight: 1.0,
            })
            .collect();

        let node_list: Vec<Node> = nodes.into_values().collect();

        let health = AdapterHealth {
            source_id: "antigravity".into(),
            name: "Google Antigravity".into(),
            status: if warnings.is_empty() {
                HealthStatus::Ok
            } else {
                HealthStatus::Degraded
            },
            version: Some("2.28.2".into()),
            base_path: Some(self.root_path.to_string_lossy().to_string()),
            warnings,
            items_scanned,
            scan_duration_ms: start_time.elapsed().as_millis() as u64,
        };

        AntigravityOutput {
            nodes: node_list,
            edges: edge_list,
            events,
            health,
            output_txt_count,
        }
    }

    fn read_conversation_summaries(
        &self,
        conn: &Connection,
        nodes: &mut HashMap<NodeId, Node>,
        edges: &mut HashSet<(NodeId, NodeId, EdgeKind)>,
        conversation_workspaces: &mut HashMap<String, String>,
        warnings: &mut Vec<AdapterWarning>,
    ) {
        let mut stmt = match conn.prepare(
            "SELECT conversation_id, title, preview, step_count, last_modified_time, workspace_uris, project_id 
             FROM conversation_summaries",
        ) {
            Ok(s) => s,
            Err(e) => {
                warnings.push(AdapterWarning {
                    code: "QUERY_FAILED".into(),
                    message: format!("Failed to query conversation_summaries: {e}"),
                    path: None,
                });
                return;
            }
        };

        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        });

        if let Ok(rows) = rows {
            for row in rows.flatten() {
                let (conv_id, raw_title, preview, step_count, last_mod_str, ws_uris, proj_id) = row;
                let conv_node_id = format!("antigravity:conv:{}", conv_id);

                let parsed_time = DateTime::parse_from_rfc3339(&last_mod_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .ok();

                let safe_title = if !raw_title.trim().is_empty() {
                    raw_title.trim().to_string()
                } else if !preview.trim().is_empty() {
                    let first_line = preview.lines().next().unwrap_or("").trim();
                    redact_and_truncate(first_line, 60)
                } else {
                    format!("Conversation {}", &conv_id[..conv_id.len().min(8)])
                };

                let safe_preview = redact_and_truncate(&preview, 300);

                // Parse workspace URI if present
                let mut resolved_project_path = None;
                if !ws_uris.trim().is_empty() {
                    if let Ok(Value::Array(arr)) = serde_json::from_str(&ws_uris) {
                        if let Some(first_uri) = arr.first().and_then(|v| v.as_str()) {
                            let norm = normalize_project_path(first_uri);
                            if !norm.is_empty() {
                                conversation_workspaces.insert(conv_id.clone(), norm.clone());
                                resolved_project_path = Some(norm);
                            }
                        }
                    }
                }

                // If project found, create Project node and link Conversation -> Project
                if let Some(ref norm_path) = resolved_project_path {
                    let p_id = project_node_id(norm_path);
                    let p_title = project_title_from_path(norm_path);

                    nodes.entry(p_id.clone()).or_insert_with(|| Node {
                        id: p_id.clone(),
                        source_id: "shared".into(),
                        kind: NodeKind::Project,
                        title: p_title,
                        body_preview: format!("Project workspace at {norm_path}"),
                        path: Some(norm_path.clone()),
                        tags: vec!["project".into()],
                        created_at: parsed_time,
                        modified_at: parsed_time,
                        last_active_at: parsed_time,
                        access_count: 1,
                        pinned: false,
                        degree: 0,
                        importance: 1.0,
                        freshness: 1.0,
                        is_ambient: false,
                        is_generic_root: is_generic_root_path(norm_path),
                        timestamp_source: Some("metadata".into()),
                        subkind: None,
                        hidden_by_default: false,
                        metadata: serde_json::json!({
                            "normalized_path": norm_path,
                        }),
                    });

                    edges.insert((conv_node_id.clone(), p_id, EdgeKind::ProjectSession));
                }

                nodes.insert(
                    conv_node_id.clone(),
                    Node {
                        id: conv_node_id,
                        source_id: "antigravity".into(),
                        kind: NodeKind::Conversation,
                        title: safe_title,
                        body_preview: safe_preview,
                        path: Some(format!("~/.gemini/antigravity/conversations/{conv_id}.db")),
                        tags: vec!["antigravity".into(), "conversation".into()],
                        created_at: parsed_time,
                        modified_at: parsed_time,
                        last_active_at: parsed_time,
                        access_count: (step_count.max(1)) as u32,
                        pinned: false,
                        degree: 0,
                        importance: 0.7,
                        freshness: 0.9,
                        is_ambient: false,
                        is_generic_root: false,
                        timestamp_source: Some("mtime".into()),
                        subkind: None,
                        hidden_by_default: false,
                        metadata: serde_json::json!({
                            "conversation_id": conv_id,
                            "step_count": step_count,
                            "project_id": proj_id,
                        }),
                    },
                );
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn ingest_artifact(
        &self,
        path: &Path,
        conv_uuid: &str,
        conv_node_id: &str,
        nodes: &mut HashMap<NodeId, Node>,
        edges: &mut HashSet<(NodeId, NodeId, EdgeKind)>,
        events: &mut Vec<Event>,
        warnings: &mut Vec<AdapterWarning>,
    ) {
        let meta = match fs::metadata(path) {
            Ok(m) => m,
            Err(_) => return,
        };

        if meta.len() > 5 * 1024 * 1024 {
            warnings.push(AdapterWarning {
                code: "FILE_OVER_5MB".into(),
                message: format!("Skipped artifact larger than 5 MB: {:?}", path),
                path: Some(path.to_string_lossy().to_string()),
            });
            return;
        }

        let fname = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let artifact_node_id = format!("antigravity:artifact:{}:{}", conv_uuid, fname);

        // Read cap at 256 KB
        let mut buf = vec![0u8; 256 * 1024];
        let bytes_read = match File::open(path).and_then(|mut f| f.read(&mut buf)) {
            Ok(n) => n,
            Err(_) => return,
        };
        let content_str = String::from_utf8_lossy(&buf[..bytes_read]);

        // Check metadata companion file
        let meta_path = path.with_extension("md.metadata.json");
        let mut summary_text = String::new();
        let mut updated_at = None;

        if meta_path.exists() {
            if let Ok(meta_content) = fs::read_to_string(&meta_path) {
                if let Ok(val) = serde_json::from_str::<Value>(&meta_content) {
                    if let Some(s) = val.get("summary").and_then(|v| v.as_str()) {
                        summary_text = s.to_string();
                    }
                    if let Some(ts_str) = val.get("updatedAt").and_then(|v| v.as_str()) {
                        updated_at = DateTime::parse_from_rfc3339(ts_str)
                            .map(|dt| dt.with_timezone(&Utc))
                            .ok();
                    }
                }
            }
        }

        let preview = if !summary_text.is_empty() {
            redact_and_truncate(&summary_text, 300)
        } else {
            redact_and_truncate(&content_str, 300)
        };

        let file_mtime = meta.modified().ok().map(DateTime::<Utc>::from);
        let final_time = updated_at.or(file_mtime);
        let timestamp_source = if updated_at.is_some() {
            Some("metadata".into())
        } else {
            Some("mtime".into())
        };

        nodes.insert(
            artifact_node_id.clone(),
            Node {
                id: artifact_node_id.clone(),
                source_id: "antigravity".into(),
                kind: NodeKind::Artifact,
                title: fname.to_string(),
                body_preview: preview,
                path: Some(path.to_string_lossy().to_string()),
                tags: vec!["artifact".into(), "antigravity".into()],
                created_at: final_time,
                modified_at: final_time,
                last_active_at: final_time,
                access_count: 1,
                pinned: false,
                degree: 0,
                importance: 0.8,
                freshness: 0.9,
                is_ambient: false,
                is_generic_root: false,
                timestamp_source,
                subkind: None,
                hidden_by_default: false,
                metadata: serde_json::json!({
                    "conversation_id": conv_uuid,
                    "filename": fname,
                }),
            },
        );

        edges.insert((artifact_node_id.clone(), conv_node_id.to_string(), EdgeKind::ArtifactConversation));

        if let Some(ts) = final_time {
            events.push(Event {
                id: format!("event:artifact:{}:{}", conv_uuid, fname),
                ts,
                source_id: "antigravity".into(),
                node_id: Some(artifact_node_id),
                kind: EventKind::ArtifactUpdated,
                detail: format!("Artifact updated: {fname}"),
            });
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn ingest_transcript(
        &self,
        path: &Path,
        conv_uuid: &str,
        conv_node_id: &str,
        nodes: &mut HashMap<NodeId, Node>,
        edges: &mut HashSet<(NodeId, NodeId, EdgeKind)>,
        events: &mut Vec<Event>,
        conversation_workspaces: &mut HashMap<String, String>,
        _warnings: &mut Vec<AdapterWarning>,
    ) {
        let file = match File::open(path) {
            Ok(f) => f,
            Err(_) => return,
        };

        let reader = BufReader::new(file);
        let mut earliest_ts: Option<DateTime<Utc>> = None;
        let mut latest_ts: Option<DateTime<Utc>> = None;
        let mut hourly_buckets: HashMap<DateTime<Utc>, u32> = HashMap::new();
        let mut discovered_project_path = None;

        for line_res in reader.lines() {
            let line = match line_res {
                Ok(l) => l,
                Err(_) => break,
            };

            if let Ok(val) = serde_json::from_str::<Value>(&line) {
                // Read created_at and aggregate into hourly buckets
                if let Some(ts_str) = val.get("created_at").and_then(|v| v.as_str()) {
                    if let Ok(dt) = DateTime::parse_from_rfc3339(ts_str) {
                        let utc_dt = dt.with_timezone(&Utc);
                        earliest_ts = Some(earliest_ts.map_or(utc_dt, |cur| cur.min(utc_dt)));
                        latest_ts = Some(latest_ts.map_or(utc_dt, |cur| cur.max(utc_dt)));

                        if let Some(hour_bucket) = utc_dt.date_naive().and_hms_opt(utc_dt.time().hour(), 0, 0) {
                            let bucket_utc = hour_bucket.and_utc();
                            *hourly_buckets.entry(bucket_utc).or_insert(0) += 1;
                        }
                    }
                }

                // Check tool calls
                if let Some(Value::Array(tool_calls)) = val.get("tool_calls") {
                    for tc in tool_calls {
                        let tool_name = tc
                            .get("name")
                            .or_else(|| tc.get("tool_name"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("");

                        if !tool_name.is_empty() {
                            let tool_node_id = format!("tool:{}", tool_name);
                            nodes.entry(tool_node_id.clone()).or_insert_with(|| Node {
                                id: tool_node_id.clone(),
                                source_id: "shared".into(),
                                kind: NodeKind::Tool,
                                title: tool_name.to_string(),
                                body_preview: format!("Tool used by agents: {tool_name}"),
                                path: None,
                                tags: vec!["tool".into()],
                                created_at: None,
                                modified_at: None,
                                last_active_at: None,
                                access_count: 0,
                                pinned: false,
                                degree: 0,
                                importance: 0.5,
                                freshness: 0.8,
                                is_ambient: true,
                                is_generic_root: false,
                                timestamp_source: None,
                                subkind: None,
                                hidden_by_default: false,
                                metadata: Value::Null,
                            });

                            edges.insert((conv_node_id.to_string(), tool_node_id, EdgeKind::UsesTool));
                        }

                        // Search tool arguments for workspace project path fallback if missing
                        if discovered_project_path.is_none()
                            && !conversation_workspaces.contains_key(conv_uuid)
                        {
                            if let Some(args) = tc.get("args").or_else(|| tc.get("parameters")) {
                                let args_str = args.to_string();
                                if let Some(idx) = args_str.find("projects") {
                                    // Extract path up to project folder
                                    let candidate = &args_str[idx..];
                                    let parts: Vec<&str> = candidate.split(&['/', '\\', '"', '\''][..]).collect();
                                    if parts.len() >= 2 {
                                        let proj_name = parts[1];
                                        if !proj_name.is_empty() {
                                            let full_candidate = format!(r"c:\users\luche\documents\projects\{proj_name}");
                                            discovered_project_path = Some(normalize_project_path(&full_candidate));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Link fallback project if discovered from transcript
        if let Some(ref norm_path) = discovered_project_path {
            conversation_workspaces.insert(conv_uuid.to_string(), norm_path.clone());
            let p_id = project_node_id(norm_path);
            let p_title = project_title_from_path(norm_path);

            nodes.entry(p_id.clone()).or_insert_with(|| Node {
                id: p_id.clone(),
                source_id: "shared".into(),
                kind: NodeKind::Project,
                title: p_title,
                body_preview: format!("Project workspace at {norm_path}"),
                path: Some(norm_path.clone()),
                tags: vec!["project".into()],
                created_at: earliest_ts,
                modified_at: latest_ts,
                last_active_at: latest_ts,
                access_count: 1,
                pinned: false,
                degree: 0,
                importance: 1.0,
                freshness: 1.0,
                is_ambient: false,
                is_generic_root: is_generic_root_path(norm_path),
                timestamp_source: Some("transcript".into()),
                subkind: None,
                hidden_by_default: false,
                metadata: serde_json::json!({
                    "normalized_path": norm_path,
                }),
            });

            edges.insert((conv_node_id.to_string(), p_id, EdgeKind::ProjectSession));
        }

        // Update conversation node with real transcript timestamps
        if let Some(node) = nodes.get_mut(conv_node_id) {
            if let Some(e) = earliest_ts {
                node.created_at = Some(e);
                node.timestamp_source = Some("transcript".into());
            }
            if let Some(l) = latest_ts {
                node.last_active_at = Some(l);
            }
        }

        // Emit hourly activity bucket events
        for (bucket_ts, count) in hourly_buckets {
            events.push(Event {
                id: format!("event:hourly:{}:{}", conv_uuid, bucket_ts.timestamp()),
                ts: bucket_ts,
                source_id: "antigravity".into(),
                node_id: Some(conv_node_id.to_string()),
                kind: EventKind::Activity,
                detail: format!("{count} steps"),
            });
        }

        if let Some(ts) = earliest_ts {
            events.push(Event {
                id: format!("event:conv_start:{}", conv_uuid),
                ts,
                source_id: "antigravity".into(),
                node_id: Some(conv_node_id.to_string()),
                kind: EventKind::SessionStarted,
                detail: format!("Conversation started: {}", &conv_uuid[..conv_uuid.len().min(8)]),
            });
        }
    }

    fn ingest_skills(
        &self,
        skills_dir: &Path,
        nodes: &mut HashMap<NodeId, Node>,
        edges: &mut HashSet<(NodeId, NodeId, EdgeKind)>,
        _warnings: &mut Vec<AdapterWarning>,
        items_scanned: &mut usize,
    ) {
        if let Ok(entries) = fs::read_dir(skills_dir) {
            for entry in entries.flatten() {
                let skill_folder = entry.path();
                if skill_folder.is_dir() {
                    let skill_file = skill_folder.join("SKILL.md");
                    if skill_file.exists() {
                        *items_scanned += 1;
                        let folder_name = skill_folder
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("")
                            .to_string();

                        if let Ok(content) = fs::read_to_string(&skill_file) {
                            let (frontmatter, body) = parse_frontmatter(&content);
                            let title = frontmatter
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or(&folder_name)
                                .to_string();

                            let desc = frontmatter
                                .get("description")
                                .and_then(|v| v.as_str())
                                .unwrap_or_else(|| body.lines().next().unwrap_or(""));

                            let skill_node_id = format!("antigravity:skill:{}", title);
                            let preview = redact_and_truncate(desc, 300);

                            nodes.insert(
                                skill_node_id.clone(),
                                Node {
                                    id: skill_node_id.clone(),
                                    source_id: "antigravity".into(),
                                    kind: NodeKind::Skill,
                                    title: title.clone(),
                                    body_preview: preview,
                                    path: Some(skill_file.to_string_lossy().to_string()),
                                    tags: vec!["skill".into(), "antigravity".into()],
                                    created_at: None,
                                    modified_at: None,
                                    last_active_at: None,
                                    access_count: 1,
                                    pinned: false,
                                    degree: 0,
                                    importance: 0.6,
                                    freshness: 0.8,
                                    is_ambient: true,
                                    is_generic_root: false,
                                    timestamp_source: None,
                                    subkind: None,
                                    hidden_by_default: false,
                                    metadata: Value::Null,
                                },
                            );

                            // Topic (Category)
                            let topic_id = "topic:antigravity_builtin".to_string();
                            nodes.entry(topic_id.clone()).or_insert_with(|| Node {
                                id: topic_id.clone(),
                                source_id: "shared".into(),
                                kind: NodeKind::Topic,
                                title: "antigravity_builtin".into(),
                                body_preview: "Built-in Antigravity skills topic".into(),
                                path: None,
                                tags: vec!["topic".into()],
                                created_at: None,
                                modified_at: None,
                                last_active_at: None,
                                access_count: 1,
                                pinned: false,
                                degree: 0,
                                importance: 0.4,
                                freshness: 0.8,
                                is_ambient: true,
                                is_generic_root: false,
                                timestamp_source: None,
                                subkind: Some("category".into()),
                                hidden_by_default: false,
                                metadata: Value::Null,
                            });

                            edges.insert((skill_node_id, topic_id, EdgeKind::SkillTopic));
                        }
                    }
                }
            }
        }
    }
}

pub fn parse_frontmatter(raw: &str) -> (HashMap<String, Value>, &str) {
    if let Some(stripped) = raw.strip_prefix("---") {
        if let Some(end_idx) = stripped.find("---") {
            let yaml_str = &stripped[..end_idx];
            let body = &stripped[end_idx + 3..];
            if let Ok(map) = serde_yaml::from_str::<HashMap<String, Value>>(yaml_str) {
                return (map, body.trim());
            }
        }
    }
    (HashMap::new(), raw.trim())
}
