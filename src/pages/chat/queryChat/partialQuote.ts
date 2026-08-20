import { MessageItem, MessageType } from "@abd-im/wasm-client-sdk";

export interface QuoteDraft {
  message: MessageItem;
  quoteText?: string;
  quoteOffset?: number;
  sourceText?: string;
}

export interface PartialQuoteElem {
  text: string;
  quoteMessage: MessageItem;
  quoteText?: string;
  quoteOffset?: number;
}

export interface QuoteSelection {
  text: string;
  offset: number;
  sourceText: string;
  rect: DOMRect;
}

const textOffset = (root: Node, node: Node, offset: number) => {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
};

export const captureQuoteSelection = (row: HTMLElement): QuoteSelection | undefined => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const source =
    (range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement
    )?.closest<HTMLElement>("[data-quote-source]") ?? undefined;
  if (!source || !row.contains(source)) return;
  if (!source.contains(range.startContainer) || !source.contains(range.endContainer)) {
    return;
  }

  const sourceText = source.textContent ?? "";
  const start = textOffset(source, range.startContainer, range.startOffset);
  const end = textOffset(source, range.endContainer, range.endOffset);
  const quoteText = sourceText.slice(start, end);
  if (!quoteText.trim() || Array.from(quoteText).length > 1024) return;
  return {
    text: quoteText,
    offset: start,
    sourceText,
    rect: range.getBoundingClientRect(),
  };
};

export const createQuoteSnapshot = (draft: QuoteDraft) => {
  if (!draft.quoteText || draft.sourceText === undefined) return draft.message;
  return {
    ...draft.message,
    contentType: MessageType.TextMessage,
    content: JSON.stringify({ content: draft.sourceText }),
    textElem: { content: draft.sourceText },
    streamElem: undefined,
    quoteElem: undefined,
  } as MessageItem;
};

const boundaryAt = (root: HTMLElement, targetOffset: number) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (targetOffset <= consumed + length) {
      return { node, offset: targetOffset - consumed };
    }
    consumed += length;
    node = walker.nextNode();
  }
};

export const spotlightQuote = (
  row: HTMLElement,
  quoteText?: string,
  quoteOffset = 0,
) => {
  const content = row.querySelector<HTMLElement>("[data-quote-source]");
  const chat = document.getElementById("chat-main-content");
  if (!content || !chat) return;

  const sourceText = content.textContent ?? "";
  let start = quoteOffset;
  if (!quoteText || sourceText.slice(start, start + quoteText.length) !== quoteText) {
    start = quoteText ? sourceText.indexOf(quoteText) : 0;
  }
  const startBoundary = boundaryAt(content, Math.max(0, start));
  const endBoundary = quoteText
    ? boundaryAt(content, Math.max(0, start) + quoteText.length)
    : undefined;

  const clear = () => {
    chat.removeAttribute("data-quote-spotlight");
    row.removeAttribute("data-quote-spotlight-target");
    window.getSelection()?.removeAllRanges();
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("pointerdown", onPointerDown);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") clear();
  };
  const onPointerDown = (event: PointerEvent) => {
    if (!row.contains(event.target as Node)) clear();
  };

  chat.setAttribute("data-quote-spotlight", "true");
  row.setAttribute("data-quote-spotlight-target", "true");
  if (start >= 0 && startBoundary && endBoundary) {
    const range = document.createRange();
    range.setStart(startBoundary.node, startBoundary.offset);
    range.setEnd(endBoundary.node, endBoundary.offset);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  document.addEventListener("keydown", onKeyDown);
  window.setTimeout(() => document.addEventListener("pointerdown", onPointerDown));
  window.setTimeout(clear, 8000);
};
