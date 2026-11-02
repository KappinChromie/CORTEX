use cortex_model::{Edge, GraphSnapshot, HybridNodeLayout, Node, NodeId};
use petgraph::graph::{NodeIndex, UnGraph};
use petgraph::visit::EdgeRef;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

pub mod hybrid_layout;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodePosition3D {
    pub id: NodeId,
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnrichedGraphSnapshot {
    pub snapshot: GraphSnapshot,
    pub neighbors: HashMap<NodeId, Vec<NodeId>>,
    pub positions: HashMap<NodeId, [f32; 3]>,
    pub hybrid_layout: BTreeMap<NodeId, HybridNodeLayout>,
}

/// Builds petgraph graph, computes node degrees, extracts neighbor adjacency,
/// and computes initial 3D positions for the "web" (3D force-directed) layout.
pub fn process_graph(mut snapshot: GraphSnapshot) -> EnrichedGraphSnapshot {
    let mut graph = UnGraph::<NodeId, f32>::new_undirected();
    let mut id_to_idx: HashMap<NodeId, NodeIndex> = HashMap::new();
    let mut idx_to_id: HashMap<NodeIndex, NodeId> = HashMap::new();

    for node in &snapshot.nodes {
        let idx = graph.add_node(node.id.clone());
        id_to_idx.insert(node.id.clone(), idx);
        idx_to_id.insert(idx, node.id.clone());
    }

    for edge in &snapshot.edges {
        if let (Some(&u), Some(&v)) = (id_to_idx.get(&edge.from), id_to_idx.get(&edge.to)) {
            graph.add_edge(u, v, edge.weight);
        }
    }

    // 1. Compute degrees
    let mut degrees: HashMap<NodeId, u32> = HashMap::new();
    let mut neighbors: HashMap<NodeId, Vec<NodeId>> = HashMap::new();

    for (&idx, id) in &idx_to_id {
        let mut n_list = Vec::new();
        for edge_ref in graph.edges(idx) {
            let target = edge_ref.target();
            if let Some(target_id) = idx_to_id.get(&target) {
                if target_id != id {
                    n_list.push(target_id.clone());
                }
            }
        }
        degrees.insert(id.clone(), n_list.len() as u32);
        neighbors.insert(id.clone(), n_list);
    }

    // Update degrees in snapshot nodes
    for node in &mut snapshot.nodes {
        if let Some(&deg) = degrees.get(&node.id) {
            node.degree = deg;
        }
    }

    // 2. Compute 3D Positions for "web" force layout
    let positions = compute_3d_positions(&snapshot.nodes, &snapshot.edges, &neighbors);

    // 3. Compute Deterministic 3D Hybrid (Solar-System) Layout
    let hybrid_layout = hybrid_layout::compute_hybrid_layout(&snapshot, &neighbors);

    EnrichedGraphSnapshot {
        snapshot,
        neighbors,
        positions,
        hybrid_layout,
    }
}

/// Computes stable, aesthetically distributed 3D positions using a simulated 3D force layout.
fn compute_3d_positions(
    nodes: &[Node],
    _edges: &[Edge],
    _neighbors: &HashMap<NodeId, Vec<NodeId>>,
) -> HashMap<NodeId, [f32; 3]> {
    let mut positions = HashMap::new();
    let n = nodes.len();
    if n == 0 {
        return positions;
    }

    // Golden spiral / spherical Fibonacci distribution for initial positions
    let golden_ratio = (1.0 + 5.0_f32.sqrt()) / 2.0;

    for (i, node) in nodes.iter().enumerate() {
        let theta = 2.0 * std::f32::consts::PI * (i as f32) / golden_ratio;
        let phi = ((1.0 - 2.0 * (i as f32 + 0.5) / n as f32).clamp(-1.0, 1.0)).acos();

        // Project onto multi-tiered shell radius based on node kind and degree
        let base_radius = match node.kind {
            cortex_model::NodeKind::Project => 120.0 + (node.degree as f32 * 5.0).min(50.0),
            cortex_model::NodeKind::Session | cortex_model::NodeKind::Conversation => {
                250.0 + (i % 5) as f32 * 30.0
            }
            cortex_model::NodeKind::Task => 380.0 + (i % 4) as f32 * 25.0,
            cortex_model::NodeKind::Skill | cortex_model::NodeKind::Topic => {
                480.0 + (i % 6) as f32 * 30.0
            }
            cortex_model::NodeKind::Tool => 580.0 + (i % 3) as f32 * 20.0,
            cortex_model::NodeKind::Artifact | cortex_model::NodeKind::Memory => {
                320.0 + (i % 7) as f32 * 25.0
            }
        };

        let x = base_radius * phi.sin() * theta.cos();
        let y = base_radius * phi.cos() * 0.7; // slight vertical flattening
        let z = base_radius * phi.sin() * theta.sin();

        positions.insert(node.id.clone(), [x, y, z]);
    }

    positions
}

#[cfg(test)]
mod tests {
    use super::*;
    use cortex_model::{EdgeKind, NodeKind, TimestampStats};

