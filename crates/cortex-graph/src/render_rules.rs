use cortex_model::{Edge, EdgeKind, Node, NodeId, NodeKind};
use std::collections::{HashMap, HashSet};

/// Links display mode control
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum LinksMode {
    Off,
    #[default]
    Strong,
    All,
}

/// Result of evaluating edge visibility and rendering style
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EdgeRenderStyle {
    Hidden,
    OrbitRing,
    CurvedArc,
}

/// Computes the 3D position for a node in cylindrical timeline mode.
/// X is time; Y and Z form circular project lanes in the YZ plane.
pub fn compute_timeline_lane_position(
    time_norm: f32,
    total_length: f32,
    lane_idx: usize,
    total_lanes: usize,
    cylinder_radius: f32,
) -> [f32; 3] {
    let x = time_norm * (total_length / 2.0);
    let angle = (lane_idx as f32 / total_lanes.max(1) as f32) * 2.0 * std::f32::consts::PI;
    let y = cylinder_radius * angle.cos();
    let z = cylinder_radius * angle.sin();
    [x, y, z]
}

/// Evaluates node visibility and glow status during timeline replay.
pub fn evaluate_replay_node_state(
    node_created_ms: i64,
    current_scrubber_ms: i64,
    active_window_ms: i64,
    idle_threshold_ms: i64,
) -> (bool, bool, bool) {
    if node_created_ms > current_scrubber_ms {
        return (false, false, false);
    }
    let age_ms = current_scrubber_ms - node_created_ms;
    let is_active_glow = age_ms <= active_window_ms;
    let is_idle_dimmed = age_ms >= idle_threshold_ms;
    (true, is_active_glow, is_idle_dimmed)
}

/// Verifies whether an edge's 3D endpoints are finite and within galaxy bounds sanity limits.
pub fn is_edge_geometry_valid(
    p1: [f32; 3],
    p2: [f32; 3],
    sanity_limit: f32,
) -> bool {
    // Check for NaN or Inf
    if !p1[0].is_finite() || !p1[1].is_finite() || !p1[2].is_finite() {
        return false;
    }
    if !p2[0].is_finite() || !p2[1].is_finite() || !p2[2].is_finite() {
        return false;
    }

    let d1_sq = p1[0] * p1[0] + p1[1] * p1[1] + p1[2] * p1[2];
    let d2_sq = p2[0] * p2[0] + p2[1] * p2[1] + p2[2] * p2[2];
    let limit_sq = sanity_limit * sanity_limit;

    if d1_sq > limit_sq || d2_sq > limit_sq {
        return false;
    }

    // Endpoints cannot be virtually identical (zero length)
    let dx = p2[0] - p1[0];
    let dy = p2[1] - p1[1];
    let dz = p2[2] - p1[2];
    let dist_sq = dx * dx + dy * dy + dz * dz;

    dist_sq >= 0.01
}

