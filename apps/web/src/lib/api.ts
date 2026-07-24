export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Suggestion = {
  name: string;
  kind: "wikipedia" | "sec";
  url: string | null;
  ticker: string | null;
};

export type AgentStatus = "pending" | "running" | "completed" | "failed";

export type LayerStatus = "pending" | "running" | "hit" | "empty" | "skipped" | "failed";
export type LayerInfo = {
  name: string;
  source: string;
  status: LayerStatus;
  count: number;
  detail?: string | null;
};

export type CategoryState = { status: "completed" | "failed"; payload: Record<string, unknown> };

export type JobDetail = {
  job_id: string;
  query: string;
  status: string;
  error: string | null;
  entity: {
    id: string;
    name: string;
    description: string | null;
    ticker: string | null;
    wikipedia_url: string | null;
  } | null;
  categories: Record<string, CategoryState>;
  has_document: boolean;
};

export type GraphNode = { id: string; name: string; type: string; is_root: boolean };
export type GraphLink = {
  id: string;
  source: string;
  target: string;
  type: string;
  confidence: number;
  attrs: Record<string, unknown>;
};
export type GraphData = { root_id: string; nodes: GraphNode[]; links: GraphLink[] };

export type EntityDetail = {
  id: string;
  name: string;
  type: string;
  summary: string | null;
  attrs: Record<string, unknown>;
  analysis: string | null;
  claims: {
    predicate: string;
    value: { text?: string };
    confidence: number;
    source: { id: string; url: string | null } | null;
  }[];
  edges: {
    type: string;
    direction: "in" | "out";
    other: { id: string; name: string; type: string } | null;
    confidence: number;
    attrs: Record<string, unknown>;
  }[];
};

export type LlmProvider = {
  id: string;
  label: string;
  model?: string | null;
  configured: boolean;
};
export type CategoryOption = { id: string; label: string };
export type AppConfig = { llm_providers: LlmProvider[]; categories: CategoryOption[] };

export type ResearchOptions = { llm_provider?: string | null; categories?: string[] | null };

export type CompareCell = { text: string; sort: number | null };
export type CompareMetric = { key: string; label: string; cells: CompareCell[]; best: number | null };
export type CompareResult = {
  entities: { job_id: string; name: string; ticker: string | null; description: string | null }[];
  metrics: CompareMetric[];
};

export type ChatSource = { label: string; snippet: string };
export type ChatAnswer = { answer: string; grounded: boolean; sources: ChatSource[] };

export type LiveQuote = { ticker: string; price: number; currency: string | null; market_cap: number | null };
export type RunChange = {
  key: string;
  label: string;
  from: string;
  to: string;
  direction: "up" | "down" | null;
  delta_pct?: number;
  favorable?: boolean | null;
};
export type RunChanges = {
  has_previous: boolean;
  previous_job_id?: string;
  previous_at?: string;
  changes: RunChange[];
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  config: () => fetch(`${API_BASE}/config`).then((r) => json<AppConfig>(r)),
  autocomplete: (q: string) =>
    fetch(`${API_BASE}/autocomplete?q=${encodeURIComponent(q)}`).then((r) => json<Suggestion[]>(r)),
  startResearch: (query: string, options?: ResearchOptions) =>
    fetch(`${API_BASE}/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, options: options ?? {} }),
    }).then((r) => json<{ job_id: string }>(r)),
  job: (jobId: string) => fetch(`${API_BASE}/jobs/${jobId}`).then((r) => json<JobDetail>(r)),
  graph: (jobId: string) => fetch(`${API_BASE}/graph/${jobId}`).then((r) => json<GraphData>(r)),
  document: (jobId: string) =>
    fetch(`${API_BASE}/jobs/${jobId}/document`).then((r) =>
      json<{ markdown: string; method: string; entity_id: string }>(r),
    ),
  entity: (entityId: string) =>
    fetch(`${API_BASE}/entities/${entityId}`).then((r) => json<EntityDetail>(r)),
  analyze: (entityId: string) =>
    fetch(`${API_BASE}/entities/${entityId}/analysis`, { method: "POST" }).then((r) =>
      json<{ analysis: string; cached: boolean }>(r),
    ),
  runs: () =>
    fetch(`${API_BASE}/runs`).then((r) =>
      json<{ job_id: string; query: string; status: string; entity_name: string | null; created_at: string }[]>(r),
    ),
  compare: (jobIds: string[]) =>
    fetch(`${API_BASE}/compare?jobs=${encodeURIComponent(jobIds.join(","))}`).then((r) =>
      json<CompareResult>(r),
    ),
  quote: (ticker: string) => fetch(`${API_BASE}/quote/${ticker}`).then((r) => json<LiveQuote>(r)),
  changes: (jobId: string) => fetch(`${API_BASE}/runs/${jobId}/changes`).then((r) => json<RunChanges>(r)),
  ask: (jobId: string, question: string, history: { role: string; content: string }[]) =>
    fetch(`${API_BASE}/jobs/${jobId}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history }),
    }).then((r) => json<ChatAnswer>(r)),
};

export const NODE_COLORS: Record<string, string> = {
  company: "#a78bfa",
  person: "#7dd3fc",
  product: "#fb923c",
  technology: "#22d3ee",
  organization: "#f0abfc",
  investor: "#fcd34d",
  event: "#f472b6",
  location: "#fca5a5",
  industry: "#c4b5fd",
  article: "#94a3b8",
};

export const AGENT_LABELS: Record<string, string> = {
  overview: "Overview",
  profile: "Profile",
  stock: "Stock",
  financials: "Financials",
  funding: "Funding",
  products: "Products",
  web_presence: "Web Presence",
  people: "Key People",
  news: "News",
  social: "Community",
  patents: "Patents",
  competitors: "Competitors",
  legitimacy: "Legitimacy",
  signals: "Operational Signals",
  careers: "Careers",
  synthesis: "Synthesis",
  documentary: "Documentary",
};

export function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}