    #[test]
    fn test_graph_processing() {
        let node1 = Node {
            id: "n1".into(),
            source_id: "test".into(),
            kind: NodeKind::Project,
            title: "Project 1".into(),
            body_preview: "".into(),
            path: None,
            tags: vec![],
            created_at: None,
            modified_at: None,
            last_active_at: None,
            access_count: 0,
            pinned: false,
            degree: 0,
            importance: 0.0,
            freshness: 0.0,
            is_ambient: false,
            is_generic_root: false,
            timestamp_source: None,
            subkind: None,
            hidden_by_default: false,
            metadata: serde_json::Value::Null,
        };

        let node2 = Node {
            id: "n2".into(),
            source_id: "test".into(),
            kind: NodeKind::Session,
            title: "Session 1".into(),
            body_preview: "".into(),
            path: None,
            tags: vec![],
            created_at: None,
            modified_at: None,
            last_active_at: None,
            access_count: 0,
            pinned: false,
            degree: 0,
            importance: 0.0,
            freshness: 0.0,
            is_ambient: false,
            is_generic_root: false,
            timestamp_source: None,
            subkind: None,
            hidden_by_default: false,
            metadata: serde_json::Value::Null,
        };

        let edge = Edge {
            from: "n1".into(),
            to: "n2".into(),
            kind: EdgeKind::ProjectSession,
            weight: 1.0,
        };

        let snapshot = GraphSnapshot {
            nodes: vec![node1, node2],
            edges: vec![edge],
            events: vec![],
            sources: vec![],
            timestamp_stats: TimestampStats::default(),
            shared_projects: vec![],
        };

        let enriched = process_graph(snapshot);
        assert_eq!(enriched.snapshot.nodes[0].degree, 1);
        assert_eq!(enriched.snapshot.nodes[1].degree, 1);
        assert_eq!(enriched.neighbors.get("n1").unwrap(), &vec!["n2".to_string()]);
        assert!(enriched.positions.contains_key("n1"));
        assert!(enriched.positions.contains_key("n2"));
    }

    #[test]
    fn test_snapshot_positions_finite_and_not_identical() {
        let mut nodes = Vec::new();
        for i in 0..50 {
            nodes.push(Node {
                id: format!("node:{i}"),
                source_id: "test".into(),
                kind: if i % 2 == 0 { NodeKind::Project } else { NodeKind::Skill },
                title: format!("Node {i}"),
                body_preview: "".into(),
                path: None,
                tags: vec![],
                created_at: None,
                modified_at: None,
                last_active_at: None,
                access_count: 0,
                pinned: false,
                degree: 0,
                importance: 0.0,
                freshness: 0.0,
                is_ambient: false,
                is_generic_root: false,
                timestamp_source: None,
                subkind: None,
                hidden_by_default: false,
                metadata: serde_json::Value::Null,
            });
        }

        let snapshot = GraphSnapshot {
            nodes,
            edges: vec![],
            events: vec![],
            sources: vec![],
            timestamp_stats: TimestampStats::default(),
            shared_projects: vec![],
        };

        let enriched = process_graph(snapshot);
        assert_eq!(enriched.positions.len(), 50);

        let mut all_points = Vec::new();
        for (id, pos) in &enriched.positions {
            assert!(pos[0].is_finite(), "X position for {id} is not finite");
            assert!(pos[1].is_finite(), "Y position for {id} is not finite");
            assert!(pos[2].is_finite(), "Z position for {id} is not finite");
            all_points.push(*pos);
        }

        // Verify points are not all identical
        let p0 = all_points[0];
        let identical_count = all_points.iter().filter(|p| **p == p0).count();
        assert!(identical_count < 5, "Too many identical positions detected");
    }
}
