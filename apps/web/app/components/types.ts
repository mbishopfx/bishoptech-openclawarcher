export type AgentStatus = 'idle' | 'working' | 'collaborating' | 'thinking';

export interface Agent {
  id: string;
  name: string;
  role: string;
  color: string;
  position: { x: number; y: number };
  status: AgentStatus;
  currentTask: string;
  trail: { x: number; y: number }[];
}

export interface Bucket {
  id: string;
  name: string;
  description?: string;
  color?: string;
  endpoint_key: string;
  created_at: string;
}

export interface AgentLog {
  id: string;
  bucket_id: string;
  agent_id: string;
  status: string;
  summary?: string;
  output: string;
  created_at: string;
}

export interface BucketItem {
  id: string;
  bucket_id: string;
  title?: string | null;
  source: string;
  shared_url?: string | null;
  raw_text?: string | null;
  normalized_text: string;
  status: 'queued' | 'in_progress' | 'done' | 'failed';
  created_at: string;
}