/// Computes a deterministic control point for a quadratic bezier arc between p1 and p2.
/// - Bend direction is outward from the galaxy center and perpendicular to chord.
/// - Arc height is proportional to chord distance, clamped between 10.0 and 75.0 units.
/// - Never produces loops or degenerate control points.
pub fn compute_arc_control_point(
    p1: [f32; 3],
    p2: [f32; 3],
    from_id: &str,
    to_id: &str,
) -> [f32; 3] {
    let mid = [
        (p1[0] + p2[0]) * 0.5,
        (p1[1] + p2[1]) * 0.5,
        (p1[2] + p2[2]) * 0.5,
    ];

    let chord = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    let chord_len = (chord[0] * chord[0] + chord[1] * chord[1] + chord[2] * chord[2]).sqrt();
    if chord_len < 1e-4 {
        return [mid[0], mid[1] + 10.0, mid[2]];
    }
    let chord_dir = [chord[0] / chord_len, chord[1] / chord_len, chord[2] / chord_len];

    // Compute outward radial direction from galaxy center [0, 0, 0] to mid
    let mid_len = (mid[0] * mid[0] + mid[1] * mid[1] + mid[2] * mid[2]).sqrt();
    let outward = if mid_len > 1.0 {
        [mid[0] / mid_len, mid[1] / mid_len, mid[2] / mid_len]
    } else {
        [0.0, 1.0, 0.0]
    };

    // Make outward perpendicular to chord_dir: perp = outward - (outward . chord_dir) * chord_dir
    let dot = outward[0] * chord_dir[0] + outward[1] * chord_dir[1] + outward[2] * chord_dir[2];
    let perp = [
        outward[0] - dot * chord_dir[0],
        outward[1] - dot * chord_dir[1],
        outward[2] - dot * chord_dir[2],
    ];
    let perp_len = (perp[0] * perp[0] + perp[1] * perp[1] + perp[2] * perp[2]).sqrt();

    let bend_dir = if perp_len > 0.05 {
        [perp[0] / perp_len, perp[1] / perp_len, perp[2] / perp_len]
    } else {
        // Fallback: cross product with up vector [0, 1, 0]
        let cross = [
            chord_dir[1] * 0.0 - chord_dir[2] * 1.0,
            chord_dir[2] * 0.0 - chord_dir[0] * 0.0,
            chord_dir[0] * 1.0 - chord_dir[1] * 0.0,
        ];
        let cross_len = (cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]).sqrt();
        if cross_len > 0.01 {
            [cross[0] / cross_len, cross[1] / cross_len, cross[2] / cross_len]
        } else {
            [0.0, 1.0, 0.0]
        }
    };

    // Deterministic subtle elevation derived from endpoint ids
    let mut h: u32 = 2166136261;
    for b in from_id.as_bytes().iter().chain(to_id.as_bytes().iter()) {
        h ^= *b as u32;
        h = h.wrapping_mul(16777619);
    }
    let jitter = ((h % 100) as f32) / 100.0 * 0.2 + 0.9; // 0.9 to 1.1

    let arc_height = (chord_len * 0.18 * jitter).clamp(10.0, 75.0);

    [
        mid[0] + bend_dir[0] * arc_height,
        mid[1] + bend_dir[1] * arc_height,
        mid[2] + bend_dir[2] * arc_height,
    ]
}

/// Evaluates visibility and rendering style for an edge based on node states, kinds, and LinksMode.
pub fn evaluate_edge_style(
    edge: &Edge,
    nodes_by_id: &HashMap<NodeId, &Node>,
    hovered_node_id: Option<&str>,
    selected_node_id: Option<&str>,
    is_hybrid_mode: bool,
    links_mode: LinksMode,
    is_top_strong_link: bool,
) -> EdgeRenderStyle {
    let is_endpoint_active = hovered_node_id == Some(&edge.from)
        || hovered_node_id == Some(&edge.to)
        || selected_node_id == Some(&edge.from)
        || selected_node_id == Some(&edge.to);

    // 1. SkillTopic edges (skill-to-category/tag): hidden unless endpoint is active
    if edge.kind == EdgeKind::SkillTopic {
        if is_endpoint_active {
            return EdgeRenderStyle::CurvedArc;
        } else {
            return EdgeRenderStyle::Hidden;
        }
    }

    // 2. Check if either endpoint is a tag: hidden unless active
    let from_node = nodes_by_id.get(&edge.from);
    let to_node = nodes_by_id.get(&edge.to);
    let from_is_tag = from_node
        .map(|n| n.kind == NodeKind::Topic && n.subkind.as_deref() == Some("tag"))
        .unwrap_or(false);
    let to_is_tag = to_node
        .map(|n| n.kind == NodeKind::Topic && n.subkind.as_deref() == Some("tag"))
        .unwrap_or(false);

    if from_is_tag || to_is_tag {
        if is_endpoint_active {
            return EdgeRenderStyle::CurvedArc;
        } else {
            return EdgeRenderStyle::Hidden;
        }
    }

    // 3. Project-Planet edges: rendered as orbit rings in hybrid mode
    if is_hybrid_mode && (edge.kind == EdgeKind::ProjectSession || edge.kind == EdgeKind::ProjectTask) {
        return EdgeRenderStyle::OrbitRing;
    }

    // If an endpoint is active, always show as highlighted CurvedArc
    if is_endpoint_active {
        return EdgeRenderStyle::CurvedArc;
    }

    // 4. Inactive cross-system edges: check LinksMode
    match links_mode {
        LinksMode::Off => EdgeRenderStyle::Hidden,
        LinksMode::Strong => {
            // Tool hubs sit between systems; draw their links ONLY on hover/select or in All mode
            let involves_tool = edge.kind == EdgeKind::UsesTool
                || from_node.map(|n| n.kind == NodeKind::Tool).unwrap_or(false)
                || to_node.map(|n| n.kind == NodeKind::Tool).unwrap_or(false);
            if involves_tool {
                return EdgeRenderStyle::Hidden;
            }

            if is_top_strong_link {
                EdgeRenderStyle::CurvedArc
            } else {
                EdgeRenderStyle::Hidden
            }
        }
        LinksMode::All => EdgeRenderStyle::CurvedArc,
    }
}

