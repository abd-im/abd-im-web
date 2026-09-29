import { MessageItem, MessageType } from "@abd-im/wasm-client-sdk";

// Reuse the native merge envelope for the existing merged-record fallback.
// Only this versioned marker opts a merge message into inline rendering.
export const COMPOSITE_MESSAGE_EX = JSON.stringify({ abdComposite: { version: 1 } });

const partTypes = new Set([
  MessageType.TextMessage,
  MessageType.QuoteMessage,
  MessageType.PictureMessage,
  MessageType.VideoMessage,
  MessageType.FileMessage,
]);

export function getCompositeParts(message: MessageItem): MessageItem[] | undefined {
  if (message.contentType !== MessageType.MergeMessage) return;
  try {
    const extension = JSON.parse(message.ex || "{}") as {
      abdComposite?: { version?: number };
    } | null;
    if (extension?.abdComposite?.version !== 1) return;
  } catch {
    return;
  }
  const parts = message.mergeElem?.multiMessage;
  if (!Array.isArray(parts) || !parts.length) return;
  if (parts.some((part) => !part || !partTypes.has(part.contentType))) return;
  return parts;
}
