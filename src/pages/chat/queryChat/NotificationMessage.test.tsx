import type { MessageItem } from "@abd-im/wasm-client-sdk";
import { MessageType } from "@abd-im/wasm-client-sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import NotificationMessage from "./NotificationMessage";

vi.mock("@/store", () => ({
  useUserStore: (selector: (state: { selfInfo: { userID: string } }) => unknown) =>
    selector({ selfInfo: { userID: "self-user" } }),
}));

vi.mock("@/utils/imCommon", () => ({
  notificationMessageFormat: () => '<img src=x onerror="alert(1)">',
}));

describe("NotificationMessage", () => {
  it("renders formatted notification content as text", () => {
    const message = {
      clientMsgID: "message-1",
      contentType: MessageType.FriendAdded,
    } as unknown as MessageItem;

    const markup = renderToStaticMarkup(<NotificationMessage message={message} />);

    expect(markup).toContain("&lt;img");
    expect(markup).not.toContain("<img");
  });
});
