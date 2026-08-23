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

type Packet = Record<string, unknown> & { event: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const createInitialView = (runId?: string): AgentRunView => ({
  runId,
  status: "running",
  activitySummaries: [],
  activitySteps: [],
  tools: new Map<string, AgentToolView>(),
  approvals: new Map<string, AgentApprovalView>(),
  answer: "",
  artifacts: [],
});

const parseMetadata = (content: string): { runId: string } | null => {
  try {
    const value: unknown = JSON.parse(content);
    if (!isRecord(value)) return null;
    const runId = stringValue(value.runId);
    if (
      value.schema !== "abd.agent_run" ||
      value.schemaVersion !== 2 ||
      !runId ||
      !stringValue(value.triggerMessageId)
    ) {
      return null;
    }
    return { runId };
  } catch {
    return null;
  }
};

const parsePacket = (raw: string): Packet | null => {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return null;
    const event = stringValue(value.event);
    return event ? ({ ...value, event } as Packet) : null;
  } catch {
    return null;
  }
};

const contentText = (value: unknown): string => {
  if (!isRecord(value) || value.type !== "text" || typeof value.text !== "string") {
    return "";
  }
  return value.text;
};

const contentArrayText = (value: unknown): string =>
  Array.isArray(value) ? value.map(contentText).join("") : "";

const toolStatus = (value: unknown): AgentToolStatus => {
  switch (value) {
    case "failed":
    case "cancelled":
      return value;
    case "completed":
      return "completed";
    default:
      return "running";
  }
};

const setStatusFromApprovals = (view: AgentRunView) => {
  if (["completed", "failed", "cancelled"].includes(view.status)) return;
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
  if (!metadata) return { view: createInitialView(), unsupported: true };

  const view = createInitialView(metadata.runId);
  const itemTypes = new Map<string, string>();
  const itemText = new Map<string, string>();
  const finalMessageIds: string[] = [];
  const commentaryMessageIds = new Set<string>();
  const reasoningSummaryIndexes = new Map<string, number>();
  const reasoningStepIndexes = new Map<string, number>();
  let terminal = false;

  for (const raw of packets) {
    const packet = parsePacket(raw);
    if (!packet) return { view: createInitialView(metadata.runId), unsupported: true };

    switch (packet.event) {
      case "run.queued":
        view.status = "queued";
        break;
      case "run.started":
        view.status = "running";
        break;
      case "item.started": {
        if (!isRecord(packet.item)) break;
        const id = stringValue(packet.item.id);
        const type = stringValue(packet.item.type);
        if (!id || !type) break;
        itemTypes.set(id, type);
        itemText.set(id, contentArrayText(packet.item.content));
        if (type === "message") {
          const phase = stringValue(packet.item.phase) ?? "commentary";
          if (phase === "final" && !finalMessageIds.includes(id))
            finalMessageIds.push(id);
          if (phase === "commentary") commentaryMessageIds.add(id);
        } else if (type === "tool") {
          view.tools.set(id, {
            callId: id,
            name: stringValue(packet.item.name) ?? "tool",
            summary: stringValue(packet.item.title),
            status: toolStatus(packet.item.status),
            durationMs: numberValue(packet.item.durationMs),
          });
          if (
            !view.activitySteps.some(
              (step) => step.kind === "tool" && step.callId === id,
            )
          ) {
            view.activitySteps.push({ kind: "tool", callId: id });
          }
        } else if (type === "artifact") {
          const name = stringValue(packet.item.name);
          if (name) {
            view.artifacts.push({
              name,
              mediaType: stringValue(packet.item.mediaType),
              size: numberValue(packet.item.size),
              attachmentId: stringValue(packet.item.attachmentId),
            });
          }
        }
        break;
      }
      case "item.delta": {
        const itemId = stringValue(packet.itemId);
        if (!itemId) break;
        const delta = contentText(packet.content);
        if (!delta) break;
        const text = (itemText.get(itemId) ?? "") + delta;
        itemText.set(itemId, text);
        if (itemTypes.get(itemId) === "reasoning" || commentaryMessageIds.has(itemId)) {
          let summaryIndex = reasoningSummaryIndexes.get(itemId);
          let stepIndex = reasoningStepIndexes.get(itemId);
          if (summaryIndex === undefined || stepIndex === undefined) {
            summaryIndex = view.activitySummaries.length;
            stepIndex = view.activitySteps.length;
            reasoningSummaryIndexes.set(itemId, summaryIndex);
            reasoningStepIndexes.set(itemId, stepIndex);
            view.activitySummaries.push(text);
            view.activitySteps.push({ kind: "summary", text });
          } else {
            view.activitySummaries[summaryIndex] = text;
            view.activitySteps[stepIndex] = { kind: "summary", text };
          }
        }
        break;
      }
      case "item.updated": {
        const itemId = stringValue(packet.itemId);
        if (
          !itemId ||
          !isRecord(packet.update) ||
          packet.update.type !== "tool.state"
        ) {
          break;
        }
        const previous = view.tools.get(itemId);
        view.tools.set(itemId, {
          callId: itemId,
          name: previous?.name ?? "tool",
          summary: stringValue(packet.update.title) ?? previous?.summary,
          status: toolStatus(packet.update.status),
          durationMs: numberValue(packet.update.durationMs) ?? previous?.durationMs,
        });
        break;
      }
      case "item.completed": {
        const itemId = stringValue(packet.itemId);
        if (!itemId || itemTypes.get(itemId) !== "tool") break;
        const previous = view.tools.get(itemId);
        if (!previous) break;
        view.tools.set(itemId, { ...previous, status: toolStatus(packet.outcome) });
        break;
      }
      case "permission.requested": {
        if (!isRecord(packet.request)) break;
        const requestId = stringValue(packet.request.id);
        if (!requestId) break;
        const options = Array.isArray(packet.request.options)
          ? packet.request.options
              .filter(isRecord)
              .map((option) => stringValue(option.id))
              .filter((id): id is string => Boolean(id))
          : [];
        view.approvals.set(requestId, {
          requestId,
          name: stringValue(packet.request.title) ?? "permission",
          summary: stringValue(packet.request.description),
          choices: options,
          pending: true,
        });
        setStatusFromApprovals(view);
        break;
      }
      case "permission.resolved": {
        if (!isRecord(packet.resolution)) break;
        const requestId = stringValue(packet.resolution.requestId);
        if (!requestId) break;
        const previous = view.approvals.get(requestId);
        if (!previous) break;
        view.approvals.set(requestId, {
          ...previous,
          pending: false,
          decision:
            stringValue(packet.resolution.optionId) ??
            stringValue(packet.resolution.outcome),
        });
        setStatusFromApprovals(view);
        break;
      }
      case "run.finished": {
        terminal = true;
        const outcome = stringValue(packet.outcome);
        view.status =
          outcome === "completed"
            ? "completed"
            : outcome === "cancelled"
            ? "cancelled"
            : "failed";
        view.durationMs = numberValue(packet.durationMs);
        if (view.status === "failed") {
          view.statusSummary =
            stringValue(packet.errorCode) ?? stringValue(packet.reason);
        }
        break;
      }
      default:
        break;
    }
  }

  view.answer = finalMessageIds.map((id) => itemText.get(id) ?? "").join("");
  if (ended && !terminal) {
    view.status = "failed";
    view.statusSummary = "incomplete_stream";
  }
  return { view, unsupported: false };
}