/// Computes ranking weights for cross-system edges:
/// - UsesTool weight = number of distinct project stars using that tool.
/// - Other cross-system edges = base weight or endpoint importance.
///
/// Returns a set of edge indices that qualify as top strong links (capped at 30).
pub fn compute_strong_links(
    edges: &[Edge],
    nodes_by_id: &HashMap<NodeId, &Node>,
    max_strong: usize,
) -> HashSet<usize> {
    let mut tool_to_projects: HashMap<String, HashSet<String>> = HashMap::new();
    for edge in edges {
        if edge.kind == EdgeKind::UsesTool {
            let tool_id = &edge.to;
            if let Some(conv_node) = nodes_by_id.get(&edge.from) {
                if let Some(proj_id) = conv_node.metadata.get("project_id").and_then(|v| v.as_str()) {
                    tool_to_projects
                        .entry(tool_id.clone())
                        .or_default()
                        .insert(proj_id.to_string());
                }
            }
        }
    }

    let mut scored_indices: Vec<(usize, f32)> = Vec::new();

    for (idx, edge) in edges.iter().enumerate() {
        if edge.kind == EdgeKind::SkillTopic
            || edge.kind == EdgeKind::ProjectSession
            || edge.kind == EdgeKind::ProjectTask
        {
            continue;
        }

        let from_node = nodes_by_id.get(&edge.from);
        let to_node = nodes_by_id.get(&edge.to);

        let from_is_tag = from_node
            .map(|n| n.kind == NodeKind::Topic && n.subkind.as_deref() == Some("tag"))
            .unwrap_or(false);
        let to_is_tag = to_node
            .map(|n| n.kind == NodeKind::Topic && n.subkind.as_deref() == Some("tag"))
            .unwrap_or(false);
        if from_is_tag || to_is_tag {
            continue;
        }

        let is_tool = edge.kind == EdgeKind::UsesTool
            || from_node.map(|n| n.kind == NodeKind::Tool).unwrap_or(false)
            || to_node.map(|n| n.kind == NodeKind::Tool).unwrap_or(false);

        // Tool hubs sit between systems: excluded from default strong links
        if is_tool {
            continue;
        }

        let score = if edge.kind == EdgeKind::UsesTool {
            tool_to_projects.get(&edge.to).map(|s| s.len() as f32).unwrap_or(1.0)
        } else {
            let s1 = from_node.map(|n| n.importance).unwrap_or(0.5);
            let s2 = to_node.map(|n| n.importance).unwrap_or(0.5);
            (s1 + s2) * 5.0 + edge.weight
        };

        scored_indices.push((idx, score));
    }

    scored_indices.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    scored_indices
        .into_iter()
        .take(max_strong)
        .map(|(idx, _)| idx)
        .collect()
}

/// Activity temperature tier for stars based on relative dataset percentile:
/// - Hot: Top 30% (percentile >= 0.70) -> Electric Blue-White
/// - Warm: Middle 40% (0.30 <= percentile < 0.70) -> Warm Amber / Gold
/// - Dormant: Lowest 30% (percentile < 0.30) -> Dim Crimson Red
/// - Root: Generic user home / system root -> Dim Slate Gray
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StarActivityTier {
    Hot,
    Warm,
    Dormant,
    Root,
}

/// Classifies a star into its activity temperature tier given its dataset percentile.
pub fn classify_star_activity_percentile(percentile: f32, is_generic_root: bool) -> StarActivityTier {
    if is_generic_root {
        StarActivityTier::Root
    } else if percentile >= 0.70 {
        StarActivityTier::Hot
    } else if percentile >= 0.30 {
        StarActivityTier::Warm
    } else {
        StarActivityTier::Dormant
    }
}

/// Clamps star visual radius to prevent oversized stars from obscuring the galaxy.
/// Clamped between 5.5 and 11.0 units.
pub fn clamp_star_radius(degree: usize, access_count: u64, is_generic_root: bool) -> f32 {
    if is_generic_root {
        return 5.5;
    }
    let deg_factor = (degree as f32).sqrt() * 1.0;
    let access_factor = if access_count > 0 {
        ((access_count as f32) + 1.0).log2() * 0.8
    } else {
        0.0
    };
    let raw = 5.5 + deg_factor + access_factor;
    raw.clamp(5.5, 11.0)
}

