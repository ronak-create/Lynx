"use client";
import { useEffect, useReducer } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE, AgentStatus, api } from "@/lib/api";

export type JobLiveState = {
  jobStatus: "loading" | "queued" | "running" | "completed" | "failed";
  entity: { id: string; name: string; description?: string | null; ticker?: string | null } | null;
  agents: Record<string, { status: AgentStatus; message: string | null }>;
  categories: Record<string, { status: "completed" | "failed"; payload: Record<string, unknown> }>;
};

type Action =
  | { type: "snapshot"; state: Partial<JobLiveState> }
  | { type: "agent"; agent: string; status: AgentStatus; message?: string | null }
  | { type: "category"; agent: string; payload: Record<string, unknown> }
  | { type: "entity"; entity: JobLiveState["entity"] }
  | { type: "job"; status: JobLiveState["jobStatus"] };

const AGENT_ORDER = [
  "overview",
  "profile",
  "stock",
  "financials",
  "funding",
  "products",
  "web_presence",
  "people",
  "news",
  "social",
  "patents",
  "competitors",
  "legitimacy",
  "signals",
  "careers",
  "synthesis",
  "documentary",
];

function initialAgents(): JobLiveState["agents"] {
  return Object.fromEntries(AGENT_ORDER.map((a) => [a, { status: "pending" as AgentStatus, message: null }]));
}

function reducer(state: JobLiveState, action: Action): JobLiveState {
  switch (action.type) {
    case "snapshot":
      return { ...state, ...action.state };
    case "agent":
      return {
        ...state,
        agents: {
          ...state.agents,
          [action.agent]: {
            status: action.status,
            message: action.message ?? state.agents[action.agent]?.message ?? null,
          },
        },
      };
    case "category":
      return {
        ...state,
        categories: { ...state.categories, [action.agent]: { status: "completed", payload: action.payload } },
      };
    case "entity":
      return { ...state, entity: action.entity };
    case "job":
      return { ...state, jobStatus: action.status };
  }
}

export function useJobEvents(jobId: string): JobLiveState {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(reducer, {
    jobStatus: "loading",
    entity: null,
    agents: initialAgents(),
    categories: {},
  });

  useEffect(() => {
    let closed = false;
    let source: EventSource | null = null;

    // snapshot first (covers revisiting completed runs), then live events
    api
      .job(jobId)
      .then((job) => {
        if (closed) return;
        const agents = initialAgents();
        for (const [cat, res] of Object.entries(job.categories)) {
          agents[cat] = { status: res.status === "completed" ? "completed" : "failed", message: null };
        }
        if (job.has_document) agents.documentary = { status: "completed", message: null };
        dispatch({
          type: "snapshot",
          state: {
            jobStatus: job.status as JobLiveState["jobStatus"],
            entity: job.entity,
            agents,
            categories: job.categories,
          },
        });
        if (job.status === "completed" || job.status === "failed") return;

        source = new EventSource(`${API_BASE}/jobs/${jobId}/events`);
        const on = (type: string, handler: (data: Record<string, unknown>) => void) =>
          source!.addEventListener(type, (e) => handler(JSON.parse((e as MessageEvent).data)));

        on("job_started", () => dispatch({ type: "job", status: "running" }));
        on("entity_resolved", (d) =>
          dispatch({
            type: "entity",
            entity: {
              id: d.entity_id as string,
              name: d.name as string,
              description: d.description as string | null,
              ticker: d.ticker as string | null,
            },
          }),
        );
        on("agent_started", (d) => dispatch({ type: "agent", agent: d.agent as string, status: "running" }));
        on("agent_progress", (d) =>
          dispatch({
            type: "agent",
            agent: d.agent as string,
            status: "running",
            message: (d.message as string) ?? null,
          }),
        );
        on("agent_completed", (d) => {
          dispatch({ type: "agent", agent: d.agent as string, status: "completed" });
          queryClient.invalidateQueries({ queryKey: ["graph", jobId] });
          if (d.agent === "documentary") queryClient.invalidateQueries({ queryKey: ["document", jobId] });
        });
        on("agent_failed", (d) =>
          dispatch({
            type: "agent",
            agent: d.agent as string,
            status: "failed",
            message: (d.error as string) ?? "failed",
          }),
        );
        on("category_data", (d) => {
          const { agent, ...payload } = d;
          dispatch({ type: "category", agent: agent as string, payload });
        });
        on("graph_delta", () => queryClient.invalidateQueries({ queryKey: ["graph", jobId] }));
        on("job_completed", (d) => {
          dispatch({ type: "job", status: (d.status as JobLiveState["jobStatus"]) ?? "completed" });
          queryClient.invalidateQueries({ queryKey: ["graph", jobId] });
          queryClient.invalidateQueries({ queryKey: ["document", jobId] });
          source?.close();
        });
      })
      .catch(() => dispatch({ type: "job", status: "failed" }));

    return () => {
      closed = true;
      source?.close();
    };
  }, [jobId, queryClient]);

  return state;
}
