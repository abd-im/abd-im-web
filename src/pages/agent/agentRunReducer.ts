export type AgentRunStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentToolStatus = "running" | "completed" | "failed" | "cancelled";

export interface AgentToolView {
  callId: string;
  name: string;
  summary?: string;
  status: AgentToolStatus;
  durationMs?: number;
}

export interface AgentApprovalView {
  requestId: string;
  name: string;
  summary?: string;
  choices: string[];
  pending: boolean;
  decision?: string;
}

export interface AgentArtifactView {
  name: string;
  mediaType?: string;
  size?: number;
  attachmentId?: string;
}

export type AgentRunActivityStep =
  | { kind: "summary"; text: string }
  | { kind: "tool"; callId: string };

export interface AgentRunView {
  runId?: string;
  status: AgentRunStatus;
  statusSummary?: string;
  activitySummaries: string[];
  activitySteps: AgentRunActivityStep[];
  durationMs?: number;
  tools: Map<string, AgentToolView>;
  approvals: Map<string, AgentApprovalView>;
  answer: string;
  artifacts: AgentArtifactView[];
}

export interface AgentRunReduction {
  view: AgentRunView;
  unsupported: boolean;
}

type Packet = Record<string, unknown> & { kind: string };

const RUN_STATUSES = new Set<AgentRunStatus>([
  "queued",
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "cancelled",
]);

const TOOL_STATUSES = new Set<AgentToolStatus>([
  "running",
  "completed",
  "failed",
  "cancelled",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const createInitialView = (runId?: string, status: AgentRunStatus = "running") => ({
  runId,
  status,
  activitySummaries: [],
  activitySteps: [],
  tools: new Map<string, AgentToolView>(),
  approvals: new Map<string, AgentApprovalView>(),
  answer: "",
  artifacts: [],
});

const parseMetadata = (
  content: string,
): { runId?: string; status?: AgentRunStatus } | null => {
  try {
    const value: unknown = JSON.parse(content);
    if (!isRecord(value)) return null;
    const status = stringValue(value.status);
    return {
      runId: stringValue(value.runId),
      status:
        status && RUN_STATUSES.has(status as AgentRunStatus)
          ? (status as AgentRunStatus)
          : undefined,
    };
  } catch {
    return null;
  }
};

const parsePacket = (raw: string): Packet | null => {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return {} as Packet;
    const kind = stringValue(value.kind);
    return kind ? ({ ...value, kind } as Packet) : ({} as Packet);
  } catch {
    return null;
  }
};

const setStatusFromApprovals = (view: AgentRunView) => {
  if (
    view.status === "completed" ||
    view.status === "failed" ||
    view.status === "cancelled"
  ) {
    return;
  }
  view.status = [...view.approvals.values()].some((approval) => approval.pending)
    ? "waiting_approval"
    : "running";
};

export function reduceAgentRun(
  content: string,
  packets: readonly string[] = [],
  ended = false,
): AgentRunReduction {
  const metadata = parseMetadata(content);
  if (!metadata) {
    return { view: createInitialView(), unsupported: true };
  }

  const metadataStatus =
    metadata.status && RUN_STATUSES.has(metadata.status) ? metadata.status : "running";
  const view: AgentRunView = createInitialView(metadata.runId, metadataStatus);

  for (const raw of packets) {
    const packet = parsePacket(raw);
    if (!packet) {
      return { view: createInitialView(metadata.runId), unsupported: true };
    }

    switch (packet.kind) {
      case "run.queued":
        view.status = "queued";
        break;
      case "run.started":
        view.status = "running";
        break;
      case "activity.summary": {
        const summary = stringValue(packet.text);
        if (
          summary &&
          view.activitySummaries[view.activitySummaries.length - 1] !== summary
        ) {
          view.activitySummaries.push(summary);
          view.activitySteps.push({ kind: "summary", text: summary });
        }
        break;
      }
      case "tool.started": {
        const callId = stringValue(packet.callId);
        const name = stringValue(packet.name);
        if (!callId || !name) break;
        const previous = view.tools.get(callId);
        view.tools.set(callId, {
          callId,
          name,
          summary: stringValue(packet.summary) ?? previous?.summary,
          status: "running",
          durationMs: previous?.durationMs,
        });
        if (!view.activitySteps.some((step) => step.kind === "tool" && step.callId === callId)) {
          view.activitySteps.push({ kind: "tool", callId });
        }
        break;
      }
      case "tool.completed": {
        const callId = stringValue(packet.callId);
        if (!callId) break;
        const previous = view.tools.get(callId);
        const status = stringValue(packet.status);
        view.tools.set(callId, {
          callId,
          name: previous?.name ?? stringValue(packet.name) ?? "Tool",
          summary: stringValue(packet.summary) ?? previous?.summary,
          status:
            status && TOOL_STATUSES.has(status as AgentToolStatus)
              ? (status as AgentToolStatus)
              : "completed",
          durationMs: numberValue(packet.durationMs) ?? previous?.durationMs,
        });
        if (!view.activitySteps.some((step) => step.kind === "tool" && step.callId === callId)) {
          view.activitySteps.push({ kind: "tool", callId });
        }
        break;
      }
      case "approval.requested": {
        const requestId = stringValue(packet.requestId);
        const name = stringValue(packet.name);
        if (!requestId || !name) break;
        view.approvals.set(requestId, {
          requestId,
          name,
          summary: stringValue(packet.summary),
          choices: stringArray(packet.choices),
          pending: true,
        });
        setStatusFromApprovals(view);
        break;
      }
      case "approval.resolved": {
        const requestId = stringValue(packet.requestId);
        if (!requestId) break;
        const previous = view.approvals.get(requestId);
        if (!previous) break;
        view.approvals.set(requestId, {
          ...previous,
          pending: false,
          decision: stringValue(packet.decision),
        });
        setStatusFromApprovals(view);
        break;
      }
      case "answer.delta": {
        const text = typeof packet.text === "string" ? packet.text : "";
        view.answer += text;
        break;
      }
      case "artifact": {
        const name = stringValue(packet.name);
        if (!name) break;
        const attachmentId = stringValue(packet.attachmentId);
        if (
          attachmentId &&
          view.artifacts.some((artifact) => artifact.attachmentId === attachmentId)
        ) {
          break;
        }
        view.artifacts.push({
          name,
          mediaType: stringValue(packet.mediaType),
          size: numberValue(packet.size),
          attachmentId,
        });
        break;
      }
      case "run.completed":
        view.status = "completed";
        view.durationMs = numberValue(packet.durationMs);
        break;
      case "run.failed":
        view.status = "failed";
        view.statusSummary = stringValue(packet.summary);
        view.durationMs = numberValue(packet.durationMs);
        break;
      case "run.cancelled":
        view.status = "cancelled";
        view.durationMs = numberValue(packet.durationMs);
        break;
      default:
        break;
    }
  }

  if (
    ended &&
    view.status !== "completed" &&
    view.status !== "failed" &&
    view.status !== "cancelled"
  ) {
    view.status = "completed";
  }

  return { view, unsupported: false };
}
