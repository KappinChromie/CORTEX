use cortex_adapters::scan_all_sources;
use cortex_graph::process_graph;
use cortex_model::GraphSnapshot;
use cortex_store::CortexStore;
use serde_json::json;
use std::collections::BTreeMap;
use std::time::Instant;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let is_scan = args.iter().any(|a| a == "scan");
    let is_json = args.iter().any(|a| a == "--json" || a == "-j");

    if !is_scan && args.len() > 1 && args[1] != "--help" && args[1] != "-h" {
        eprintln!("Unknown command. Usage: cortex-cli scan [--json]");
        std::process::exit(1);
    }

    if args.iter().any(|a| a == "--help" || a == "-h") {
        println!("Cortex CLI — Agent Brain Observatory\n");
        println!("USAGE:");
        println!("    cortex-cli scan [--json]    Scan all agent memories and build graph\n");
        println!("OPTIONS:");
        println!("    --json, -j                  Output scan results as JSON");
        println!("    --help, -h                  Print help information");
        return;
    }

    let start = Instant::now();
    // Execute discovery and scan across Antigravity, Hermes, and optional vaults
    let raw_snapshot = scan_all_sources(None, None, vec![]);
    let enriched = process_graph(raw_snapshot);
    // Persist to store in app data directory
    let store_path = CortexStore::default_path();
    if let Ok(store) = CortexStore::new(store_path.clone()) {
        let _ = store.save_snapshot(&enriched.snapshot);
    }

    // Also write to ui/public/snapshot.json if present for web preview fallback
    let public_dir = std::path::Path::new("ui/public");
    if public_dir.exists() {
        if let Ok(json_str) = serde_json::to_string(&enriched) {
            let _ = std::fs::write(public_dir.join("snapshot.json"), json_str);
        }
    }

    let snapshot = enriched.snapshot;

    let duration_ms = start.elapsed().as_millis() as u64;

    if is_json {
        print_json_output(&snapshot, duration_ms);
    } else {
        print_human_output(&snapshot, duration_ms, &store_path);
    }
}

fn print_json_output(snapshot: &GraphSnapshot, duration_ms: u64) {
    let mut nodes_by_kind: BTreeMap<String, usize> = BTreeMap::new();
    for node in &snapshot.nodes {
        *nodes_by_kind.entry(node.kind.to_string()).or_default() += 1;
    }

    let mut edges_by_kind: BTreeMap<String, usize> = BTreeMap::new();
    for edge in &snapshot.edges {
        *edges_by_kind.entry(edge.kind.to_string()).or_default() += 1;
    }

    let output = json!({
        "scan_duration_ms": duration_ms,
        "total_nodes": snapshot.nodes.len(),
        "total_edges": snapshot.edges.len(),
        "total_events": snapshot.events.len(),
        "nodes_by_kind": nodes_by_kind,
        "edges_by_kind": edges_by_kind,
        "shared_projects": snapshot.shared_projects,
        "shared_projects_count": snapshot.shared_projects.len(),
        "sources": snapshot.sources,
        "timestamp_stats": snapshot.timestamp_stats,
    });

    println!("{}", serde_json::to_string_pretty(&output).unwrap());
}

fn print_human_output(snapshot: &GraphSnapshot, duration_ms: u64, store_path: &std::path::Path) {
    println!("\n=======================================================");
    println!("             CORTEX AGENT BRAIN OBSERVATORY            ");
    println!("=======================================================\n");

    println!("Scan completed in: {} ms", duration_ms);
    println!("Database location: {:?}\n", store_path);

    println!("--- ADAPTER SOURCES ---");
    for s in &snapshot.sources {
        println!(
            "  * {:<18} Status: {:<8} Version: {:<10} Scanned: {:>4} items",
            s.name,
            s.status.to_string(),
            s.version.as_deref().unwrap_or("N/A"),
            s.items_scanned
        );
        for w in &s.warnings {
            println!("    [WARN] {}: {}", w.code, w.message);
        }
    }

    let mut nodes_by_kind: BTreeMap<String, usize> = BTreeMap::new();
    for node in &snapshot.nodes {
        *nodes_by_kind.entry(node.kind.to_string()).or_default() += 1;
    }

    println!("\n--- NODES BY KIND (Total: {}) ---", snapshot.nodes.len());
    for (kind, count) in &nodes_by_kind {
        println!("  * {:<16} : {:>5}", kind, count);
    }

    let mut edges_by_kind: BTreeMap<String, usize> = BTreeMap::new();
    for edge in &snapshot.edges {
        *edges_by_kind.entry(edge.kind.to_string()).or_default() += 1;
    }

    println!("\n--- EDGES BY KIND (Total: {}) ---", snapshot.edges.len());
    for (kind, count) in &edges_by_kind {
        println!("  * {:<22} : {:>5}", kind, count);
    }

    println!("\n--- CROSS-AGENT MERGE ---");
    println!("  Shared Projects ({}):", snapshot.shared_projects.len());
    for proj in &snapshot.shared_projects {
        println!("    - {}", proj);
    }

    println!("\n--- TEMPORAL & TIMESTAMPS ---");
    println!(
        "  Nodes with real timestamps    : {}",
        snapshot.timestamp_stats.real_timestamp_count
    );
    println!(
        "  Nodes with fallback mtime     : {}",
        snapshot.timestamp_stats.fallback_timestamp_count
    );
    if let Some(d) = snapshot.timestamp_stats.earliest_date {
        println!("  Earliest date discovered      : {}", d.to_rfc3339());
    }
    if let Some(d) = snapshot.timestamp_stats.latest_date {
        println!("  Latest date discovered        : {}", d.to_rfc3339());
    }
    println!();
}
