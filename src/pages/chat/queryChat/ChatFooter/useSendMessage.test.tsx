import { MessageStatus, type MessageItem } from "@abd-im/wasm-client-sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSendMessage } from "./useSendMessage";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  update: vi.fn(),
  send: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("../useHistoryMessageList", () => ({
  pushNewMessage: mocks.push,
  updateOneMessage: mocks.update,
}));
vi.mock("../messagePreview", () => ({ getMessagePreview: () => "preview" }));
vi.mock("./messageRetry", () => ({ clearMessageRetry: mocks.clear }));
vi.mock("@/layout/MainContentWrap", () => ({ IMSDK: { sendMessage: mocks.send } }));
vi.mock("@/store", () => ({
  useConversationStore: Object.assign(
    (select: (s: unknown) => unknown) =>
      select({
        currentConversation: {
          conversationID: "c1",
          conversationType: 1,
          userID: "peer",
        },
      }),
    { getState: () => ({ currentConversation: { conversationID: "c1" } }) },
  ),
  useUserStore: (select: (s: unknown) => unknown) =>
    select({ selfInfo: { userID: "self", nickname: "Me", faceURL: "" } }),
}));

let sendMessage: ReturnType<typeof useSendMessage>["sendMessage"];
function Harness() {
  sendMessage = useSendMessage().sendMessage;
  return null;
}
const draft = () =>
  ({
    clientMsgID: "local-id",
    createTime: 123,
    contentType: 144,
    seq: 0,
    message: { flags: 32768, components: [{ type: 10, content: "draft" }] },
  } as MessageItem);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockImplementation(async ({ message }) => ({
    data: { ...message, status: MessageStatus.Succeed },
  }));
  renderToStaticMarkup(<Harness />);
});

describe("component attachment preparation", () => {
  it("shows a pending message before upload, then sends the final body with the same ID", async () => {
    let finish!: (message: MessageItem) => void;
    const uploaded = new Promise<MessageItem>((resolve) => {
      finish = resolve;
    });
    const message = draft();
    const pending = sendMessage({ message, prepare: () => uploaded });
    expect(mocks.push).toHaveBeenCalledWith(
      expect.objectContaining({
        clientMsgID: "local-id",
        status: MessageStatus.Sending,
      }),
    );
    expect(mocks.send).not.toHaveBeenCalled();
    finish({
      ...draft(),
      clientMsgID: "prepared-id",
      sessionType: 0,
      message: { flags: 32768, components: [{ type: 10, content: "uploaded" }] },
    });
    expect(await pending).toBe(true);
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        recvID: "peer",
        message: expect.objectContaining({
          clientMsgID: "local-id",
          createTime: 123,
          sendID: "self",
          sessionType: 1,
          message: expect.objectContaining({
            components: [{ type: 10, content: "uploaded" }],
          }),
        }),
      }),
    );
    expect(mocks.clear).toHaveBeenCalledWith("local-id");
  });

  it("keeps the failed local message and its retry data when upload fails", async () => {
    expect(
      await sendMessage({
        message: draft(),
        prepare: async () => {
          throw new Error("upload failed");
        },
      }),
    ).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        clientMsgID: "local-id",
        status: MessageStatus.Failed,
        message: draft().message,
      }),
    );
    expect(mocks.clear).not.toHaveBeenCalled();
  });
});
