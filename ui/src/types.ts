export type NodeKind =
  | 'project'
  | 'session'
  | 'conversation'
  | 'skill'
  | 'topic'
  | 'artifact'
  | 'task'
  | 'memory'
  | 'tool';

export type EdgeKind =
  | 'contains'
  | 'project_session'
  | 'parent_session'
  | 'uses_tool'
  | 'related_skill'
  | 'skill_topic'
  | 'artifact_conversation'
  | 'project_task'
  | 'task_link'
  | 'session_memory'
  | 'wikilink';

export interface Node {
  id: string;
  source_id: string;
  kind: NodeKind;
  title: string;
  body_preview: string;
  path?: string;
  tags: string[];
  created_at?: string;
  modified_at?: string;
  last_active_at?: string;
  access_count: number;
  pinned: boolean;
  degree: number;
  importance: number;
  freshness: number;
  is_ambient: boolean;
  is_generic_root: boolean;
  timestamp_source?: string;
  subkind?: string;
  hidden_by_default: boolean;
  metadata: Record<string, unknown>;
}

export interface Edge {
  from: string;
  to: string;
  kind: EdgeKind;
  weight: number;
}

export interface Event {
  id: string;
  ts: string;
  source_id: string;
  node_id?: string;
  kind: string;
  detail: string;
}

export type HealthStatus = 'ok' | 'degraded' | 'missing';

export interface AdapterWarning {
  code: string;
  message: string;
  path?: string;
}

export interface AdapterHealth {
  source_id: string;
  name: string;
  status: HealthStatus;
  version?: string;
  base_path?: string;
  warnings: AdapterWarning[];
  items_scanned: number;
  scan_duration_ms: number;
}

export interface TimestampStats {
  real_timestamp_count: number;
  fallback_timestamp_count: number;
  earliest_date?: string;
  latest_date?: string;
}

export interface GraphSnapshot {
  nodes: Node[];
  edges: Edge[];
  events: Event[];
  sources: AdapterHealth[];
  timestamp_stats: TimestampStats;
  shared_projects: string[];
}

export interface EnrichedGraphSnapshot {
  snapshot: GraphSnapshot;
  neighbors: Record<string, string[]>;
  positions: Record<string, [number, number, number]>;
}

export type ViewMode = 'web' | 'hybrid' | 'timeline';

export interface LayoutEngine {
  id: ViewMode;
  name: string;
  description: string;
  compute(
    nodes: Node[],
    edges: Edge[],
    timestamps: TimestampStats,
    precomputed?: Record<string, [number, number, number]>
  ): Map<string, [number, number, number]>;
}
