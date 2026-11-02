pub mod antigravity;
pub mod hermes;
pub mod markdown_vault;
pub mod path_norm;
pub mod redaction;
pub mod sqlite_helpers;

use cortex_model::{
    AdapterHealth, Edge, Event, GraphSnapshot, Node, NodeKind, TimestampStats,
};
use std::collections::HashMap;

/// Orchestrates scanning across all discovered agents and data sources,
/// performing cross-agent project merging and tool frequency capping.
pub fn scan_all_sources(
    custom_hermes_home: Option<std::path::PathBuf>,
    custom_antigravity_dir: Option<std::path::PathBuf>,
    vault_dirs: Vec<std::path::PathBuf>,
) -> GraphSnapshot {
    let mut all_nodes: HashMap<String, Node> = HashMap::new();
    let mut all_edges: Vec<Edge> = Vec::new();
    let mut all_events: Vec<Event> = Vec::new();
    let mut all_sources: Vec<AdapterHealth> = Vec::new();

    // 1. Scan Antigravity
    let ag_path = custom_antigravity_dir.or_else(antigravity::AntigravityAdapter::default_path);
    if let Some(path) = ag_path {
        let ag_adapter = antigravity::AntigravityAdapter::new(path);
        let out = ag_adapter.scan();
        for node in out.nodes {
            all_nodes.entry(node.id.clone()).or_insert(node);
        }
        all_edges.extend(out.edges);
        all_events.extend(out.events);
        all_sources.push(out.health);
    }

    // 2. Scan Hermes
    let hermes_path = custom_hermes_home.or_else(hermes::HermesAdapter::resolve_home);
    if let Some(path) = hermes_path {
        let hermes_adapter = hermes::HermesAdapter::new(path);
        let out = hermes_adapter.scan();
        for node in out.nodes {
            all_nodes.entry(node.id.clone()).or_insert(node);
        }
        all_edges.extend(out.edges);
        all_events.extend(out.events);
        all_sources.push(out.health);
    }

    // 3. Scan Optional Markdown Vaults
    for (idx, vdir) in vault_dirs.into_iter().enumerate() {
        let v_adapter = markdown_vault::MarkdownVaultAdapter::new(
            vdir,
            Some(format!("vault_{}", idx + 1)),
        );
        let out = v_adapter.scan();
        for node in out.nodes {
            all_nodes.entry(node.id.clone()).or_insert(node);
        }
        all_edges.extend(out.edges);
        all_sources.push(out.health);
    }

    // 4. Cross-Agent Project Merging & Shared Project Detection
    // Check which projects are connected to edges from multiple agents
    let mut project_agent_sources: HashMap<String, std::collections::HashSet<String>> = HashMap::new();
    for edge in &all_edges {
        if edge.to.starts_with("project:") {
            if let Some(from_node) = all_nodes.get(&edge.from) {
                project_agent_sources
                    .entry(edge.to.clone())
                    .or_default()
                    .insert(from_node.source_id.clone());
            }
        }
    }

    let mut shared_projects = Vec::new();
    for (proj_id, sources) in project_agent_sources {
        if sources.len() > 1 || sources.contains("shared") {
            if let Some(node) = all_nodes.get_mut(&proj_id) {
                node.source_id = "shared".into();
                // Exclude generic roots from shared star count
                if !node.is_generic_root {
                    shared_projects.push(node.title.clone());
                }
            }
        }
    }

    // 5. Cap Tools to Top 50 by Usage
    let mut tool_usage_counts: HashMap<String, usize> = HashMap::new();
    for edge in &all_edges {
        if edge.to.starts_with("tool:") {
            *tool_usage_counts.entry(edge.to.clone()).or_default() += 1;
        }
    }

    let mut sorted_tools: Vec<(String, usize)> = tool_usage_counts.into_iter().collect();
    sorted_tools.sort_by_key(|a| std::cmp::Reverse(a.1));

    let allowed_tools: std::collections::HashSet<String> = sorted_tools
        .into_iter()
        .take(50)
        .map(|(id, _)| id)
        .collect();

    // Retain only allowed tools and remove edges to dropped tools
    all_nodes.retain(|id, node| {
        if node.kind == NodeKind::Tool {
            allowed_tools.contains(id)
        } else {
            true
        }
    });

    all_edges.retain(|e| {
        if e.to.starts_with("tool:") {
            allowed_tools.contains(&e.to)
        } else {
            true
        }
    });

    // 6. Compute Timestamp Statistics
    let mut real_ts_count = 0;
    let mut fallback_ts_count = 0;
    let mut earliest = None;
    let mut latest = None;

    for node in all_nodes.values() {
        if node.is_ambient {
            continue; // Ambient nodes (Skill, Topic, Tool) are static installed items; do not pollute timeline
        }
        if let Some(ts) = node.created_at.or(node.last_active_at) {
            if node.timestamp_source.as_deref() != Some("mtime") && node.timestamp_source.is_some() {
                real_ts_count += 1;
            } else {
                fallback_ts_count += 1;
            }

            if earliest.is_none() || Some(ts) < earliest {
                earliest = Some(ts);
            }
            if latest.is_none() || Some(ts) > latest {
                latest = Some(ts);
            }
        } else {
            fallback_ts_count += 1;
        }
    }

    let timestamp_stats = TimestampStats {
        real_timestamp_count: real_ts_count,
        fallback_timestamp_count: fallback_ts_count,
        earliest_date: earliest,
        latest_date: latest,
    };

    GraphSnapshot {
        nodes: all_nodes.into_values().collect(),
        edges: all_edges,
        events: all_events,
        sources: all_sources,
        timestamp_stats,
        shared_projects,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cortex_model::HealthStatus;
    use tempfile::tempdir;

    #[test]
    fn test_missing_directory_graceful_health() {
        let fake_path = std::path::PathBuf::from(r"C:\fake_nonexistent_directory_cortex_test");
        let adapter = antigravity::AntigravityAdapter::new(fake_path);
        let out = adapter.scan();
        assert_eq!(out.health.status, HealthStatus::Missing);
        assert!(!out.health.warnings.is_empty());
    }

    #[test]
    fn test_empty_database_handling() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("empty.db");
        {
            let _conn = rusqlite::Connection::open(&db_path).unwrap();
        }
        let res = sqlite_helpers::open_readonly_sqlite(&db_path);
        assert!(res.is_ok());
    }

    #[test]
    fn test_malformed_frontmatter_graceful() {
        let raw = "---\nthis is not valid yaml: [[\n---\nBody here";
        let (fm, body) = antigravity::parse_frontmatter(raw);
        assert!(fm.is_empty());
        assert_eq!(body, raw);
    }

    #[test]
    fn test_ambient_node_timestamps_are_none() {
        let snapshot = scan_all_sources(None, None, vec![]);
        for node in &snapshot.nodes {
            if node.is_ambient {
                assert!(node.created_at.is_none(), "Ambient node {} has created_at", node.id);
                assert!(node.last_active_at.is_none(), "Ambient node {} has last_active_at", node.id);
                assert!(node.modified_at.is_none(), "Ambient node {} has modified_at", node.id);
            }
        }
    }

    #[test]
    fn test_soul_is_persona_not_memory() {
        let dir = tempdir().unwrap();
        // Create SOUL.md
        std::fs::write(dir.path().join("SOUL.md"), "# Hermes Soul\nIdentity").unwrap();
        // Create empty memories folder
        let mem_dir = dir.path().join("memories");
        std::fs::create_dir_all(&mem_dir).unwrap();
        std::fs::write(mem_dir.join("MEMORY.md"), "").unwrap();

        let adapter = hermes::HermesAdapter::new(dir.path().to_path_buf());
        let out = adapter.scan();

        let soul_node = out.nodes.iter().find(|n| n.id == "hermes:soul");
        assert!(soul_node.is_some(), "hermes:soul node must exist");
        let soul = soul_node.unwrap();
        assert_eq!(soul.kind, NodeKind::Persona, "SOUL.md must be classified as Persona, not Memory");
        assert!(soul.is_ambient, "SOUL.md must be ambient");
        assert_eq!(soul.subkind.as_deref(), Some("persona"));
        assert!(soul.timestamp_source.is_none());

        let memory_nodes: Vec<_> = out.nodes.iter().filter(|n| n.kind == NodeKind::Memory).collect();
        assert_eq!(memory_nodes.len(), 0, "Expected exactly 0 Memory nodes when memory files are empty");
    }

    #[test]
    fn test_csp_and_capabilities_configuration() {
        // Read tauri.conf.json
        let conf_str = std::fs::read_to_string("../../src-tauri/tauri.conf.json")
            .or_else(|_| std::fs::read_to_string("src-tauri/tauri.conf.json"))
            .expect("Failed to read tauri.conf.json");
        let conf: serde_json::Value = serde_json::from_str(&conf_str).expect("Valid JSON");
        let csp = conf["app"]["security"]["csp"].as_str().expect("CSP string present");
        assert!(csp.contains("default-src 'self'"), "CSP must enforce default-src 'self'");
        assert!(!csp.contains("https://"), "CSP must not allow external HTTPS domains");

        // Read default.json capabilities
        let cap_str = std::fs::read_to_string("../../src-tauri/capabilities/default.json")
            .or_else(|_| std::fs::read_to_string("src-tauri/capabilities/default.json"))
            .expect("Failed to read capabilities/default.json");
        let cap: serde_json::Value = serde_json::from_str(&cap_str).expect("Valid JSON");
        let windows = cap["windows"].as_array().expect("windows array");
        assert_eq!(windows, &vec![serde_json::Value::String("main".into())], "Capabilities must be tightened to main window only (no wildcard)");
    }
}
