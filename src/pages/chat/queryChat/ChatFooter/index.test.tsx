import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useComposerStore } from "@/store/composer";
import { prepareDesktopExit, resumeDesktopTasks } from "@/utils/desktopTasks";

import ChatFooter from ".";
import type { AttachmentType } from "./attachmentType";

const mocks = vi.hoisted(() => ({
  createAttachment: vi.fn(),
  createText: vi.fn(),
  enterToSend: undefined as undefined | (() => void),
  sendMessage: vi.fn(),
  feedback: vi.fn(),
  addFiles: undefined as
    | undefined
    | ((files: readonly File[], type?: AttachmentType) => void),
  editorValue: "",
}));

vi.mock("@/components/CKEditor", async () => {
  const { forwardRef } = await import("react");
  return {
    default: forwardRef(
      (
        { value, onEnter }: { value: string; onEnter: typeof mocks.enterToSend },
        _ref,
      ) => {
        mocks.enterToSend = onEnter;
        mocks.editorValue = value;
        return null;
      },
    ),
  };
});
vi.mock("@/components/CKEditor/utils", () => ({
  getCleanText: (value: string) => value,
}));
vi.mock("@/hooks/useUserDisplayName", () => ({
  useUserDisplayName: () => "",
  useUserDisplayNameResolver: () => () => "",
}));
vi.mock("@/layout/MainContentWrap", () => ({
  IMSDK: { createTextMessage: mocks.createText },
}));
vi.mock("@/store", () => ({
  useConversationStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        currentConversation: { conversationID: "c1", conversationType: 1 },
        updateQuoteMessage: vi.fn(),
      }),
    { getState: () => ({ currentConversation: { conversationID: "c1" } }) },
  ),
  useUserStore: (selector: (state: unknown) => unknown) =>
    selector({ selfInfo: { userID: "u1" } }),
}));
vi.mock("@/utils/common", () => ({ feedbackToast: mocks.feedback }));
vi.mock("../messagePreview", () => ({ getMessagePreview: () => "" }));
vi.mock("../partialQuote", () => ({ createQuoteSnapshot: vi.fn() }));
vi.mock("./SendActionBar", () => ({
  default: ({ onAddFiles }: { onAddFiles: typeof mocks.addFiles }) => {
    mocks.addFiles = onAddFiles;
    return null;
  },
}));
vi.mock("./SendActionBar/useFileMessage", () => ({
  useFileMessage: () => ({ getAttachmentMessage: mocks.createAttachment }),
}));
vi.mock("./useSendMessage", () => ({
  useSendMessage: () => ({ sendMessage: mocks.sendMessage }),
}));

const file = { name: "photo.png", type: "image/png" } as File;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.createText.mockReset().mockResolvedValue({ data: { clientMsgID: "t1" } });
  mocks.createAttachment.mockReset().mockResolvedValue({ clientMsgID: "m1" });
  mocks.sendMessage.mockReset().mockResolvedValue(true);
  vi.stubGlobal("localStorage", {
    removeItem: vi.fn(),
    getItem: (key: string) =>
      key === "desktop-draft:u1:chat:c1" ? "<p>Saved draft</p>" : null,
  });
  renderToStaticMarkup(<ChatFooter />);
});
afterEach(() => {
  useComposerStore.getState().clear();
  resumeDesktopTasks();
  vi.unstubAllGlobals();
});

describe("merged attachment input and desktop update protection", () => {
  it("restores the account's conversation draft alongside the new attachment callback", () => {
    expect(mocks.editorValue).toBe("<p>Saved draft</p>");
    expect(mocks.addFiles).toBeTypeOf("function");
  });

  it("queues selected files without preparing or sending them", () => {
    mocks.addFiles?.([file], "image");
    expect(mocks.createAttachment).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("blocks update installation throughout message preparation and transmission", async () => {
    let prepared!: (message: unknown) => void;
    let sent!: (value: boolean) => void;
    mocks.createText.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          prepared = resolve;
        }),
    );
    mocks.sendMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          sent = resolve;
        }),
    );
    mocks.enterToSend?.();
    expect(await prepareDesktopExit()).toBe("busy");
    prepared({ data: { clientMsgID: "m1" } });
    await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledOnce());
    expect(await prepareDesktopExit()).toBe("busy");
    sent(true);
    await vi.waitFor(async () => expect(await prepareDesktopExit()).toBe("ready"));
  });

  it("does not start sending once installation preparation has begun", async () => {
    expect(await prepareDesktopExit()).toBe("ready");
    mocks.enterToSend?.();
    expect(mocks.createText).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});
