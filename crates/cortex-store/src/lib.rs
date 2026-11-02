use chrono::{DateTime, Utc};
use cortex_model::{
    AdapterHealth, AdapterWarning, Edge, EdgeKind, Event, EventKind, GraphSnapshot, HealthStatus,
    Node, NodeKind, ScanStats, TimestampStats,
};
use rusqlite::{params, Connection, Result};
use std::fs;
use std::path::PathBuf;

pub struct CortexStore {
    db_path: PathBuf,
}

impl CortexStore {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        if let Some(parent) = db_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let store = Self { db_path };
        store.init_tables()?;
        Ok(store)
    }

    /// Resolves the default Cortex database file located strictly in the OS user app data directory.
    pub fn default_path() -> PathBuf {
        let base = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("com.cortex.app");
        let _ = fs::create_dir_all(&base);
        base.join("cortex-store.db")
    }

    fn open_connection(&self) -> Result<Connection> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA busy_timeout = 5000;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;",
        )?;
        Ok(conn)
    }

    fn init_tables(&self) -> Result<()> {
        let conn = self.open_connection()?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sources (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT NOT NULL,
                version TEXT,
                base_path TEXT,
                warnings_json TEXT NOT NULL DEFAULT '[]',
                items_scanned INTEGER NOT NULL DEFAULT 0,
                scan_duration_ms INTEGER NOT NULL DEFAULT 0,
                last_scanned_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS nodes (
                id TEXT PRIMARY KEY,
                source_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                body_preview TEXT NOT NULL DEFAULT '',
                path TEXT,
                tags_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT,
                modified_at TEXT,
                last_active_at TEXT,
                access_count INTEGER NOT NULL DEFAULT 0,
                pinned INTEGER NOT NULL DEFAULT 0,
                degree INTEGER NOT NULL DEFAULT 0,
                importance REAL NOT NULL DEFAULT 0.0,
                freshness REAL NOT NULL DEFAULT 0.0,
                metadata_json TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS edges (
                from_id TEXT NOT NULL,
                to_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                weight REAL NOT NULL DEFAULT 1.0,
                PRIMARY KEY (from_id, to_id, kind)
            );

            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                ts TEXT NOT NULL,
                source_id TEXT NOT NULL,
                node_id TEXT,
                kind TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS scan_cache (
                path TEXT PRIMARY KEY,
                mtime INTEGER NOT NULL,
                size INTEGER NOT NULL,
                hash TEXT NOT NULL
            );",
        )?;
        Ok(())
    }

    pub fn save_snapshot(&self, snapshot: &GraphSnapshot) -> Result<()> {
        let mut conn = self.open_connection()?;
        let tx = conn.transaction()?;

        // Upsert sources
        for s in &snapshot.sources {
            let warnings_json = serde_json::to_string(&s.warnings).unwrap_or_else(|_| "[]".into());
            let status_str = match s.status {
                HealthStatus::Ok => "ok",
                HealthStatus::Degraded => "degraded",
                HealthStatus::Missing => "missing",
            };

            tx.execute(
                "INSERT INTO sources (id, name, status, version, base_path, warnings_json, items_scanned, scan_duration_ms, last_scanned_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    status = excluded.status,
                    version = excluded.version,
                    base_path = excluded.base_path,
                    warnings_json = excluded.warnings_json,
                    items_scanned = excluded.items_scanned,
                    scan_duration_ms = excluded.scan_duration_ms,
                    last_scanned_at = excluded.last_scanned_at",
                params![
                    s.source_id,
                    s.name,
                    status_str,
                    s.version,
                    s.base_path,
                    warnings_json,
                    s.items_scanned as i64,
                    s.scan_duration_ms as i64,
                    Utc::now().to_rfc3339()
                ],
            )?;
        }

        // Upsert nodes
        for n in &snapshot.nodes {
            let tags_json = serde_json::to_string(&n.tags).unwrap_or_else(|_| "[]".into());
            let metadata_json = serde_json::to_string(&n.metadata).unwrap_or_else(|_| "{}".into());
            let kind_str = serde_json::to_string(&n.kind)
                .unwrap_or_else(|_| "\"other\"".into())
                .replace('"', "");

            tx.execute(
                "INSERT INTO nodes (id, source_id, kind, title, body_preview, path, tags_json, created_at, modified_at, last_active_at, access_count, pinned, degree, importance, freshness, metadata_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
                 ON CONFLICT(id) DO UPDATE SET
                    source_id = excluded.source_id,
                    kind = excluded.kind,
                    title = excluded.title,
                    body_preview = excluded.body_preview,
                    path = excluded.path,
                    tags_json = excluded.tags_json,
                    created_at = excluded.created_at,
                    modified_at = excluded.modified_at,
                    last_active_at = excluded.last_active_at,
                    access_count = excluded.access_count,
                    pinned = excluded.pinned,
                    degree = excluded.degree,
                    importance = excluded.importance,
                    freshness = excluded.freshness,
                    metadata_json = excluded.metadata_json",
                params![
                    n.id,
                    n.source_id,
                    kind_str,
                    n.title,
                    n.body_preview,
                    n.path,
                    tags_json,
                    n.created_at.map(|t| t.to_rfc3339()),
                    n.modified_at.map(|t| t.to_rfc3339()),
                    n.last_active_at.map(|t| t.to_rfc3339()),
                    n.access_count as i64,
                    if n.pinned { 1 } else { 0 },
                    n.degree as i64,
                    n.importance,
                    n.freshness,
                    metadata_json
                ],
            )?;
        }

        // Upsert edges
        for e in &snapshot.edges {
            let kind_str = serde_json::to_string(&e.kind)
                .unwrap_or_else(|_| "\"wikilink\"".into())
                .replace('"', "");

            tx.execute(
                "INSERT INTO edges (from_id, to_id, kind, weight)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(from_id, to_id, kind) DO UPDATE SET weight = excluded.weight",
                params![e.from, e.to, kind_str, e.weight],
            )?;
        }

        // Upsert events
        for ev in &snapshot.events {
            let kind_str = serde_json::to_string(&ev.kind)
                .unwrap_or_else(|_| "\"other\"".into())
                .replace('"', "");

            tx.execute(
                "INSERT INTO events (id, ts, source_id, node_id, kind, detail)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET detail = excluded.detail",
                params![
                    ev.id,
                    ev.ts.to_rfc3339(),
                    ev.source_id,
                    ev.node_id,
                    kind_str,
                    ev.detail
                ],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    pub fn get_snapshot(&self) -> Result<GraphSnapshot> {
        let conn = self.open_connection()?;

        // 1. Nodes
        let mut n_stmt = conn.prepare(
            "SELECT id, source_id, kind, title, body_preview, path, tags_json, created_at, modified_at, 
                    last_active_at, access_count, pinned, degree, importance, freshness, metadata_json 
             FROM nodes",
        )?;

        let node_rows = n_stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let source_id: String = row.get(1)?;
            let kind_str: String = row.get(2)?;
            let title: String = row.get(3)?;
            let body_preview: String = row.get(4)?;
            let path: Option<String> = row.get(5)?;
            let tags_json: String = row.get(6)?;
            let created_str: Option<String> = row.get(7)?;
            let modified_str: Option<String> = row.get(8)?;
            let last_active_str: Option<String> = row.get(9)?;
            let access_count: i64 = row.get(10)?;
            let pinned: i64 = row.get(11)?;
            let degree: i64 = row.get(12)?;
            let importance: f64 = row.get(13)?;
            let freshness: f64 = row.get(14)?;
            let metadata_json: String = row.get(15)?;

            let kind = serde_json::from_str::<NodeKind>(&format!("\"{kind_str}\""))
                .unwrap_or(NodeKind::Artifact);
            let tags = serde_json::from_str::<Vec<String>>(&tags_json).unwrap_or_default();
            let metadata = serde_json::from_str::<serde_json::Value>(&metadata_json)
                .unwrap_or(serde_json::Value::Null);

            let created_at = created_str.and_then(|s| DateTime::parse_from_rfc3339(&s).ok().map(|t| t.with_timezone(&Utc)));
            let modified_at = modified_str.and_then(|s| DateTime::parse_from_rfc3339(&s).ok().map(|t| t.with_timezone(&Utc)));
            let last_active_at = last_active_str.and_then(|s| DateTime::parse_from_rfc3339(&s).ok().map(|t| t.with_timezone(&Utc)));

            Ok(Node {
                id,
                source_id,
                kind,
                title,
                body_preview,
                path,
                tags,
                created_at,
                modified_at,
                last_active_at,
                access_count: access_count as u32,
                pinned: pinned != 0,
                degree: degree as u32,
                importance: importance as f32,
                freshness: freshness as f32,
                metadata,
            })
        })?;

        let nodes: Vec<Node> = node_rows.flatten().collect();

        // 2. Edges
        let mut e_stmt = conn.prepare("SELECT from_id, to_id, kind, weight FROM edges")?;
        let edge_rows = e_stmt.query_map([], |row| {
            let from: String = row.get(0)?;
            let to: String = row.get(1)?;
            let kind_str: String = row.get(2)?;
            let weight: f64 = row.get(3)?;
            let kind = serde_json::from_str::<EdgeKind>(&format!("\"{kind_str}\""))
                .unwrap_or(EdgeKind::Wikilink);

            Ok(Edge {
                from,
                to,
                kind,
                weight: weight as f32,
            })
        })?;

        let edges: Vec<Edge> = edge_rows.flatten().collect();

        // 3. Events
        let mut ev_stmt = conn.prepare("SELECT id, ts, source_id, node_id, kind, detail FROM events ORDER BY ts DESC LIMIT 500")?;
        let event_rows = ev_stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let ts_str: String = row.get(1)?;
            let source_id: String = row.get(2)?;
            let node_id: Option<String> = row.get(3)?;
            let kind_str: String = row.get(4)?;
            let detail: String = row.get(5)?;

            let ts = DateTime::parse_from_rfc3339(&ts_str)
                .map(|t| t.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());
            let kind = serde_json::from_str::<EventKind>(&format!("\"{kind_str}\""))
                .unwrap_or(EventKind::MessageSent);

            Ok(Event {
                id,
                ts,
                source_id,
                node_id,
                kind,
                detail,
            })
        })?;

        let events: Vec<Event> = event_rows.flatten().collect();

        // 4. Sources
        let mut s_stmt = conn.prepare(
            "SELECT id, name, status, version, base_path, warnings_json, items_scanned, scan_duration_ms 
             FROM sources",
        )?;

        let source_rows = s_stmt.query_map([], |row| {
            let source_id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let status_str: String = row.get(2)?;
            let version: Option<String> = row.get(3)?;
            let base_path: Option<String> = row.get(4)?;
            let warnings_json: String = row.get(5)?;
            let items_scanned: i64 = row.get(6)?;
            let scan_duration_ms: i64 = row.get(7)?;

            let status = match status_str.as_str() {
                "ok" => HealthStatus::Ok,
                "degraded" => HealthStatus::Degraded,
                _ => HealthStatus::Missing,
            };

            let warnings = serde_json::from_str::<Vec<AdapterWarning>>(&warnings_json).unwrap_or_default();

            Ok(AdapterHealth {
                source_id,
                name,
                status,
                version,
                base_path,
                warnings,
                items_scanned: items_scanned as usize,
                scan_duration_ms: scan_duration_ms as u64,
            })
        })?;

        let sources: Vec<AdapterHealth> = source_rows.flatten().collect();

        // 5. Shared projects
        let mut shared_projects = Vec::new();
        for n in &nodes {
            if n.kind == NodeKind::Project && n.source_id == "shared" {
                shared_projects.push(n.title.clone());
            }
        }

        // 6. Timestamp stats
        let mut real_ts = 0;
        let mut fallback_ts = 0;
        let mut earliest = None;
        let mut latest = None;

        for n in &nodes {
            if let Some(ts) = n.created_at.or(n.last_active_at) {
                if n.kind == NodeKind::Conversation
                    || n.kind == NodeKind::Session
                    || n.kind == NodeKind::Task
                {
                    real_ts += 1;
                } else {
                    fallback_ts += 1;
                }

                if earliest.is_none() || Some(ts) < earliest {
                    earliest = Some(ts);
                }
                if latest.is_none() || Some(ts) > latest {
                    latest = Some(ts);
                }
            } else {
                fallback_ts += 1;
            }
        }

        Ok(GraphSnapshot {
            nodes,
            edges,
            events,
            sources,
            timestamp_stats: TimestampStats {
                real_timestamp_count: real_ts,
                fallback_timestamp_count: fallback_ts,
                earliest_date: earliest,
                latest_date: latest,
            },
            shared_projects,
        })
    }

    pub fn get_stats(&self) -> Result<ScanStats> {
        let conn = self.open_connection()?;
        let nodes_count: i64 = conn.query_row("SELECT count(*) FROM nodes", [], |r| r.get(0))?;
        let edges_count: i64 = conn.query_row("SELECT count(*) FROM edges", [], |r| r.get(0))?;
        let events_count: i64 = conn.query_row("SELECT count(*) FROM events", [], |r| r.get(0))?;
        let sources_count: i64 = conn.query_row("SELECT count(*) FROM sources", [], |r| r.get(0))?;

        Ok(ScanStats {
            nodes_count: nodes_count as usize,
            edges_count: edges_count as usize,
            events_count: events_count as usize,
            sources_count: sources_count as usize,
            duration_ms: 0,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_store_roundtrip() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test-store.db");
        let store = CortexStore::new(db_path).unwrap();

        let node = Node {
            id: "node:1".into(),
            source_id: "test".into(),
            kind: NodeKind::Project,
            title: "Test Project".into(),
            body_preview: "A test project".into(),
            path: Some("C:\\test".into()),
            tags: vec!["test".into()],
            created_at: Some(Utc::now()),
            modified_at: Some(Utc::now()),
            last_active_at: Some(Utc::now()),
            access_count: 5,
            pinned: true,
            degree: 2,
            importance: 1.0,
            freshness: 0.9,
            metadata: serde_json::json!({"custom": "value"}),
        };

        let edge = Edge {
            from: "node:1".into(),
            to: "node:2".into(),
            kind: EdgeKind::Contains,
            weight: 1.0,
        };

        let snapshot = GraphSnapshot {
            nodes: vec![node],
            edges: vec![edge],
            events: vec![],
            sources: vec![],
            timestamp_stats: TimestampStats::default(),
            shared_projects: vec![],
        };

        store.save_snapshot(&snapshot).unwrap();
        let loaded = store.get_snapshot().unwrap();

        assert_eq!(loaded.nodes.len(), 1);
        assert_eq!(loaded.nodes[0].title, "Test Project");
        assert_eq!(loaded.edges.len(), 1);
    }
}
