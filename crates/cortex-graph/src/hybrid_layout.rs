use cortex_model::{
    EdgeKind, GraphSnapshot, HybridNodeLayout, NodeId, NodeKind, OrbitParameters, SystemRole,
};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::f32::consts::PI;

/// Deterministic FNV-1a 64-bit hash function
pub fn deterministic_hash(s: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

fn hash_to_float(hash: u64, max_val: f32) -> f32 {
    ((hash % 10000) as f32 / 10000.0) * max_val
}

/// Computes orbital position offset in 3D space given orbit parameters and elapsed time.
pub fn compute_orbital_offset(orbit: &OrbitParameters, time: f32) -> [f32; 3] {
    let theta = orbit.phase + orbit.angular_speed * time;
    let r = orbit.radius;
    let inc = orbit.inclination;
    let asc = orbit.ascending_node;

    let cos_theta = theta.cos();
    let sin_theta = theta.sin();
    let cos_inc = inc.cos();
    let sin_inc = inc.sin();
    let cos_asc = asc.cos();
    let sin_asc = asc.sin();

    let x = r * (cos_theta * cos_asc - sin_theta * sin_asc * cos_inc);
    let y = r * (sin_theta * sin_inc);
    let z = r * (cos_theta * sin_asc + sin_theta * cos_asc * cos_inc);

    [x, y, z]
}

/// Evaluates live 3D positions for all nodes at simulation time `t`.
pub fn evaluate_hybrid_positions(
    layout: &BTreeMap<NodeId, HybridNodeLayout>,
    time: f32,
) -> HashMap<NodeId, [f32; 3]> {
    let mut positions = HashMap::new();

    // Pass 1: Base positions (Stars, Anchors, Unaffiliated)
    for (id, node_layout) in layout {
        if node_layout.orbit.is_none() {
            positions.insert(id.clone(), node_layout.base_position);
        }
    }

    // Pass 2: Planets
    for (id, node_layout) in layout {
        if let Some(orbit) = &node_layout.orbit {
            if node_layout.role == SystemRole::Planet {
                let parent_pos = orbit
                    .parent_id
                    .as_ref()
                    .and_then(|pid| positions.get(pid))
                    .copied()
                    .unwrap_or([0.0, 0.0, 0.0]);
                let offset = compute_orbital_offset(orbit, time);
                positions.insert(id.clone(), [
                    parent_pos[0] + offset[0],
                    parent_pos[1] + offset[1],
                    parent_pos[2] + offset[2],
                ]);
            }
        }
    }

    // Pass 3: Moons
    for (id, node_layout) in layout {
        if let Some(orbit) = &node_layout.orbit {
            if node_layout.role == SystemRole::Moon {
                let parent_pos = orbit
                    .parent_id
                    .as_ref()
                    .and_then(|pid| positions.get(pid))
                    .copied()
                    .unwrap_or([0.0, 0.0, 0.0]);
                let offset = compute_orbital_offset(orbit, time);
                positions.insert(id.clone(), [
                    parent_pos[0] + offset[0],
                    parent_pos[1] + offset[1],
                    parent_pos[2] + offset[2],
                ]);
            }
        }
    }

    positions
}

/// Computes the deterministic 3D Hybrid (Solar-System) layout for the graph.
/// Hierarchy:
/// - Project = Star
/// - Conversation / Session = Planets orbiting their project's star
/// - Artifact / Task / Memory = Moons orbiting their conversation / session
/// - Tools = Hubs at weighted centroid of using stars
/// - Skills & Topics = Distant Skill Nebula grouped by Category
/// - Unaffiliated = Outer scatter shell
pub fn compute_hybrid_layout(
    snapshot: &GraphSnapshot,
    _neighbors: &HashMap<NodeId, Vec<NodeId>>,
) -> BTreeMap<NodeId, HybridNodeLayout> {
    let mut layout = BTreeMap::new();
    let nodes_by_id: HashMap<NodeId, &cortex_model::Node> =
        snapshot.nodes.iter().map(|n| (n.id.clone(), n)).collect();

    // 1. Identify Star Systems (Projects)
    let mut projects: Vec<&cortex_model::Node> = snapshot
        .nodes
        .iter()
        .filter(|n| n.kind == NodeKind::Project)
        .collect();
    // Sort deterministically by ID
    projects.sort_by(|a, b| a.id.cmp(&b.id));

    // Map: project_id -> list of planet node IDs
    let mut project_planets: BTreeMap<NodeId, Vec<NodeId>> = BTreeMap::new();
    // Map: planet_id -> list of moon node IDs
    let mut planet_moons: BTreeMap<NodeId, Vec<NodeId>> = BTreeMap::new();
    // Map: planet_id -> parent project_id
    let mut planet_to_project: HashMap<NodeId, NodeId> = HashMap::new();
    // Map: moon_id -> parent planet_id
    let mut moon_to_planet: HashMap<NodeId, NodeId> = HashMap::new();

    // Identify planets connected to projects
    for edge in &snapshot.edges {
        if edge.kind == EdgeKind::ProjectSession || edge.kind == EdgeKind::ProjectTask {
            if nodes_by_id.contains_key(&edge.to) && nodes_by_id.get(&edge.to).unwrap().kind == NodeKind::Project {
                project_planets.entry(edge.to.clone()).or_default().push(edge.from.clone());
                planet_to_project.insert(edge.from.clone(), edge.to.clone());
            } else if nodes_by_id.contains_key(&edge.from) && nodes_by_id.get(&edge.from).unwrap().kind == NodeKind::Project {
                project_planets.entry(edge.from.clone()).or_default().push(edge.to.clone());
                planet_to_project.insert(edge.to.clone(), edge.from.clone());
            }
        }
    }

    // Identify moons connected to planets
    for edge in &snapshot.edges {
        if edge.kind == EdgeKind::ArtifactConversation
            || edge.kind == EdgeKind::SessionMemory
            || edge.kind == EdgeKind::TaskLink
        {
            if planet_to_project.contains_key(&edge.to) {
                planet_moons.entry(edge.to.clone()).or_default().push(edge.from.clone());
                moon_to_planet.insert(edge.from.clone(), edge.to.clone());
            } else if planet_to_project.contains_key(&edge.from) {
                planet_moons.entry(edge.from.clone()).or_default().push(edge.to.clone());
                moon_to_planet.insert(edge.to.clone(), edge.from.clone());
            }
        }
    }

    // Sort planets and moons deterministically
    for planets in project_planets.values_mut() {
        planets.sort();
        planets.dedup();
    }
    for moons in planet_moons.values_mut() {
        moons.sort();
        moons.dedup();
    }

    // 2. Star Placement via Deterministic 3D Force-Directed Relaxation
    let num_stars = projects.len();
    let mut star_positions: HashMap<NodeId, [f32; 3]> = HashMap::new();

    let mut proj_id_to_idx: HashMap<&NodeId, usize> = HashMap::with_capacity(num_stars);
    for (idx, proj) in projects.iter().enumerate() {
        proj_id_to_idx.insert(&proj.id, idx);
    }

    // Build shared-connection attraction weights between stars (shared tools) in O(E)
    let mut tool_to_projects: HashMap<&NodeId, Vec<usize>> = HashMap::new();
    let mut tool_to_stars: HashMap<NodeId, HashSet<NodeId>> = HashMap::new();
    for edge in &snapshot.edges {
        if edge.kind == EdgeKind::UsesTool {
            if let Some(p) = planet_to_project.get(&edge.from) {
                tool_to_stars.entry(edge.to.clone()).or_default().insert(p.clone());
                if let Some(&p_idx) = proj_id_to_idx.get(p) {
                    let entry = tool_to_projects.entry(&edge.to).or_default();
                    if !entry.contains(&p_idx) {
                        entry.push(p_idx);
                    }
                }
            }
        }
    }

    let mut star_affinities: HashMap<(usize, usize), f32> = HashMap::new();
    for projs in tool_to_projects.values() {
        for i in 0..projs.len() {
            for j in (i + 1)..projs.len() {
                let p1 = projs[i];
                let p2 = projs[j];
                let key = if p1 < p2 { (p1, p2) } else { (p2, p1) };
                *star_affinities.entry(key).or_insert(0.0) += 1.0;
            }
        }
    }
    let mut affinity_vec: Vec<(usize, usize, f32)> = star_affinities.into_iter().map(|((i, j), w)| (i, j, w)).collect();
    affinity_vec.sort_by_key(|(i, j, _)| (*i, *j));

    // Star simulation flat structures
    let mut sim_pos: Vec<[f32; 3]> = Vec::with_capacity(num_stars);
    let mut sim_radii: Vec<f32> = Vec::with_capacity(num_stars);

    let golden_ratio = (1.0 + 5.0_f32.sqrt()) / 2.0;
    for (i, proj) in projects.iter().enumerate() {
        let planet_count = project_planets.get(&proj.id).map_or(0, |v| v.len());
        let sys_radius = 120.0 + (planet_count as f32).sqrt() * 65.0;
        sim_radii.push(sys_radius);

        let theta = 2.0 * PI * (i as f32) / golden_ratio;
        let phi = ((1.0 - 2.0 * (i as f32 + 0.5) / (num_stars.max(1) as f32)).clamp(-1.0, 1.0)).acos();
        let base_r = 320.0 + (i % 3) as f32 * 60.0;

        let x = base_r * phi.sin() * theta.cos();
        let y = base_r * phi.cos() * 0.5;
        let z = base_r * phi.sin() * theta.sin();
        sim_pos.push([x, y, z]);
    }

    // Adaptive relaxation iterations (fast in debug mode)
    let iters = if num_stars > 200 { 10 } else { 30 };
    let mut forces: Vec<[f32; 3]> = vec![[0.0, 0.0, 0.0]; num_stars];
    for _iter in 0..iters {
        forces.fill([0.0, 0.0, 0.0]);

        // Repulsion between star systems enforcing collision radii
        for i in 0..num_stars {
            for j in (i + 1)..num_stars {
                let pos1 = sim_pos[i];
                let pos2 = sim_pos[j];

                let dx = pos2[0] - pos1[0];
                let dy = pos2[1] - pos1[1];
                let dz = pos2[2] - pos1[2];
                let dist_sq = dx * dx + dy * dy + dz * dz;
                let min_dist = sim_radii[i] + sim_radii[j] + 80.0;
                let min_dist_sq = min_dist * min_dist;

                if dist_sq < min_dist_sq && dist_sq > 0.0001 {
                    let dist = dist_sq.sqrt();
                    let overlap = min_dist - dist;
                    let factor = overlap * 0.4 / dist;
                    let nx = dx * factor;
                    let ny = dy * factor;
                    let nz = dz * factor;

                    forces[i][0] -= nx;
                    forces[i][1] -= ny;
                    forces[i][2] -= nz;

                    forces[j][0] += nx;
                    forces[j][1] += ny;
                    forces[j][2] += nz;
                }
            }
        }

        // Attraction from shared connections
        for &(i, j, weight) in &affinity_vec {
            let pos1 = sim_pos[i];
            let pos2 = sim_pos[j];

            let dx = pos2[0] - pos1[0];
            let dy = pos2[1] - pos1[1];
            let dz = pos2[2] - pos1[2];
            let dist = (dx * dx + dy * dy + dz * dz).sqrt().max(1.0);

            let desired = (sim_radii[i] + sim_radii[j]) * 1.2;
            if dist > desired {
                let factor = (dist - desired) * 0.02 * (weight.min(5.0)) / dist;
                let fx = dx * factor;
                let fy = dy * factor;
                let fz = dz * factor;

                forces[i][0] += fx;
                forces[i][1] += fy;
                forces[i][2] += fz;

                forces[j][0] -= fx;
                forces[j][1] -= fy;
                forces[j][2] -= fz;
            }
        }

        // Apply forces with damping
        for i in 0..num_stars {
            sim_pos[i][0] += forces[i][0] * 0.2;
            sim_pos[i][1] += forces[i][1] * 0.2;
            sim_pos[i][2] += forces[i][2] * 0.2;
        }
    }

    for (i, proj) in projects.iter().enumerate() {
        star_positions.insert(proj.id.clone(), sim_pos[i]);
    }

    // Register Star nodes
    for proj in &projects {
        let pos = star_positions[&proj.id];
        layout.insert(
            proj.id.clone(),
            HybridNodeLayout {
                role: SystemRole::Star,
                base_position: pos,
                orbit: None,
            },
        );
    }

    // 3. Planets Orbit Parameters
    for (proj_id, planets) in &project_planets {
        let _star_pos = star_positions[proj_id];
        for (i, planet_id) in planets.iter().enumerate() {
            let h = deterministic_hash(planet_id);

            // Radius on bounded sqrt scale enforcing minimum separation from star (min 55)
            let radius = 55.0 + ((i as f32) + 1.0).sqrt() * 38.0;
            // Slight tilt (-12° to +12°) for 3D depth
            let inclination = ((h % 100) as f32 / 100.0 * 0.42) - 0.21;
            let ascending_node = ((h.rotate_left(7) % 360) as f32) * PI / 180.0;
            let phase = ((h.rotate_left(14) % 360) as f32) * PI / 180.0;
            let speed_base = 0.12 + hash_to_float(h.rotate_left(21), 0.15);
            let angular_speed = if h.is_multiple_of(2) { speed_base } else { -speed_base };

            layout.insert(
                planet_id.clone(),
                HybridNodeLayout {
                    role: SystemRole::Planet,
                    base_position: [0.0, 0.0, 0.0], // Position is relative to parent star
                    orbit: Some(OrbitParameters {
                        parent_id: Some(proj_id.clone()),
                        radius,
                        inclination,
                        ascending_node,
                        phase,
                        angular_speed,
                    }),
                },
            );

            // 4. Moons Orbit Parameters
            if let Some(moons) = planet_moons.get(planet_id) {
                for (j, moon_id) in moons.iter().enumerate() {
                    let mh = deterministic_hash(moon_id);

                    // Moons clear of planet: minimum radius 18
                    let m_radius = 18.0 + ((j as f32) + 1.0).sqrt() * 12.0;
                    let m_inclination = ((mh % 100) as f32 / 100.0 * 0.5) - 0.25;
                    let m_ascending = ((mh.rotate_left(5) % 360) as f32) * PI / 180.0;
                    let m_phase = ((mh.rotate_left(11) % 360) as f32) * PI / 180.0;
                    let m_speed_base = 0.35 + hash_to_float(mh.rotate_left(19), 0.25);
                    let m_speed = if mh.is_multiple_of(2) { m_speed_base } else { -m_speed_base };

                    layout.insert(
                        moon_id.clone(),
                        HybridNodeLayout {
                            role: SystemRole::Moon,
                            base_position: [0.0, 0.0, 0.0], // Relative to planet
                            orbit: Some(OrbitParameters {
                                parent_id: Some(planet_id.clone()),
                                radius: m_radius,
                                inclination: m_inclination,
                                ascending_node: m_ascending,
                                phase: m_phase,
                                angular_speed: m_speed,
                            }),
                        },
                    );
                }
            }
        }
    }

    // 5. Tool Hubs: Centroid between systems using the tool
    let tools: Vec<&cortex_model::Node> = snapshot
        .nodes
        .iter()
        .filter(|n| n.kind == NodeKind::Tool)
        .collect();

    for tool in tools {
        let connected_stars = tool_to_stars.get(&tool.id);
        let th = deterministic_hash(&tool.id);
        let pos = if let Some(stars) = connected_stars {
            if !stars.is_empty() {
                let mut sum_x = 0.0;
                let mut sum_y = 0.0;
                let mut sum_z = 0.0;
                let count = stars.len() as f32;

                for sid in stars {
                    if let Some(sp) = star_positions.get(sid) {
                        sum_x += sp[0];
                        sum_y += sp[1];
                        sum_z += sp[2];
                    }
                }

                // Offset slightly to avoid tool stacking
                let offset_y = ((th % 60) as f32) - 30.0;
                let offset_z = ((th.rotate_left(8) % 60) as f32) - 30.0;
                [sum_x / count, (sum_y / count) + offset_y, (sum_z / count) + offset_z]
            } else {
                let angle = ((th % 360) as f32) * PI / 180.0;
                let r = 180.0 + ((th % 100) as f32);
                [r * angle.cos(), ((th % 50) as f32) - 25.0, r * angle.sin()]
            }
        } else {
            // Placed in inner hub circle
            let angle = ((th % 360) as f32) * PI / 180.0;
            let r = 180.0 + ((th % 100) as f32);
            [r * angle.cos(), ((th % 50) as f32) - 25.0, r * angle.sin()]
        };

        layout.insert(
            tool.id.clone(),
            HybridNodeLayout {
                role: SystemRole::ToolHub,
                base_position: pos,
                orbit: None,
            },
        );
    }

    // 6. Skill Nebula: Distant cluster away from systems
    let categories: Vec<&cortex_model::Node> = snapshot
        .nodes
        .iter()
        .filter(|n| n.kind == NodeKind::Topic && n.subkind.as_deref() == Some("category"))
        .collect();

    let num_cats = categories.len().max(1);
    let mut category_positions: HashMap<NodeId, [f32; 3]> = HashMap::new();

    // Place categories along a distant spherical band (radius 950 - 1200)
    for (i, cat) in categories.iter().enumerate() {
        let theta = 2.0 * PI * (i as f32) / (num_cats as f32);
        let phi = 0.85 + (i % 3) as f32 * 0.25;
        let r = 1000.0 + (i % 4) as f32 * 50.0;

        let x = r * phi.sin() * theta.cos();
        let y = (r * phi.cos() * 0.6) + ((i % 5) as f32 * 30.0 - 60.0);
        let z = r * phi.sin() * theta.sin();

        category_positions.insert(cat.id.clone(), [x, y, z]);
        layout.insert(
            cat.id.clone(),
            HybridNodeLayout {
                role: SystemRole::NebulaAnchor,
                base_position: [x, y, z],
                orbit: None,
            },
        );
    }

    // Build index of category positions for fast O(1) lookup
    let mut node_to_cat_pos: HashMap<NodeId, [f32; 3]> = HashMap::new();
    for edge in &snapshot.edges {
        if edge.kind == EdgeKind::SkillTopic {
            if let Some(pos) = category_positions.get(&edge.to) {
                node_to_cat_pos.insert(edge.from.clone(), *pos);
            } else if let Some(pos) = category_positions.get(&edge.from) {
                node_to_cat_pos.insert(edge.to.clone(), *pos);
            }
        }
    }

    // Place skills and tags around their category anchors
    for node in &snapshot.nodes {
        if node.kind == NodeKind::Skill || (node.kind == NodeKind::Topic && node.subkind.as_deref() == Some("tag")) {
            let nh = deterministic_hash(&node.id);
            let base_cat = node_to_cat_pos.get(&node.id).copied().unwrap_or([900.0, 200.0, 0.0]);

            let angle = ((nh % 360) as f32) * PI / 180.0;
            let elev = (((nh.rotate_left(6) % 180) as f32) - 90.0) * PI / 180.0;
            let dist = if node.kind == NodeKind::Skill {
                35.0 + hash_to_float(nh.rotate_left(12), 45.0)
            } else {
                75.0 + hash_to_float(nh.rotate_left(15), 50.0)
            };

            let x = base_cat[0] + dist * elev.cos() * angle.cos();
            let y = base_cat[1] + dist * elev.sin();
            let z = base_cat[2] + dist * elev.cos() * angle.sin();

            layout.insert(
                node.id.clone(),
                HybridNodeLayout {
                    role: SystemRole::NebulaItem,
                    base_position: [x, y, z],
                    orbit: None,
                },
            );
        }
    }

    // 7. Unaffiliated Nodes: Outer Scatter Shell
    for node in &snapshot.nodes {
        if !layout.contains_key(&node.id) {
            let uh = deterministic_hash(&node.id);
            let theta = ((uh % 360) as f32) * PI / 180.0;
            let phi = ((uh.rotate_left(9) % 180) as f32) * PI / 180.0;
            let r = 1450.0 + hash_to_float(uh.rotate_left(17), 250.0);

            let x = r * phi.sin() * theta.cos();
            let y = r * phi.cos() * 0.6;
            let z = r * phi.sin() * theta.sin();

            layout.insert(
                node.id.clone(),
                HybridNodeLayout {
                    role: SystemRole::Unaffiliated,
                    base_position: [x, y, z],
                    orbit: None,
                },
            );
        }
    }

    layout
}

#[cfg(test)]
mod tests {
    use super::*;
    use cortex_model::{Edge, Node, NodeKind, TimestampStats};

    #[test]
    fn test_layout_determinism() {
        let node1 = Node {
            id: "project:cortex".into(),
            source_id: "test".into(),
            kind: NodeKind::Project,
            title: "Cortex".into(),
            body_preview: "".into(),
            path: None,
            tags: vec![],
            created_at: None,
            modified_at: None,
            last_active_at: None,
            access_count: 5,
            pinned: false,
            degree: 2,
            importance: 1.0,
            freshness: 1.0,
            is_ambient: false,
            is_generic_root: false,
            timestamp_source: None,
            subkind: None,
            hidden_by_default: false,
            metadata: serde_json::Value::Null,
        };

        let node2 = Node {
            id: "conv:1".into(),
            source_id: "test".into(),
            kind: NodeKind::Conversation,
            title: "Conv 1".into(),
            body_preview: "".into(),
            path: None,
            tags: vec![],
            created_at: None,
            modified_at: None,
            last_active_at: None,
            access_count: 1,
            pinned: false,
            degree: 1,
            importance: 0.8,
            freshness: 0.8,
            is_ambient: false,
            is_generic_root: false,
            timestamp_source: None,
            subkind: None,
            hidden_by_default: false,
            metadata: serde_json::Value::Null,
        };

        let edge = Edge {
            from: "conv:1".into(),
            to: "project:cortex".into(),
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

        let neighbors = HashMap::new();
        let l1 = compute_hybrid_layout(&snapshot, &neighbors);
        let l2 = compute_hybrid_layout(&snapshot, &neighbors);

        // Determinism test: same input -> identical output
        let json1 = serde_json::to_string(&l1).unwrap();
        let json2 = serde_json::to_string(&l2).unwrap();
        assert_eq!(json1, json2, "Hybrid layout must be strictly deterministic");

        // Role verification
        assert_eq!(l1["project:cortex"].role, SystemRole::Star);
        assert_eq!(l1["conv:1"].role, SystemRole::Planet);
        assert!(l1["conv:1"].orbit.is_some());
        assert_eq!(l1["conv:1"].orbit.as_ref().unwrap().parent_id.as_deref(), Some("project:cortex"));

        // Minimum separation
        assert!(l1["conv:1"].orbit.as_ref().unwrap().radius >= 50.0);
    }

    #[test]
    fn test_minimum_separation_invariants_and_bounds() {
        let star = Node {
            id: "proj:star".into(),
            source_id: "test".into(),
            kind: NodeKind::Project,
            title: "Star Project".into(),
            body_preview: "".into(),
            path: None,
            tags: vec![],
            created_at: None,
            modified_at: None,
            last_active_at: None,
            access_count: 5,
            pinned: false,
            degree: 2,
            importance: 1.0,
            freshness: 1.0,
            is_ambient: false,
            is_generic_root: false,
            timestamp_source: None,
            subkind: None,
            hidden_by_default: false,
            metadata: serde_json::Value::Null,
        };

        let planet = Node {
            id: "conv:planet".into(),
            source_id: "test".into(),
            kind: NodeKind::Conversation,
            title: "Planet Conv".into(),
            body_preview: "".into(),
            path: None,
            tags: vec![],
            created_at: None,
            modified_at: None,
            last_active_at: None,
            access_count: 1,
            pinned: false,
            degree: 2,
            importance: 0.8,
            freshness: 0.8,
            is_ambient: false,
            is_generic_root: false,
            timestamp_source: None,
            subkind: None,
            hidden_by_default: false,
            metadata: serde_json::Value::Null,
        };

        let moon = Node {
            id: "art:moon".into(),
            source_id: "test".into(),
            kind: NodeKind::Artifact,
            title: "Moon Artifact".into(),
            body_preview: "".into(),
            path: None,
            tags: vec![],
            created_at: None,
            modified_at: None,
            last_active_at: None,
            access_count: 1,
            pinned: false,
            degree: 1,
            importance: 0.5,
            freshness: 0.5,
            is_ambient: false,
            is_generic_root: false,
            timestamp_source: None,
            subkind: None,
            hidden_by_default: false,
            metadata: serde_json::Value::Null,
        };

        let edges = vec![
            Edge {
                from: "conv:planet".into(),
                to: "proj:star".into(),
                kind: EdgeKind::ProjectSession,
                weight: 1.0,
            },
            Edge {
                from: "art:moon".into(),
                to: "conv:planet".into(),
                kind: EdgeKind::ArtifactConversation,
                weight: 1.0,
            },
        ];

        let snapshot = GraphSnapshot {
            nodes: vec![star, planet, moon],
            edges,
            events: vec![],
            sources: vec![],
            timestamp_stats: TimestampStats::default(),
            shared_projects: vec![],
        };

        let neighbors = HashMap::new();
        let l = compute_hybrid_layout(&snapshot, &neighbors);

        let p_orbit = l["conv:planet"].orbit.as_ref().unwrap();
        let m_orbit = l["art:moon"].orbit.as_ref().unwrap();

        // Planet clear of star
        assert!(p_orbit.radius >= 55.0);
        // Moon clear of planet
        assert!(m_orbit.radius >= 18.0);
        // Angular speed is non-zero
        assert!(p_orbit.angular_speed.abs() > 0.05);
        assert!(m_orbit.angular_speed.abs() > 0.05);
        // Inclination within small tilt range
        assert!(p_orbit.inclination.abs() <= 0.35);
        assert!(m_orbit.inclination.abs() <= 0.35);
    }

    #[test]
    fn test_synthetic_10k_nodes_performance() {
        let start = std::time::Instant::now();
        let mut nodes = Vec::with_capacity(10_000);
        let mut edges = Vec::with_capacity(15_000);

        for i in 0..10_000 {
            let kind = match i % 10 {
                0 => NodeKind::Project,
                1 | 2 => NodeKind::Conversation,
                3 | 4 => NodeKind::Session,
                5 | 6 => NodeKind::Artifact,
                7 => NodeKind::Skill,
                8 => NodeKind::Topic,
                _ => NodeKind::Tool,
            };

            nodes.push(Node {
                id: format!("synth:{i}"),
                source_id: "synth".into(),
                kind,
                title: format!("Synthetic Node {i}"),
                body_preview: "".into(),
                path: None,
                tags: vec![],
                created_at: None,
                modified_at: None,
                last_active_at: None,
                access_count: 1,
                pinned: false,
                degree: 1,
                importance: 0.5,
                freshness: 0.5,
                is_ambient: matches!(kind, NodeKind::Skill | NodeKind::Topic | NodeKind::Tool),
                is_generic_root: false,
                timestamp_source: None,
                subkind: None,
                hidden_by_default: false,
                metadata: serde_json::Value::Null,
            });

            if i > 0 && i % 10 != 0 {
                let star_idx = (i / 10) * 10;
                edges.push(Edge {
                    from: format!("synth:{i}"),
                    to: format!("synth:{star_idx}"),
                    kind: EdgeKind::ProjectSession,
                    weight: 1.0,
                });
            }
        }

        let snapshot = GraphSnapshot {
            nodes,
            edges,
            events: vec![],
            sources: vec![],
            timestamp_stats: TimestampStats::default(),
            shared_projects: vec![],
        };

        let neighbors = HashMap::new();
        let layout = compute_hybrid_layout(&snapshot, &neighbors);
        let elapsed = start.elapsed();

        println!("Synthetic 10,000-node hybrid layout computed in: {:?}", elapsed);
        assert_eq!(layout.len(), 10_000);
        assert!(elapsed.as_millis() < 500, "10k layout should compute in under 500ms");
    }
}
