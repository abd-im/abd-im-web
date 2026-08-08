import type { GroupItem } from "@abd-im/wasm-client-sdk/lib/types/entity";

export const AGENT_WORKSPACE_KIND = "agent_workspace" as const;
export const AGENT_WORKSPACE_VERSION = 1 as const;

export type ConversationKind = "chat" | typeof AGENT_WORKSPACE_KIND;
export type GroupExtension = Record<string, unknown>;

export const parseGroupEx = (ex?: string): GroupExtension => {
  if (!ex) return {};

  try {
    const parsed: unknown = JSON.parse(ex);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as GroupExtension;
  } catch {
    return {};
  }
};

export const conversationKind = (ex?: string): ConversationKind => {
  const parsed = parseGroupEx(ex);
  const abd = parsed.abd;
  if (!abd || typeof abd !== "object" || Array.isArray(abd)) return "chat";

  const marker = abd as Record<string, unknown>;
  return marker.kind === AGENT_WORKSPACE_KIND &&
    marker.version === AGENT_WORKSPACE_VERSION
    ? AGENT_WORKSPACE_KIND
    : "chat";
};

export const agentWorkspaceEx = (existingEx?: string): string => {
  const parsed = parseGroupEx(existingEx);
  const previousAbd = parsed.abd;
  const abd =
    previousAbd && typeof previousAbd === "object" && !Array.isArray(previousAbd)
      ? previousAbd
      : {};

  return JSON.stringify({
    ...parsed,
    abd: {
      ...(abd as Record<string, unknown>),
      kind: AGENT_WORKSPACE_KIND,
      version: AGENT_WORKSPACE_VERSION,
    },
  });
};

export const workspaceKindUpdates = (groups: Pick<GroupItem, "groupID" | "ex">[]) =>
  groups.reduce<Record<string, ConversationKind>>((result, group) => {
    result[group.groupID] = conversationKind(group.ex);
    return result;
  }, {});
