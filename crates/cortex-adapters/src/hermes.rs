use chrono::{DateTime, Timelike, Utc};
use cortex_model::{
    AdapterHealth, AdapterWarning, Edge, EdgeKind, Event, EventKind, HealthStatus, Node, NodeKind,
    NodeId,
};
use rusqlite::Connection;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::antigravity::parse_frontmatter;
use crate::path_norm::{
    is_generic_root_path, normalize_project_path, project_node_id, project_title_from_path,
};
use crate::redaction::redact_and_truncate;
use crate::sqlite_helpers::open_readonly_sqlite;

pub struct HermesOutput {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub events: Vec<Event>,
    pub health: AdapterHealth,
}

pub struct HermesAdapter {
    pub home_dir: PathBuf,
}

impl HermesAdapter {
    pub fn new(home_dir: PathBuf) -> Self {
        Self { home_dir }
    }

    /// Resolves Hermes home directory in priority order:
    /// 1. $HERMES_HOME
    /// 2. %LOCALAPPDATA%\hermes (Windows)
    /// 3. ~/.hermes
    pub fn resolve_home() -> Option<PathBuf> {
        if let Ok(val) = std::env::var("HERMES_HOME") {
            let p = PathBuf::from(val.trim());
            if p.exists() {
                return Some(p);
            }
        }

        if let Ok(val) = std::env::var("LOCALAPPDATA") {
            let p = PathBuf::from(val).join("hermes");
            if p.exists() {
                return Some(p);
            }
        }

        if let Some(user_home) = dirs::home_dir() {
            let p = user_home.join(".hermes");
            if p.exists() {
                return Some(p);
            }
        }

        None
    }

