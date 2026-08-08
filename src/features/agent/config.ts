type Extension = Record<string, unknown>;

const isExtension = (value: unknown): value is Extension =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseExtension = (ex?: string): Extension => {
  if (!ex) return {};

  try {
    const parsed: unknown = JSON.parse(ex);
    return isExtension(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const agentUserIDFromEx = (ex?: string): string | undefined => {
  const agent = parseExtension(ex).agent;
  if (!isExtension(agent) || typeof agent.userID !== "string") return undefined;
  return agent.userID || undefined;
};

export const agentUserEx = (existingEx: string | undefined, userID: string): string => {
  const parsed = parseExtension(existingEx);
  const previousAgent = parsed.agent;

  return JSON.stringify({
    ...parsed,
    agent: {
      ...(isExtension(previousAgent) ? previousAgent : {}),
      userID,
    },
  });
};