/// Computes the bounding sphere of all visible node positions and optimal camera distance.
pub fn compute_bounding_sphere_framing(
    positions: &[[f32; 3]],
    fov_radians: f32,
) -> Option<([f32; 3], f32, f32)> {
    if positions.is_empty() {
        return None;
    }

    let mut sum_x = 0.0;
    let mut sum_y = 0.0;
    let mut sum_z = 0.0;
    for pos in positions {
        sum_x += pos[0];
        sum_y += pos[1];
        sum_z += pos[2];
    }
    let n = positions.len() as f32;
    let center = [sum_x / n, sum_y / n, sum_z / n];

    let mut max_dist_sq: f32 = 0.0;
    for pos in positions {
        let dx = pos[0] - center[0];
        let dy = pos[1] - center[1];
        let dz = pos[2] - center[2];
        let dist_sq = dx * dx + dy * dy + dz * dz;
        if dist_sq > max_dist_sq {
            max_dist_sq = dist_sq;
        }
    }
    let radius = max_dist_sq.sqrt() + 40.0;

    let half_fov = (fov_radians * 0.5).max(0.1);
    let cam_dist = (radius / half_fov.sin()).max(250.0);

    Some((center, radius, cam_dist))
}

/// Candidate for 2D screen label placement
#[derive(Debug, Clone)]
pub struct LabelCandidate {
    pub id: String,
    pub title: String,
    pub screen_x: f32,
    pub screen_y: f32,
    pub priority: i32,
    pub width: f32,
    pub height: f32,
}

