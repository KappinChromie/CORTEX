use cortex_model::{Edge, EdgeKind, Node, NodeId, NodeKind};
use std::collections::HashMap;

/// Result of evaluating edge visibility and rendering style
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EdgeRenderStyle {
    Hidden,
    OrbitRing,
    CurvedArc,
}

/// Evaluates visibility and rendering style for an edge based on node states and edge kinds.
/// Rule:
/// - Skill-to-category (SkillTopic) and tag edges hidden by default; shown only if endpoint is hovered/selected.
/// - Project-to-planet (ProjectSession, ProjectTask) rendered as orbit rings in solar view, not lines.
/// - Cross-system edges (UsesTool, RelatedSkill, ArtifactConversation) rendered as curved arcs.
pub fn evaluate_edge_style(
    edge: &Edge,
    nodes_by_id: &HashMap<NodeId, &Node>,
    hovered_node_id: Option<&str>,
    selected_node_id: Option<&str>,
    is_hybrid_mode: bool,
) -> EdgeRenderStyle {
    let is_endpoint_active = hovered_node_id == Some(&edge.from)
        || hovered_node_id == Some(&edge.to)
        || selected_node_id == Some(&edge.from)
        || selected_node_id == Some(&edge.to);

    // 1. SkillTopic edges (skill-to-category/tag)
    if edge.kind == EdgeKind::SkillTopic {
        if is_endpoint_active {
            return EdgeRenderStyle::CurvedArc;
        } else {
            return EdgeRenderStyle::Hidden;
        }
    }

    // 2. Check if either endpoint is a tag
    let from_is_tag = nodes_by_id
        .get(&edge.from)
        .map(|n| n.kind == NodeKind::Topic && n.subkind.as_deref() == Some("tag"))
        .unwrap_or(false);
    let to_is_tag = nodes_by_id
        .get(&edge.to)
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

    // 4. Cross-system and inter-node edges: rendered as curved arcs
    EdgeRenderStyle::CurvedArc
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
/// Given FOV in radians, distance D = R / sin(FOV / 2).
pub fn compute_bounding_sphere_framing(
    positions: &[[f32; 3]],
    fov_radians: f32,
) -> Option<([f32; 3], f32, f32)> {
    if positions.is_empty() {
        return None;
    }

    // 1. Compute centroid
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

    // 2. Compute radius
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
    let radius = max_dist_sq.sqrt() + 40.0; // padding margin

    // 3. Compute camera distance
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
/// Maximum visible labels capped at `max_labels` (default 40).
pub fn select_visible_labels(
    candidates: Vec<LabelCandidate>,
    max_labels: usize,
) -> Vec<LabelCandidate> {
    // 1. Deduplicate by ID, keeping the highest priority
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
    // 2. Sort descending by priority
    list.sort_by_key(|a| std::cmp::Reverse(a.priority));

    // 3. Screen-space AABB collision suppression
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

            // Check AABB overlap with small margin (2px)
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
            evaluate_edge_style(&skill_topic_edge, &nodes, None, None, true),
            EdgeRenderStyle::Hidden,
            "SkillTopic edge should be hidden by default"
        );

        // When endpoint is hovered, must be visible as curved arc
        assert_eq!(
            evaluate_edge_style(&skill_topic_edge, &nodes, Some("skill:1"), None, true),
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
            evaluate_edge_style(&proj_session_edge, &nodes, None, None, true),
            EdgeRenderStyle::OrbitRing,
            "ProjectSession in hybrid mode must render as OrbitRing"
        );

        // Tool usage edge must be CurvedArc
        let tool_edge = Edge {
            from: "conv:1".into(),
            to: "tool:read".into(),
            kind: EdgeKind::UsesTool,
            weight: 1.0,
        };
        assert_eq!(
            evaluate_edge_style(&tool_edge, &nodes, None, None, true),
            EdgeRenderStyle::CurvedArc,
            "UsesTool must render as CurvedArc"
        );
    }

    #[test]
    fn test_star_size_clamping() {
        // High degree and high access count
        let clamped_large = clamp_star_radius(1000, 10000, false);
        assert!(clamped_large <= 11.0, "Star radius must not exceed 11.0, got {clamped_large}");
        assert!(clamped_large >= 5.5, "Star radius must be at least 5.5, got {clamped_large}");

        // Low activity
        let small = clamp_star_radius(0, 0, false);
        assert_eq!(small, 5.5, "Low activity star should be 5.5");

        // Generic root
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
        // 50 candidates at different positions
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
        // Add a duplicate node with lower priority
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

        // Test collision suppression: 2 candidates at the exact same screen coordinates
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
}
