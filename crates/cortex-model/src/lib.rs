use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub type NodeId = String;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    Project,
    Session,
    Conversation,
    Skill,
    Topic,
    Artifact,
    Task,
    Memory,
    Persona,
    Tool,
}

impl std::fmt::Display for NodeKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            NodeKind::Project => write!(f, "Project"),
            NodeKind::Session => write!(f, "Session"),
            NodeKind::Conversation => write!(f, "Conversation"),
            NodeKind::Skill => write!(f, "Skill"),
            NodeKind::Topic => write!(f, "Topic"),
            NodeKind::Artifact => write!(f, "Artifact"),
            NodeKind::Task => write!(f, "Task"),
            NodeKind::Memory => write!(f, "Memory"),
            NodeKind::Persona => write!(f, "Persona"),
            NodeKind::Tool => write!(f, "Tool"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Node {
    pub id: NodeId,
    pub source_id: String,
    pub kind: NodeKind,
    pub title: String,
    pub body_preview: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_active_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub access_count: u32,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub degree: u32,
    #[serde(default)]
    pub importance: f32,
    #[serde(default)]
    pub freshness: f32,
    #[serde(default)]
    pub is_ambient: bool,
    #[serde(default)]
    pub is_generic_root: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subkind: Option<String>,
    #[serde(default)]
    pub hidden_by_default: bool,
    #[serde(default)]
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeKind {
    Contains,
    ProjectSession,
    ParentSession,
    UsesTool,
    RelatedSkill,
    SkillTopic,
    ArtifactConversation,
    ProjectTask,
    TaskLink,
    SessionMemory,
    Wikilink,
}

impl std::fmt::Display for EdgeKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EdgeKind::Contains => write!(f, "Contains"),
            EdgeKind::ProjectSession => write!(f, "ProjectSession"),
            EdgeKind::ParentSession => write!(f, "ParentSession"),
            EdgeKind::UsesTool => write!(f, "UsesTool"),
            EdgeKind::RelatedSkill => write!(f, "RelatedSkill"),
            EdgeKind::SkillTopic => write!(f, "SkillTopic"),
            EdgeKind::ArtifactConversation => write!(f, "ArtifactConversation"),
            EdgeKind::ProjectTask => write!(f, "ProjectTask"),
            EdgeKind::TaskLink => write!(f, "TaskLink"),
            EdgeKind::SessionMemory => write!(f, "SessionMemory"),
            EdgeKind::Wikilink => write!(f, "Wikilink"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Edge {
    pub from: NodeId,
    pub to: NodeId,
    pub kind: EdgeKind,
    #[serde(default = "default_edge_weight")]
    pub weight: f32,
}

fn default_edge_weight() -> f32 {
    1.0
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    Activity,
    SessionStarted,
    SessionEnded,
    MessageSent,
    TaskCreated,
    TaskCompleted,
    ArtifactUpdated,
    ToolCalled,
    MemoryCreated,
}

impl std::fmt::Display for EventKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventKind::Activity => write!(f, "Activity"),
            EventKind::SessionStarted => write!(f, "SessionStarted"),
            EventKind::SessionEnded => write!(f, "SessionEnded"),
            EventKind::MessageSent => write!(f, "MessageSent"),
            EventKind::TaskCreated => write!(f, "TaskCreated"),
            EventKind::TaskCompleted => write!(f, "TaskCompleted"),
            EventKind::ArtifactUpdated => write!(f, "ArtifactUpdated"),
            EventKind::ToolCalled => write!(f, "ToolCalled"),
            EventKind::MemoryCreated => write!(f, "MemoryCreated"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Event {
    pub id: String,
    pub ts: DateTime<Utc>,
    pub source_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_id: Option<NodeId>,
    pub kind: EventKind,
    pub detail: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Ok,
    Degraded,
    Missing,
}

impl std::fmt::Display for HealthStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HealthStatus::Ok => write!(f, "OK"),
            HealthStatus::Degraded => write!(f, "Degraded"),
            HealthStatus::Missing => write!(f, "Missing"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AdapterWarning {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AdapterHealth {
    pub source_id: String,
    pub name: String,
    pub status: HealthStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_path: Option<String>,
    #[serde(default)]
    pub warnings: Vec<AdapterWarning>,
    #[serde(default)]
    pub items_scanned: usize,
    #[serde(default)]
    pub scan_duration_ms: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct TimestampStats {
    pub real_timestamp_count: usize,
    pub fallback_timestamp_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub earliest_date: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_date: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GraphSnapshot {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub events: Vec<Event>,
    pub sources: Vec<AdapterHealth>,
    pub timestamp_stats: TimestampStats,
    pub shared_projects: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct ScanStats {
    pub nodes_count: usize,
    pub edges_count: usize,
    pub events_count: usize,
    pub sources_count: usize,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OrbitParameters {
    pub parent_id: Option<NodeId>,
    pub radius: f32,
    pub inclination: f32,
    pub ascending_node: f32,
    pub phase: f32,
    pub angular_speed: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SystemRole {
    Star,
    Planet,
    Moon,
    ToolHub,
    NebulaAnchor,
    NebulaItem,
    Unaffiliated,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HybridNodeLayout {
    pub role: SystemRole,
    pub base_position: [f32; 3],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub orbit: Option<OrbitParameters>,
}