/// Selects and caps visible labels using screen-space collision avoidance and deduplication.
pub fn select_visible_labels(
    candidates: Vec<LabelCandidate>,
    max_labels: usize,
) -> Vec<LabelCandidate> {
    let mut best_by_id: HashMap<String, LabelCandidate> = HashMap::new();
    for cand in candidates {
        match best_by_id.get_mut(&cand.id) {
            Some(existing) => {
                if cand.priority > existing.priority {
                    *existing = cand;
                }
            }
            None => {
                best_by_id.insert(cand.id.clone(), cand);
            }
        }
    }

    let mut list: Vec<LabelCandidate> = best_by_id.into_values().collect();
    list.sort_by_key(|a| std::cmp::Reverse(a.priority));

    let mut accepted: Vec<LabelCandidate> = Vec::new();
    for cand in list {
        if accepted.len() >= max_labels {
            break;
        }

        let cand_left = cand.screen_x - cand.width * 0.5;
        let cand_right = cand.screen_x + cand.width * 0.5;
        let cand_top = cand.screen_y - cand.height * 0.5;
        let cand_bottom = cand.screen_y + cand.height * 0.5;

        let mut collides = false;
        for acc in &accepted {
            let acc_left = acc.screen_x - acc.width * 0.5;
            let acc_right = acc.screen_x + acc.width * 0.5;
            let acc_top = acc.screen_y - acc.height * 0.5;
            let acc_bottom = acc.screen_y + acc.height * 0.5;

            if cand_left < acc_right + 2.0
                && cand_right > acc_left - 2.0
                && cand_top < acc_bottom + 2.0
                && cand_bottom > acc_top - 2.0
            {
                collides = true;
                break;
            }
        }

        if !collides {
            accepted.push(cand);
        }
    }

    accepted
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_edge_sanitization() {
        // Valid edge within bounds
        assert!(is_edge_geometry_valid([0.0, 0.0, 0.0], [100.0, 50.0, -20.0], 2500.0));

        // Non-finite endpoints (NaN, Infinity)
        assert!(!is_edge_geometry_valid([f32::NAN, 0.0, 0.0], [100.0, 50.0, 0.0], 2500.0));
        assert!(!is_edge_geometry_valid([0.0, 0.0, 0.0], [f32::INFINITY, 0.0, 0.0], 2500.0));

        // Hugely distant endpoints exceeding sanity limit
        assert!(!is_edge_geometry_valid([0.0, 0.0, 0.0], [3000.0, 0.0, 0.0], 2500.0));

        // Degenerate zero-length edge
        assert!(!is_edge_geometry_valid([10.0, 10.0, 10.0], [10.0, 10.0, 10.0], 2500.0));
    }

    #[test]
    fn test_arc_geometry_determinism_and_no_loops() {
        let p1 = [-100.0, 20.0, 50.0];
        let p2 = [200.0, -30.0, 80.0];

        let ctrl1 = compute_arc_control_point(p1, p2, "from_a", "to_b");
        let ctrl2 = compute_arc_control_point(p1, p2, "from_a", "to_b");

        // Deterministic
        assert_eq!(ctrl1, ctrl2);

        // Control point must be finite
        assert!(ctrl1[0].is_finite());
        assert!(ctrl1[1].is_finite());
        assert!(ctrl1[2].is_finite());

        // Control point should elevate outward without creating loops (not identical to endpoints)
        assert_ne!(ctrl1, p1);
        assert_ne!(ctrl1, p2);
    }

    #[test]
    fn test_strong_links_cap_and_tool_rules() {
        let mut nodes = HashMap::new();
        let mut edges = Vec::new();

        // Create 50 cross-system related skill edges
        for i in 0..50 {
            let s_id = format!("skill_{i}");
            let s_target = format!("skill_target_{i}");
            nodes.insert(
                s_id.clone(),
                Box::leak(Box::new(Node {
                    id: s_id.clone(),
                    source_id: "test".into(),
                    kind: NodeKind::Skill,
                    title: format!("Skill {i}"),
                    body_preview: String::new(),
                    path: None,
                    tags: vec![],
                    created_at: None,
                    modified_at: None,
                    last_active_at: None,
                    access_count: 0,
                    pinned: false,
                    degree: 2,
                    importance: 0.6,
                    freshness: 0.5,
                    is_ambient: true,
                    is_generic_root: false,
                    timestamp_source: None,
                    subkind: None,
                    hidden_by_default: false,
                    metadata: serde_json::json!({}),
                })) as &Node,
            );
            nodes.insert(
                s_target.clone(),
                Box::leak(Box::new(Node {
                    id: s_target.clone(),
                    source_id: "test".into(),
                    kind: NodeKind::Skill,
                    title: format!("Skill Target {i}"),
                    body_preview: String::new(),
                    path: None,
                    tags: vec![],
                    created_at: None,
                    modified_at: None,
                    last_active_at: None,
                    access_count: 0,
                    pinned: false,
                    degree: 2,
                    importance: 0.6,
                    freshness: 0.5,
                    is_ambient: true,
                    is_generic_root: false,
                    timestamp_source: None,
                    subkind: None,
                    hidden_by_default: false,
                    metadata: serde_json::json!({}),
                })) as &Node,
            );
            edges.push(Edge {
                from: s_id,
                to: s_target,
                kind: EdgeKind::RelatedSkill,
                weight: i as f32,
            });
        }

        // Add tool hub edges
        let tool_node = Box::leak(Box::new(Node {
            id: "tool:read".into(),
            source_id: "test".into(),
            kind: NodeKind::Tool,
            title: "read".into(),
            body_preview: String::new(),
            path: None,
            tags: vec![],
            created_at: None,
            modified_at: None,
            last_active_at: None,
            access_count: 0,
            pinned: false,
            degree: 10,
            importance: 0.8,
            freshness: 0.5,
            is_ambient: true,
            is_generic_root: false,
            timestamp_source: None,
            subkind: None,
            hidden_by_default: false,
            metadata: serde_json::json!({}),
        })) as &Node;
        nodes.insert("tool:read".into(), tool_node);
        edges.push(Edge {
            from: "skill_0".into(),
            to: "tool:read".into(),
            kind: EdgeKind::UsesTool,
            weight: 100.0,
        });

        let strong = compute_strong_links(&edges, &nodes, 30);
        assert_eq!(strong.len(), 30, "Strong links must be strictly capped at 30");

        // Tool hub edges must be excluded from default strong links
        let tool_edge_idx = edges.len() - 1;
        assert!(!strong.contains(&tool_edge_idx), "Tool hub edge must NOT be in default strong links");
    }

    #[test]
    fn test_edge_visibility_rules() {
        let mut nodes = HashMap::new();
        let skill_node = Node {
            id: "skill:1".into(),
            source_id: "hermes".into(),
            kind: NodeKind::Skill,
            title: "Skill 1".into(),
            body_preview: String::new(),
            path: None,
            tags: vec![],
            created_at: None,
            modified_at: None,
            last_active_at: None,
            access_count: 0,
            pinned: false,
            degree: 1,
            importance: 0.5,
            freshness: 0.5,
            is_ambient: true,
            is_generic_root: false,
            timestamp_source: None,
            subkind: None,
            hidden_by_default: false,
            metadata: serde_json::json!({}),
        };
        let cat_node = Node {
            id: "cat:1".into(),
            source_id: "hermes".into(),
            kind: NodeKind::Topic,
            title: "Category 1".into(),
            body_preview: String::new(),
            path: None,
            tags: vec![],
            created_at: None,
            modified_at: None,
            last_active_at: None,
            access_count: 0,
            pinned: false,
            degree: 1,
            importance: 0.5,
            freshness: 0.5,
            is_ambient: true,
            is_generic_root: false,
            timestamp_source: None,
            subkind: Some("category".into()),
            hidden_by_default: false,
            metadata: serde_json::json!({}),
        };
        nodes.insert("skill:1".into(), &skill_node);
        nodes.insert("cat:1".into(), &cat_node);

        let skill_topic_edge = Edge {
            from: "skill:1".into(),
            to: "cat:1".into(),
            kind: EdgeKind::SkillTopic,
            weight: 1.0,
        };

        // By default, skill-to-category edge must be hidden
        assert_eq!(
            evaluate_edge_style(&skill_topic_edge, &nodes, None, None, true, LinksMode::Strong, false),
            EdgeRenderStyle::Hidden,
            "SkillTopic edge should be hidden by default"
        );

        // When endpoint is hovered, must be visible as curved arc
        assert_eq!(
            evaluate_edge_style(&skill_topic_edge, &nodes, Some("skill:1"), None, true, LinksMode::Strong, false),
            EdgeRenderStyle::CurvedArc,
            "SkillTopic edge should be visible as CurvedArc when endpoint is hovered"
        );

        // ProjectSession in hybrid mode must be OrbitRing
        let proj_session_edge = Edge {
            from: "conv:1".into(),
            to: "proj:1".into(),
            kind: EdgeKind::ProjectSession,
            weight: 1.0,
        };
        assert_eq!(
            evaluate_edge_style(&proj_session_edge, &nodes, None, None, true, LinksMode::Strong, false),
            EdgeRenderStyle::OrbitRing,
            "ProjectSession in hybrid mode must render as OrbitRing"
        );

        // Non-top link in LinksMode::Strong must be Hidden
        let cross_edge = Edge {
            from: "skill:1".into(),
            to: "cat:1".into(),
            kind: EdgeKind::RelatedSkill,
            weight: 1.0,
        };
        assert_eq!(
            evaluate_edge_style(&cross_edge, &nodes, None, None, true, LinksMode::Strong, false),
            EdgeRenderStyle::Hidden
        );
        // Top strong link in LinksMode::Strong must be CurvedArc
        assert_eq!(
            evaluate_edge_style(&cross_edge, &nodes, None, None, true, LinksMode::Strong, true),
            EdgeRenderStyle::CurvedArc
        );
        // LinksMode::Off hides even top strong link if inactive
        assert_eq!(
            evaluate_edge_style(&cross_edge, &nodes, None, None, true, LinksMode::Off, true),
            EdgeRenderStyle::Hidden
        );
    }

    #[test]
    fn test_star_size_clamping() {
        let clamped_large = clamp_star_radius(1000, 10000, false);
        assert!(clamped_large <= 11.0, "Star radius must not exceed 11.0, got {clamped_large}");
        assert!(clamped_large >= 5.5, "Star radius must be at least 5.5, got {clamped_large}");

        let small = clamp_star_radius(0, 0, false);
        assert_eq!(small, 5.5, "Low activity star should be 5.5");

        let root = clamp_star_radius(50, 50, true);
        assert_eq!(root, 5.5, "Generic root star must be clamped to 5.5");
    }

    #[test]
    fn test_bounding_sphere_framing_math() {
        let positions = vec![
            [-100.0, 0.0, 0.0],
            [100.0, 0.0, 0.0],
            [0.0, 50.0, 0.0],
            [0.0, -50.0, 0.0],
        ];
        let fov_rad = 50.0_f32.to_radians();
        let (center, radius, dist) = compute_bounding_sphere_framing(&positions, fov_rad).unwrap();

        assert_eq!(center[0], 0.0);
        assert_eq!(center[1], 0.0);
        assert_eq!(center[2], 0.0);
        assert!(radius >= 140.0, "Radius should be ~140 with padding");
        assert!(dist > radius, "Camera distance must exceed radius to fit within FOV");
        assert!(dist >= 250.0, "Camera distance minimum bound");
    }

    #[test]
    fn test_label_dedupe_and_cap_logic() {
        let mut candidates = Vec::new();
        for i in 0..50 {
            candidates.push(LabelCandidate {
                id: format!("node_{i}"),
                title: format!("Title {i}"),
                screen_x: (i as f32) * 150.0,
                screen_y: 100.0,
                priority: i,
                width: 80.0,
                height: 20.0,
            });
        }
        candidates.push(LabelCandidate {
            id: "node_49".into(),
            title: "Duplicate low priority".into(),
            screen_x: 0.0,
            screen_y: 0.0,
            priority: 0,
            width: 80.0,
            height: 20.0,
        });

        let visible = select_visible_labels(candidates, 40);
        assert_eq!(visible.len(), 40, "Visible labels must be strictly capped at 40");
        assert_eq!(visible[0].id, "node_49", "Highest priority node should be first");

        let colliding = vec![
            LabelCandidate {
                id: "c1".into(),
                title: "Top".into(),
                screen_x: 200.0,
                screen_y: 200.0,
                priority: 100,
                width: 80.0,
                height: 20.0,
            },
            LabelCandidate {
                id: "c2".into(),
                title: "Overlapping Bottom".into(),
                screen_x: 205.0,
                screen_y: 202.0,
                priority: 50,
                width: 80.0,
                height: 20.0,
            },
        ];
        let non_overlapping = select_visible_labels(colliding, 40);
        assert_eq!(non_overlapping.len(), 1, "Colliding lower priority label must be suppressed");
        assert_eq!(non_overlapping[0].id, "c1");
    }

    #[test]
    fn test_star_activity_percentile_mapping() {
        // Percentile >= 0.70 maps to Hot
        assert_eq!(classify_star_activity_percentile(0.95, false), StarActivityTier::Hot);
        assert_eq!(classify_star_activity_percentile(0.70, false), StarActivityTier::Hot);

        // 0.30 <= Percentile < 0.70 maps to Warm
        assert_eq!(classify_star_activity_percentile(0.69, false), StarActivityTier::Warm);
        assert_eq!(classify_star_activity_percentile(0.30, false), StarActivityTier::Warm);

        // Percentile < 0.30 maps to Dormant
        assert_eq!(classify_star_activity_percentile(0.29, false), StarActivityTier::Dormant);
        assert_eq!(classify_star_activity_percentile(0.00, false), StarActivityTier::Dormant);

        // Generic root star always maps to Root regardless of percentile
        assert_eq!(classify_star_activity_percentile(1.00, true), StarActivityTier::Root);
        assert_eq!(classify_star_activity_percentile(0.50, true), StarActivityTier::Root);
        assert_eq!(classify_star_activity_percentile(0.00, true), StarActivityTier::Root);
    }

    #[test]
    fn test_edges_follow_animated_orbital_positions() {
        use cortex_model::{HybridNodeLayout, OrbitParameters, SystemRole};
        use std::collections::BTreeMap;

        let mut layout = BTreeMap::new();
        // Star at origin
        layout.insert(
            "star_1".into(),
            HybridNodeLayout {
                role: SystemRole::Star,
                base_position: [0.0, 0.0, 0.0],
                orbit: None,
            },
        );
        // Planet orbiting star_1 with radius 120 and angular speed 1.5 rad/sec
        layout.insert(
            "planet_1".into(),
            HybridNodeLayout {
                role: SystemRole::Planet,
                base_position: [0.0, 0.0, 0.0],
                orbit: Some(OrbitParameters {
                    parent_id: Some("star_1".into()),
                    radius: 120.0,
                    angular_speed: 1.5,
                    phase: 0.0,
                    inclination: 0.1,
                    ascending_node: 0.0,
                }),
            },
        );
        // Another star across space
        layout.insert(
            "star_2".into(),
            HybridNodeLayout {
                role: SystemRole::Star,
                base_position: [300.0, 50.0, 0.0],
                orbit: None,
            },
        );

        // Evaluate positions at t = 0.0
        let pos_t0 = crate::hybrid_layout::evaluate_hybrid_positions(&layout, 0.0);
        let p_planet_0 = pos_t0.get("planet_1").unwrap();
        let p_star2 = pos_t0.get("star_2").unwrap();

        // Edge between planet_1 and star_2
        let ctrl_t0 = compute_arc_control_point(*p_planet_0, *p_star2, "planet_1", "star_2");

        // Advance simulation time to t = 1.0
        let pos_t1 = crate::hybrid_layout::evaluate_hybrid_positions(&layout, 1.0);
        let p_planet_1 = pos_t1.get("planet_1").unwrap();

        // Assert that planet has moved along its orbit
        let planet_displacement = (p_planet_1[0] - p_planet_0[0]).powi(2)
            + (p_planet_1[1] - p_planet_0[1]).powi(2)
            + (p_planet_1[2] - p_planet_0[2]).powi(2);
        assert!(
            planet_displacement > 10.0,
            "Planet must move continuously as orbit clock advances"
        );

        // Edge endpoints and arc control point must move with the node
        let ctrl_t1 = compute_arc_control_point(*p_planet_1, *p_star2, "planet_1", "star_2");
        assert_ne!(
            ctrl_t0, ctrl_t1,
            "Arc control point and geometry must follow live orbital position each frame"
        );
    }

    #[test]
    fn test_long_chord_connections_allowed_in_all_mode() {
        // Points far apart (distance > 1100, e.g. 1800 units across galaxy)
        let p1 = [-900.0, 100.0, 0.0];
        let p2 = [900.0, -100.0, 0.0];

        // Sanity limit allows cross-galaxy chords
        assert!(
            is_edge_geometry_valid(p1, p2, 2500.0),
            "Far-apart systems within galaxy bounds must not be rejected"
        );

        // Arc control point computes a gentle bridge without exploding
        let ctrl = compute_arc_control_point(p1, p2, "star_a", "star_b");
        assert!(ctrl[0].is_finite());
        assert!(ctrl[1].is_finite());
        assert!(ctrl[2].is_finite());
    }

    #[test]
    fn test_timeline_lane_placement_cylindrical() {
        let total_length = 1600.0;
        let radius = 100.0;
        let total_lanes = 4;

        // Lane 0 at t = -1.0 (start of timeline)
        let pos_start = compute_timeline_lane_position(-1.0, total_length, 0, total_lanes, radius);
        assert_eq!(pos_start[0], -800.0);
        assert!((pos_start[1] - 100.0).abs() < 1e-4);
        assert!(pos_start[2].abs() < 1e-4);

        // Lane 2 (opposite side of cylinder: angle = PI) at t = 0.0 (middle of timeline)
        let pos_mid = compute_timeline_lane_position(0.0, total_length, 2, total_lanes, radius);
        assert_eq!(pos_mid[0], 0.0);
        assert!((pos_mid[1] - (-100.0)).abs() < 1e-4);
        assert!(pos_mid[2].abs() < 1e-4);

        // Lane 1 (top of cylinder: angle = PI/2) at t = 1.0 (end of timeline)
        let pos_end = compute_timeline_lane_position(1.0, total_length, 1, total_lanes, radius);
        assert_eq!(pos_end[0], 800.0);
        assert!(pos_end[1].abs() < 1e-4);
        assert!((pos_end[2] - 100.0).abs() < 1e-4);
    }

    #[test]
    fn test_replay_scrubber_time_math_and_glow() {
        let created_ms = 1_000_000;
        let active_window_ms = 4 * 3600 * 1000; // 4 hours
        let idle_threshold_ms = 72 * 3600 * 1000; // 72 hours

        // 1. Before node birth: must be invisible
        let (visible, _, _) = evaluate_replay_node_state(
            created_ms,
            created_ms - 1000,
            active_window_ms,
            idle_threshold_ms,
        );
        assert!(!visible);

        // 2. Right at birth (recent active window): must be visible and glowing
        let (visible, glow, idle) = evaluate_replay_node_state(
            created_ms,
            created_ms + 1000,
            active_window_ms,
            idle_threshold_ms,
        );
        assert!(visible);
        assert!(glow);
        assert!(!idle);

        // 3. Normal age (10 hours later): visible, no glow, not idle yet
        let (visible, glow, idle) = evaluate_replay_node_state(
            created_ms,
            created_ms + 10 * 3600 * 1000,
            active_window_ms,
            idle_threshold_ms,
        );
        assert!(visible);
        assert!(!glow);
        assert!(!idle);

        // 4. Idle age (100 hours later): visible, no glow, idle dimmed
        let (visible, glow, idle) = evaluate_replay_node_state(
            created_ms,
            created_ms + 100 * 3600 * 1000,
            active_window_ms,
            idle_threshold_ms,
        );
        assert!(visible);
        assert!(!glow);
        assert!(idle);
    }
}
