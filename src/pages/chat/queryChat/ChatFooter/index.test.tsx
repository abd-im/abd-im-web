import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useComposerStore } from "@/store/composer";
import { prepareDesktopExit, resumeDesktopTasks } from "@/utils/desktopTasks";

import ChatFooter from ".";
import type { AttachmentType } from "./attachmentType";

const mocks = vi.hoisted(() => ({
  createAttachment: vi.fn(),
  createComponent: vi.fn(),
  enterToSend: undefined as undefined | (() => void),
  sendMessage: vi.fn(),
  feedback: vi.fn(),
  addFiles: undefined as
    | undefined
    | ((files: readonly File[], type?: AttachmentType) => void),
  editorValue: "",
}));

vi.mock("@/store/composer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/store/composer")>();
  return {
    useComposerStore: Object.assign(
      (
        select: (state: ReturnType<typeof actual.useComposerStore.getState>) => unknown,
      ) => select(actual.useComposerStore.getState()),
      actual.useComposerStore,
    ),
  };
});
vi.mock("./ComposerAttachments", () => ({ default: () => null }));
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
  IMSDK: { createComponentMessage: mocks.createComponent },
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
  useFileMessage: () => ({ getUploadedAttachmentBody: mocks.createAttachment }),
}));
vi.mock("./useSendMessage", () => ({
  useSendMessage: () => ({ sendMessage: mocks.sendMessage }),
}));

const file = { name: "photo.png", type: "image/png" } as File;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.createComponent.mockReset().mockResolvedValue({ data: { clientMsgID: "t1" } });
  mocks.createAttachment
    .mockReset()
    .mockResolvedValue({ components: [{ type: 12, items: [] }], attachments: [] });
  mocks.sendMessage.mockReset().mockImplementation(async ({ prepare }) => {
    await prepare?.();
    return true;
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
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
  vi.restoreAllMocks();
});

describe("merged attachment input and desktop update protection", () => {
  it("restores the account's conversation draft alongside the new attachment callback", () => {
    expect(mocks.editorValue).toBe("<p>Saved draft</p>");
    expect(mocks.addFiles).toBeTypeOf("function");
  });

  it("creates even plain text through the component entry", async () => {
    mocks.enterToSend?.();
    await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledOnce());
    expect(mocks.createComponent).toHaveBeenCalledWith(
      expect.objectContaining({
        components: [{ type: 10, id: 1, content: "<p>Saved draft</p>" }],
      }),
    );
    expect(mocks.sendMessage).toHaveBeenCalledOnce();
  });

  it("creates one ordered component body for text and an attachment", async () => {
    mocks.addFiles?.([file], "image");
    renderToStaticMarkup(<ChatFooter />);
    mocks.enterToSend?.();
    await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledOnce());
    expect(mocks.createAttachment).toHaveBeenCalledWith(
      file,
      "image",
      expect.any(String),
    );
    await vi.waitFor(() => expect(mocks.createComponent).toHaveBeenCalledTimes(2));
    expect(
      mocks.createComponent.mock.calls[0][0].components.map(
        (c: { type: number }) => c.type,
      ),
    ).toEqual([10, 12]);
    expect(mocks.sendMessage).toHaveBeenCalledOnce();
  });

  it("includes the filename required by file components", async () => {
    const markdown = { name: "storage.md", type: "text/markdown", size: 123 } as File;
    mocks.addFiles?.([markdown], "file");
    renderToStaticMarkup(<ChatFooter />);
    mocks.enterToSend?.();
    await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledOnce());
    expect(mocks.createComponent.mock.calls[0][0].components).toContainEqual(
      expect.objectContaining({
        type: 13,
        name: "storage.md",
        size: 123,
        spoiler: false,
      }),
    );
  });

  it("releases the composer while attachments upload and preserves a newer send lock", async () => {
    let uploaded!: (body: unknown) => void;
    const upload = new Promise((resolve) => {
      uploaded = resolve;
    });
    mocks.createAttachment.mockReturnValue(upload);
    mocks.addFiles?.([file], "image");
    renderToStaticMarkup(<ChatFooter />);
    const sending = mocks.enterToSend?.();
    await vi.waitFor(() => expect(mocks.createAttachment).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledOnce());
    expect(mocks.sendMessage.mock.calls[0][0].prepare).toBeTypeOf("function");
    expect(useComposerStore.getState().sending).toEqual([]);
    expect(useComposerStore.getState().attachments["u1:c1"]).toBeUndefined();
    useComposerStore.getState().add("u1:c1", [{ id: "next", file, type: "image" }]);
    expect(useComposerStore.getState().startSending("u1:c1")).toBe(true);
    uploaded({ components: [{ type: 12, items: [] }], attachments: [] });
    await sending;
    expect(useComposerStore.getState().sending).toEqual(["u1:c1"]);
    expect(useComposerStore.getState().attachments["u1:c1"][0].id).toBe("next");
  });

  it("starts uploading selected files without sending them", async () => {
    mocks.addFiles?.([file], "image");
    await vi.waitFor(() =>
      expect(mocks.createAttachment).toHaveBeenCalledWith(
        file,
        "image",
        expect.any(String),
      ),
    );
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("blocks update installation throughout message preparation and transmission", async () => {
    let prepared!: (message: unknown) => void;
    let sent!: (value: boolean) => void;
    mocks.createComponent.mockImplementationOnce(
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
    expect(mocks.createComponent).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});
