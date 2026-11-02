use chrono::{DateTime, Utc};
use cortex_model::{
    AdapterHealth, AdapterWarning, Edge, EdgeKind, HealthStatus, Node, NodeKind, NodeId,
};
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::Read;
use std::path::PathBuf;
use std::time::Instant;

use crate::antigravity::parse_frontmatter;
use crate::redaction::redact_and_truncate;

pub struct MarkdownVaultOutput {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub health: AdapterHealth,
}

pub struct MarkdownVaultAdapter {
    pub vault_dir: PathBuf,
    pub source_id: String,
}

impl MarkdownVaultAdapter {
    pub fn new(vault_dir: PathBuf, source_id: Option<String>) -> Self {
        Self {
            vault_dir,
            source_id: source_id.unwrap_or_else(|| "markdown_vault".into()),
        }
    }

    pub fn scan(&self) -> MarkdownVaultOutput {
        let start_time = Instant::now();
        let mut warnings = Vec::new();
        let mut nodes: HashMap<NodeId, Node> = HashMap::new();
        let mut edges: HashSet<(NodeId, NodeId, EdgeKind)> = HashSet::new();
        let mut items_scanned = 0;

        if !self.vault_dir.exists() {
            return MarkdownVaultOutput {
                nodes: Vec::new(),
                edges: Vec::new(),
                health: AdapterHealth {
                    source_id: self.source_id.clone(),
                    name: "Markdown Vault".into(),
                    status: HealthStatus::Missing,
                    version: None,
                    base_path: Some(self.vault_dir.to_string_lossy().to_string()),
                    warnings: vec![AdapterWarning {
                        code: "DIR_NOT_FOUND".into(),
                        message: format!("Directory does not exist: {:?}", self.vault_dir),
                        path: Some(self.vault_dir.to_string_lossy().to_string()),
                    }],
                    items_scanned: 0,
                    scan_duration_ms: start_time.elapsed().as_millis() as u64,
                },
            };
        }

        let wikilink_re = Regex::new(r"\[\[([^\]\|]+)(?:\|[^\]]+)?\]\]").unwrap();

        let walker = walkdir::WalkDir::new(&self.vault_dir)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                name != ".obsidian"
                    && name != ".git"
                    && name != "node_modules"
                    && name != ".venv"
            });

        for entry in walker.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("md") {
                items_scanned += 1;
                let meta = match fs::metadata(path) {
                    Ok(m) => m,
                    Err(_) => continue,
                };

                if meta.len() > 5 * 1024 * 1024 {
                    warnings.push(AdapterWarning {
                        code: "FILE_OVER_5MB".into(),
                        message: format!("Skipped file over 5 MB: {:?}", path),
                        path: Some(path.to_string_lossy().to_string()),
                    });
                    continue;
                }

                let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("note");
                let node_id = format!("{}:{}", self.source_id, stem);

                let mut buf = vec![0u8; 256 * 1024];
                let bytes_read = match File::open(path).and_then(|mut f| f.read(&mut buf)) {
                    Ok(n) => n,
                    Err(_) => continue,
                };
                let content_str = String::from_utf8_lossy(&buf[..bytes_read]);

                let (frontmatter, body) = parse_frontmatter(&content_str);

                let title = frontmatter
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or(stem)
                    .to_string();

                let mtime = meta.modified().ok().map(DateTime::<Utc>::from);
                let preview = redact_and_truncate(body, 300);

                // Extract [[wikilinks]]
                for cap in wikilink_re.captures_iter(&content_str) {
                    let target_stem = cap.get(1).map(|m| m.as_str().trim()).unwrap_or("");
                    if !target_stem.is_empty() {
                        let target_id = format!("{}:{}", self.source_id, target_stem);
                        edges.insert((node_id.clone(), target_id, EdgeKind::Wikilink));
                    }
                }

                nodes.insert(
                    node_id.clone(),
                    Node {
                        id: node_id,
                        source_id: self.source_id.clone(),
                        kind: NodeKind::Artifact,
                        title,
                        body_preview: preview,
                        path: Some(path.to_string_lossy().to_string()),
                        tags: vec!["markdown".into()],
                        created_at: mtime,
                        modified_at: mtime,
                        last_active_at: mtime,
                        access_count: 1,
                        pinned: false,
                        degree: 0,
                        importance: 0.5,
                        freshness: 0.8,
                        metadata: serde_json::Value::Null,
                    },
                );
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
            source_id: self.source_id.clone(),
            name: "Markdown Vault".into(),
            status: if warnings.is_empty() {
                HealthStatus::Ok
            } else {
                HealthStatus::Degraded
            },
            version: None,
            base_path: Some(self.vault_dir.to_string_lossy().to_string()),
            warnings,
            items_scanned,
            scan_duration_ms: start_time.elapsed().as_millis() as u64,
        };

        MarkdownVaultOutput {
            nodes: node_list,
            edges: edge_list,
            health,
        }
    }
}
