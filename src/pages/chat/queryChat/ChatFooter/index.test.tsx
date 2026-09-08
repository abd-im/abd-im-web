import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prepareDesktopExit, resumeDesktopTasks } from "@/utils/desktopTasks";
import type { AttachmentType } from "./attachmentType";
import ChatFooter from ".";

const mocks = vi.hoisted(() => ({
  createAttachment: vi.fn(),
  sendMessage: vi.fn(),
  feedback: vi.fn(),
  sendFiles: undefined as
    | undefined
    | ((files: readonly File[], type?: AttachmentType) => Promise<void>),
  editorValue: "",
}));

vi.mock("@/components/CKEditor", async () => {
  const { forwardRef } = await import("react");
  return {
    default: forwardRef(({ value }: { value: string }, _ref) => {
      mocks.editorValue = value;
      return null;
    }),
  };
});
vi.mock("@/components/CKEditor/utils", () => ({
  getCleanText: (value: string) => value,
}));
vi.mock("@/hooks/useUserDisplayName", () => ({ useUserDisplayName: () => "" }));
vi.mock("@/layout/MainContentWrap", () => ({ IMSDK: {} }));
vi.mock("@/store", () => ({
  useConversationStore: (selector: (state: unknown) => unknown) =>
    selector({
      currentConversation: { conversationID: "c1", conversationType: 1 },
      updateQuoteMessage: vi.fn(),
    }),
  useUserStore: (selector: (state: unknown) => unknown) =>
    selector({ selfInfo: { userID: "u1" } }),
}));
vi.mock("@/utils/common", () => ({ feedbackToast: mocks.feedback }));
vi.mock("../messagePreview", () => ({ getMessagePreview: () => "" }));
vi.mock("../partialQuote", () => ({ createQuoteSnapshot: vi.fn() }));
vi.mock("./SendActionBar", () => ({
  default: ({ sendFiles }: { sendFiles: typeof mocks.sendFiles }) => {
    mocks.sendFiles = sendFiles;
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
  mocks.createAttachment.mockReset().mockResolvedValue({ clientMsgID: "m1" });
  mocks.sendMessage.mockReset().mockResolvedValue(true);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) =>
      key === "desktop-draft:u1:chat:c1" ? "<p>Saved draft</p>" : null,
  });
  renderToStaticMarkup(<ChatFooter />);
});
afterEach(() => {
  resumeDesktopTasks();
  vi.unstubAllGlobals();
});

describe("merged attachment input and desktop update protection", () => {
  it("restores the account's conversation draft alongside the new attachment callback", () => {
    expect(mocks.editorValue).toBe("<p>Saved draft</p>");
    expect(mocks.sendFiles).toBeTypeOf("function");
  });

  it("blocks update installation throughout attachment preparation and transmission", async () => {
    let prepared!: (message: unknown) => void;
    let sent!: (value: boolean) => void;
    mocks.createAttachment.mockImplementationOnce(
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
    const sending = mocks.sendFiles!([file], "image");
    expect(await prepareDesktopExit()).toBe("busy");
    prepared({ clientMsgID: "m1" });
    await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledOnce());
    expect(await prepareDesktopExit()).toBe("busy");
    sent(true);
    await sending;
    expect(mocks.createAttachment).toHaveBeenCalledWith(file, "image");
    expect(await prepareDesktopExit()).toBe("ready");
  });

  it("does not start attachment work once installation preparation has begun", async () => {
    expect(await prepareDesktopExit()).toBe("ready");
    await mocks.sendFiles!([file]);
    expect(mocks.createAttachment).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("reports a failed attachment, continues the batch, and releases the busy state", async () => {
    const error = new Error("Unreadable attachment");
    mocks.createAttachment.mockRejectedValueOnce(error);
    await mocks.sendFiles!([file, file]);
    expect(mocks.feedback).toHaveBeenCalledWith({ error });
    expect(mocks.sendMessage).toHaveBeenCalledOnce();
    expect(await prepareDesktopExit()).toBe("ready");
  });
});