    pub fn scan(&self) -> HermesOutput {
        let start_time = Instant::now();
        let mut warnings = Vec::new();
        let mut nodes: HashMap<NodeId, Node> = HashMap::new();
        let mut edges: HashSet<(NodeId, NodeId, EdgeKind)> = HashSet::new();
        let mut events = Vec::new();
        let mut items_scanned = 0;

        if !self.home_dir.exists() {
            return HermesOutput {
                nodes: Vec::new(),
                edges: Vec::new(),
                events: Vec::new(),
                health: AdapterHealth {
                    source_id: "hermes".into(),
                    name: "Hermes Agent".into(),
                    status: HealthStatus::Missing,
                    version: None,
                    base_path: Some(self.home_dir.to_string_lossy().to_string()),
                    warnings: vec![AdapterWarning {
                        code: "DIR_NOT_FOUND".into(),
                        message: format!("Directory does not exist: {:?}", self.home_dir),
                        path: Some(self.home_dir.to_string_lossy().to_string()),
                    }],
                    items_scanned: 0,
                    scan_duration_ms: start_time.elapsed().as_millis() as u64,
                },
            };
        }

        // 1. Ingest state.db (sessions, messages)
        let state_db = self.home_dir.join("state.db");
        if state_db.exists() {
            items_scanned += 1;
            match open_readonly_sqlite(&state_db) {
                Ok(conn) => {
                    self.read_state_db(&conn, &mut nodes, &mut edges, &mut events, &mut warnings);
                }
                Err(e) => {
                    warnings.push(AdapterWarning {
                        code: "SQLITE_READ_ERROR".into(),
                        message: format!("Failed to open state.db: {e}"),
                        path: Some(state_db.to_string_lossy().to_string()),
                    });
                }
            }
        }

        // 2. Ingest projects.db (projects, project_folders)
        let projects_db = self.home_dir.join("projects.db");
        if projects_db.exists() {
            items_scanned += 1;
            match open_readonly_sqlite(&projects_db) {
                Ok(conn) => {
                    self.read_projects_db(&conn, &mut nodes, &mut warnings);
                }
                Err(e) => {
                    warnings.push(AdapterWarning {
                        code: "SQLITE_READ_ERROR".into(),
                        message: format!("Failed to open projects.db: {e}"),
                        path: Some(projects_db.to_string_lossy().to_string()),
                    });
                }
            }
        }

        // 3. Ingest kanban.db (tasks, task_links)
        let kanban_db = self.home_dir.join("kanban.db");
        if kanban_db.exists() {
            items_scanned += 1;
            match open_readonly_sqlite(&kanban_db) {
                Ok(conn) => {
                    self.read_kanban_db(&conn, &mut nodes, &mut edges, &mut events, &mut warnings);
                }
                Err(e) => {
                    warnings.push(AdapterWarning {
                        code: "SQLITE_READ_ERROR".into(),
                        message: format!("Failed to open kanban.db: {e}"),
                        path: Some(kanban_db.to_string_lossy().to_string()),
                    });
                }
            }
        }

        // 4. Ingest skills/**/SKILL.md from home and auxiliary paths
        let skill_roots = vec![
            self.home_dir.join("skills"),
            dirs::home_dir().map(|h| h.join(".hermes").join("skills")).unwrap_or_default(),
            dirs::home_dir().map(|h| h.join(".agents").join("skills")).unwrap_or_default(),
        ];

        let mut seen_skill_paths = HashSet::new();
        for s_root in skill_roots {
            if s_root.exists() {
                self.ingest_skills_tree(
                    &s_root,
                    &mut nodes,
                    &mut edges,
                    &mut seen_skill_paths,
                    &mut items_scanned,
                    &mut warnings,
                );
            }
        }

        // 5. Ingest SOUL.md
        let soul_file = self.home_dir.join("SOUL.md");
        if soul_file.exists() {
            items_scanned += 1;
            if let Ok(content) = fs::read_to_string(&soul_file) {
                let mtime = fs::metadata(&soul_file)
                    .and_then(|m| m.modified())
                    .ok()
                    .map(DateTime::<Utc>::from);

                let preview = redact_and_truncate(&content, 300);
                nodes.insert(
                    "hermes:soul".into(),
                    Node {
                        id: "hermes:soul".into(),
                        source_id: "hermes".into(),
                        kind: NodeKind::Memory,
                        title: "Hermes Agent SOUL".into(),
                        body_preview: preview,
                        path: Some(soul_file.to_string_lossy().to_string()),
                        tags: vec!["soul".into(), "identity".into(), "hermes".into()],
                        created_at: mtime,
                        modified_at: mtime,
                        last_active_at: mtime,
                        access_count: 1,
                        pinned: true,
                        degree: 0,
                        importance: 0.9,
                        freshness: 1.0,
                        is_ambient: false,
                        is_generic_root: false,
                        timestamp_source: Some("mtime".into()),
                        subkind: None,
                        hidden_by_default: false,
                        metadata: serde_json::json!({
                            "type": "personality",
                        }),
                    },
                );
            }
        }

        // 6. Ingest memories/MEMORY.md and memories/USER.md
        let memories_dir = self.home_dir.join("memories");
        if memories_dir.exists() {
            for m_name in &["MEMORY.md", "USER.md"] {
                let m_path = memories_dir.join(m_name);
                if m_path.exists() {
                    items_scanned += 1;
                    self.ingest_memory_file(&m_path, m_name, &mut nodes, &mut warnings);
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
            source_id: "hermes".into(),
            name: "Hermes Agent".into(),
            status: if warnings.is_empty() {
                HealthStatus::Ok
            } else {
                HealthStatus::Degraded
            },
            version: Some("0.22.5".into()),
            base_path: Some(self.home_dir.to_string_lossy().to_string()),
            warnings,
            items_scanned,
            scan_duration_ms: start_time.elapsed().as_millis() as u64,
        };

        HermesOutput {
            nodes: node_list,
            edges: edge_list,
            events,
            health,
        }
    }

    fn read_state_db(
        &self,
        conn: &Connection,
        nodes: &mut HashMap<NodeId, Node>,
        edges: &mut HashSet<(NodeId, NodeId, EdgeKind)>,
        events: &mut Vec<Event>,
        warnings: &mut Vec<AdapterWarning>,
    ) {
        let mut stmt = match conn.prepare(
            "SELECT id, cwd, git_repo_root, started_at, last_activity_at, tool_names, model, 
                    message_count, title, parent_session_id 
             FROM sessions",
        ) {
            Ok(s) => s,
            Err(e) => {
                warnings.push(AdapterWarning {
                    code: "QUERY_FAILED".into(),
                    message: format!("Failed to query sessions from state.db: {e}"),
                    path: None,
                });
                return;
            }
        };

        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<f64>>(3)?,
                row.get::<_, Option<f64>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<i64>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<String>>(9)?,
            ))
        });

        if let Ok(rows) = rows {
            for row in rows.flatten() {
                let (
                    id,
                    cwd_opt,
                    git_root_opt,
                    started_opt,
                    last_act_opt,
                    tools_opt,
                    model_opt,
                    msg_count_opt,
                    title_opt,
                    parent_id_opt,
                ) = row;

                let session_node_id = format!("hermes:session:{}", id);

                let created_at = started_opt
                    .and_then(|sec| DateTime::from_timestamp(sec as i64, ((sec.fract()) * 1e9) as u32));
                let last_active_at = last_act_opt
                    .and_then(|sec| DateTime::from_timestamp(sec as i64, ((sec.fract()) * 1e9) as u32))
                    .or(created_at);

                let safe_title = if let Some(t) = title_opt {
                    if !t.trim().is_empty() {
                        t.trim().to_string()
                    } else {
                        format!("Session {}", &id[..id.len().min(8)])
                    }
                } else {
                    format!("Session {}", &id[..id.len().min(8)])
                };

                let preview_text = format!(
                    "Model: {} | Turns: {} | Working directory: {}",
                    model_opt.as_deref().unwrap_or("default"),
                    msg_count_opt.unwrap_or(0),
                    cwd_opt.as_deref().unwrap_or("none")
                );

                // Project link (cwd or git_repo_root)
                let project_path_candidate = git_root_opt.or(cwd_opt);
                if let Some(ref raw_path) = project_path_candidate {
                    let norm = normalize_project_path(raw_path);
                    if !norm.is_empty() {
                        let p_id = project_node_id(&norm);
                        let p_title = project_title_from_path(&norm);

                        nodes.entry(p_id.clone()).or_insert_with(|| Node {
                            id: p_id.clone(),
                            source_id: "shared".into(),
                            kind: NodeKind::Project,
                            title: p_title,
                            body_preview: format!("Project workspace at {norm}"),
                            path: Some(norm.clone()),
                            tags: vec!["project".into()],
                            created_at,
                            modified_at: last_active_at,
                            last_active_at,
                            access_count: 1,
                            pinned: false,
                            degree: 0,
                            importance: 1.0,
                            freshness: 1.0,
                            is_ambient: false,
                            is_generic_root: is_generic_root_path(&norm),
                            timestamp_source: Some("session_db".into()),
                            subkind: None,
                            hidden_by_default: false,
                            metadata: serde_json::json!({
                                "normalized_path": norm,
                            }),
                        });

                        edges.insert((session_node_id.clone(), p_id, EdgeKind::ProjectSession));
                    }
                }

                // Parent session link
                if let Some(parent_id) = parent_id_opt {
                    if !parent_id.trim().is_empty() {
                        let parent_node_id = format!("hermes:session:{}", parent_id.trim());
                        edges.insert((session_node_id.clone(), parent_node_id, EdgeKind::ParentSession));
                    }
                }

                // Tool links
                if let Some(tools_str) = tools_opt {
                    for tool_raw in tools_str.split(',') {
                        let tool_name = tool_raw.trim();
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

                            edges.insert((session_node_id.clone(), tool_node_id, EdgeKind::UsesTool));
                        }
                    }
                }

                nodes.insert(
                    session_node_id.clone(),
                    Node {
                        id: session_node_id.clone(),
                        source_id: "hermes".into(),
                        kind: NodeKind::Session,
                        title: safe_title.clone(),
                        body_preview: redact_and_truncate(&preview_text, 300),
                        path: Some(format!("~/.hermes/state.db:sessions:{id}")),
                        tags: vec!["hermes".into(), "session".into()],
                        created_at,
                        modified_at: last_active_at,
                        last_active_at,
                        access_count: msg_count_opt.unwrap_or(1) as u32,
                        pinned: false,
                        degree: 0,
                        importance: 0.7,
                        freshness: 0.9,
                        is_ambient: false,
                        is_generic_root: false,
                        timestamp_source: Some("session_db".into()),
                        subkind: None,
                        hidden_by_default: false,
                        metadata: serde_json::json!({
                            "session_id": id,
                            "model": model_opt,
                            "message_count": msg_count_opt,
                        }),
                    },
                );

                if let Some(ts) = created_at {
                    events.push(Event {
                        id: format!("event:hermes_start:{id}"),
                        ts,
                        source_id: "hermes".into(),
                        node_id: Some(session_node_id.clone()),
                        kind: EventKind::SessionStarted,
                        detail: format!("Hermes session started: {safe_title}"),
                    });
                }
                if let Some(ts) = last_active_at {
                    events.push(Event {
                        id: format!("event:hermes_end:{id}"),
                        ts,
                        source_id: "hermes".into(),
                        node_id: Some(session_node_id.clone()),
                        kind: EventKind::SessionEnded,
                        detail: format!("Hermes session ended / last active: {safe_title}"),
                    });
                }
            }
        }

        // Aggregate messages into hourly buckets per session
        if let Ok(mut m_stmt) = conn.prepare("SELECT session_id, created_at FROM messages WHERE created_at IS NOT NULL") {
            let mut msg_buckets: HashMap<(String, DateTime<Utc>), u32> = HashMap::new();
            let m_rows = m_stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Option<f64>>(1)?))
            });

            if let Ok(m_rows) = m_rows {
                for r in m_rows.flatten() {
                    let (session_id, ts_opt) = r;
                    if let Some(sec) = ts_opt {
                        if let Some(dt) = DateTime::from_timestamp(sec as i64, ((sec.fract()) * 1e9) as u32) {
                            if let Some(hb) = dt.date_naive().and_hms_opt(dt.time().hour(), 0, 0) {
                                *msg_buckets.entry((session_id, hb.and_utc())).or_insert(0) += 1;
                            }
                        }
                    }
                }
            }

            for ((session_id, bucket_ts), count) in msg_buckets {
                events.push(Event {
                    id: format!("event:hourly_msg:{}:{}", session_id, bucket_ts.timestamp()),
                    ts: bucket_ts,
                    source_id: "hermes".into(),
                    node_id: Some(format!("hermes:session:{}", session_id)),
                    kind: EventKind::Activity,
                    detail: format!("{count} messages"),
                });
            }
        }
    }

    fn read_projects_db(&self, conn: &Connection, nodes: &mut HashMap<NodeId, Node>, _warnings: &mut Vec<AdapterWarning>) {
        if let Ok(mut stmt) = conn.prepare("SELECT id, name, primary_path, created_at FROM projects") {
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<i64>>(3)?,
                ))
            });

            if let Ok(rows) = rows {
                for r in rows.flatten() {
                    let (_pid, name, path_opt, created_ts) = r;
                    if let Some(p_raw) = path_opt {
                        let norm = normalize_project_path(&p_raw);
                        let p_id = project_node_id(&norm);
                        let created_at = created_ts.and_then(|s| DateTime::from_timestamp(s, 0));

                        nodes.entry(p_id.clone()).or_insert_with(|| Node {
                            id: p_id,
                            source_id: "shared".into(),
                            kind: NodeKind::Project,
                            title: if !name.is_empty() { name } else { project_title_from_path(&norm) },
                            body_preview: format!("Project workspace at {norm}"),
                            path: Some(norm.clone()),
                            tags: vec!["project".into()],
                            created_at,
                            modified_at: created_at,
                            last_active_at: created_at,
                            access_count: 1,
                            pinned: false,
                            degree: 0,
                            importance: 1.0,
                            freshness: 1.0,
                            is_ambient: false,
                            is_generic_root: is_generic_root_path(&norm),
                            timestamp_source: Some("projects_db".into()),
                            subkind: None,
                            hidden_by_default: false,
                            metadata: Value::Null,
                        });
                    }
                }
            }
        }
    }

    fn read_kanban_db(
        &self,
        conn: &Connection,
        nodes: &mut HashMap<NodeId, Node>,
        edges: &mut HashSet<(NodeId, NodeId, EdgeKind)>,
        events: &mut Vec<Event>,
        _warnings: &mut Vec<AdapterWarning>,
    ) {
        // Read tasks
        if let Ok(mut stmt) = conn.prepare(
            "SELECT id, title, body, status, workspace_path, created_at, completed_at FROM tasks",
        ) {
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                    row.get::<_, Option<i64>>(6)?,
                ))
            });

            if let Ok(rows) = rows {
                for r in rows.flatten() {
                    let (task_id, title, body_opt, status, ws_path_opt, created_ts, comp_ts) = r;
                    let task_node_id = format!("hermes:task:{}", task_id);

                    let created_at = created_ts.and_then(|s| DateTime::from_timestamp(s, 0));
                    let completed_at = comp_ts.and_then(|s| DateTime::from_timestamp(s, 0));
                    let last_active = completed_at.or(created_at);

                    let preview = body_opt
                        .as_deref()
                        .map(|b| redact_and_truncate(b, 300))
                        .unwrap_or_else(|| format!("Status: {status}"));

                    nodes.insert(
                        task_node_id.clone(),
                        Node {
                            id: task_node_id.clone(),
                            source_id: "hermes".into(),
                            kind: NodeKind::Task,
                            title: title.clone(),
                            body_preview: preview,
                            path: Some(format!("~/.hermes/kanban.db:tasks:{task_id}")),
                            tags: vec!["task".into(), status.to_lowercase()],
                            created_at,
                            modified_at: last_active,
                            last_active_at: last_active,
                            access_count: 1,
                            pinned: false,
                            degree: 0,
                            importance: 0.6,
                            freshness: 0.8,
                            is_ambient: false,
                            is_generic_root: false,
                            timestamp_source: Some("kanban".into()),
                            subkind: None,
                            hidden_by_default: false,
                            metadata: serde_json::json!({
                                "status": status,
                                "task_id": task_id,
                            }),
                        },
                    );

                    if let Some(c_time) = created_at {
                        events.push(Event {
                            id: format!("event:task_created:{task_id}"),
                            ts: c_time,
                            source_id: "hermes".into(),
                            node_id: Some(task_node_id.clone()),
                            kind: EventKind::TaskCreated,
                            detail: format!("Task created: {title}"),
                        });
                    }

                    // Link to project if workspace_path is set
                    if let Some(ws_path) = ws_path_opt {
                        let norm = normalize_project_path(&ws_path);
                        if !norm.is_empty() {
                            let p_id = project_node_id(&norm);
                            edges.insert((task_node_id.clone(), p_id, EdgeKind::ProjectTask));
                        }
                    }

                    // Task completed event
                    if let Some(comp_time) = completed_at {
                        events.push(Event {
                            id: format!("event:task_completed:{task_id}"),
                            ts: comp_time,
                            source_id: "hermes".into(),
                            node_id: Some(task_node_id),
                            kind: EventKind::TaskCompleted,
                            detail: format!("Task completed: {title}"),
                        });
                    }
                }
            }
        }

        // Read task links
        if let Ok(mut stmt) = conn.prepare("SELECT parent_id, child_id FROM task_links") {
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            });

            if let Ok(rows) = rows {
                for r in rows.flatten() {
                    let parent_node = format!("hermes:task:{}", r.0);
                    let child_node = format!("hermes:task:{}", r.1);
                    edges.insert((parent_node, child_node, EdgeKind::TaskLink));
                }
            }
        }
    }

    fn ingest_skills_tree(
        &self,
        skills_root: &Path,
        nodes: &mut HashMap<NodeId, Node>,
        edges: &mut HashSet<(NodeId, NodeId, EdgeKind)>,
        seen: &mut HashSet<PathBuf>,
        items_scanned: &mut usize,
        warnings: &mut Vec<AdapterWarning>,
    ) {
        let walker = walkdir::WalkDir::new(skills_root)
            .max_depth(5)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                // Exclude source repositories and vendor dependencies
                name != "hermes-agent"
                    && name != "tools"
                    && name != "cache"
                    && name != "node_modules"
                    && name != ".git"
                    && name != ".venv"
            });

        for entry in walker.flatten() {
            let path = entry.path();
            if path.is_file() && path.file_name().and_then(|n| n.to_str()) == Some("SKILL.md") {
                if !seen.insert(path.to_path_buf()) {
                    continue;
                }

                *items_scanned += 1;
                let meta = match fs::metadata(path) {
                    Ok(m) => m,
                    Err(_) => continue,
                };

                if meta.len() > 5 * 1024 * 1024 {
                    warnings.push(AdapterWarning {
                        code: "FILE_OVER_5MB".into(),
                        message: format!("Skipped skill file over 5 MB: {:?}", path),
                        path: Some(path.to_string_lossy().to_string()),
                    });
                    continue;
                }

                let mut buf = vec![0u8; 256 * 1024];
                let bytes_read = match File::open(path).and_then(|mut f| f.read(&mut buf)) {
                    Ok(n) => n,
                    Err(_) => continue,
                };
                let content_str = String::from_utf8_lossy(&buf[..bytes_read]);

                let (frontmatter, body) = parse_frontmatter(&content_str);

                let default_name = path
                    .parent()
                    .and_then(|p| p.file_name())
                    .and_then(|n| n.to_str())
                    .unwrap_or("skill")
                    .to_string();

                let skill_name = frontmatter
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or(&default_name)
                    .to_string();

                let desc = frontmatter
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or_else(|| body.lines().next().unwrap_or(""));

                let skill_node_id = format!("hermes:skill:{}", skill_name);

                nodes.insert(
                    skill_node_id.clone(),
                    Node {
                        id: skill_node_id.clone(),
                        source_id: "hermes".into(),
                        kind: NodeKind::Skill,
                        title: skill_name.clone(),
                        body_preview: redact_and_truncate(desc, 300),
                        path: Some(path.to_string_lossy().to_string()),
                        tags: vec!["skill".into(), "hermes".into()],
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
                        metadata: serde_json::json!({
                            "skill_name": skill_name,
                        }),
                    },
                );

                // Topic nodes from category (First-class Category topic)
                let category_opt = frontmatter
                    .get("category")
                    .and_then(|v| v.as_str())
                    .or_else(|| {
                        frontmatter
                            .get("metadata")
                            .and_then(|m| m.get("hermes"))
                            .and_then(|h| h.get("category"))
                            .and_then(|v| v.as_str())
                    })
                    .map(|s| s.to_string())
                    .or_else(|| {
                        // Extract category from folder structure under skills directory
                        if let Ok(rel) = path.strip_prefix(skills_root) {
                            let comps: Vec<_> = rel.components().collect();
                            if comps.len() > 1 {
                                Some(comps[0].as_os_str().to_string_lossy().to_string())
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    });

                if let Some(cat) = category_opt {
                    let topic_id = format!("topic:{}", cat);
                    nodes.entry(topic_id.clone()).or_insert_with(|| Node {
                        id: topic_id.clone(),
                        source_id: "shared".into(),
                        kind: NodeKind::Topic,
                        title: cat.to_string(),
                        body_preview: format!("Skill category: {cat}"),
                        path: None,
                        tags: vec!["topic".into(), "category".into()],
                        created_at: None,
                        modified_at: None,
                        last_active_at: None,
                        access_count: 1,
                        pinned: false,
                        degree: 0,
                        importance: 0.5,
                        freshness: 0.8,
                        is_ambient: true,
                        is_generic_root: false,
                        timestamp_source: None,
                        subkind: Some("category".into()),
                        hidden_by_default: false,
                        metadata: Value::Null,
                    });

                    edges.insert((skill_node_id.clone(), topic_id, EdgeKind::SkillTopic));
                }

                // Topic nodes from metadata.hermes.tags (Demoted to Tag topic, hidden by default)
                if let Some(meta_obj) = frontmatter.get("metadata").and_then(|v| v.as_object()) {
                    if let Some(hermes_val) = meta_obj.get("hermes").and_then(|v| v.as_object()) {
                        if let Some(tags_val) = hermes_val.get("tags").and_then(|v| v.as_array()) {
                            for tag_val in tags_val {
                                if let Some(tag_str) = tag_val.as_str() {
                                    let topic_id = format!("topic:{}", tag_str.to_lowercase());
                                    nodes.entry(topic_id.clone()).or_insert_with(|| Node {
                                        id: topic_id.clone(),
                                        source_id: "shared".into(),
                                        kind: NodeKind::Topic,
                                        title: tag_str.to_string(),
                                        body_preview: format!("Topic: {tag_str}"),
                                        path: None,
                                        tags: vec!["topic".into(), "tag".into()],
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
                                        subkind: Some("tag".into()),
                                        hidden_by_default: true,
                                        metadata: Value::Null,
                                    });

                                    edges.insert((skill_node_id.clone(), topic_id, EdgeKind::SkillTopic));
                                }
                            }
                        }

                        // Related skills
                        if let Some(related_val) = hermes_val.get("related_skills").and_then(|v| v.as_array()) {
                            for r_val in related_val {
                                if let Some(rel_name) = r_val.as_str() {
                                    let rel_id = format!("hermes:skill:{}", rel_name);
                                    edges.insert((skill_node_id.clone(), rel_id, EdgeKind::RelatedSkill));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    fn ingest_memory_file(
        &self,
        path: &Path,
        filename: &str,
        nodes: &mut HashMap<NodeId, Node>,
        warnings: &mut Vec<AdapterWarning>,
    ) {
        let meta = match fs::metadata(path) {
            Ok(m) => m,
            Err(_) => return,
        };

        if meta.len() > 5 * 1024 * 1024 {
            warnings.push(AdapterWarning {
                code: "FILE_OVER_5MB".into(),
                message: format!("Skipped memory file larger than 5 MB: {:?}", path),
                path: Some(path.to_string_lossy().to_string()),
            });
            return;
        }

        let mtime = meta.modified().ok().map(DateTime::<Utc>::from);
        if let Ok(raw) = fs::read_to_string(path) {
            // Split on delimiter "\n§\n"
            let entries: Vec<&str> = raw.split("\n§\n").map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
            for (idx, entry) in entries.iter().enumerate() {
                let mem_id = format!("hermes:memory:{}:{}", filename, idx);
                let preview = redact_and_truncate(entry, 300);

                nodes.insert(
                    mem_id.clone(),
                    Node {
                        id: mem_id,
                        source_id: "hermes".into(),
                        kind: NodeKind::Memory,
                        title: format!("{} #{}", filename, idx + 1),
                        body_preview: preview,
                        path: Some(path.to_string_lossy().to_string()),
                        tags: vec!["memory".into(), "hermes".into()],
                        created_at: mtime,
                        modified_at: mtime,
                        last_active_at: mtime,
                        access_count: 1,
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
                            "index": idx,
                            "file": filename,
                        }),
                    },
                );
            }
        }
    }
}
