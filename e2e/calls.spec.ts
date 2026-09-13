import { expect, test } from "@playwright/test";

const previewURL = `${
  process.env.ABD_UI_BASE_URL || "http://localhost:5180"
}/ui-preview.html`;

test("calling occupies layout and survives switching chats; leaving releases devices", async ({
  page,
}) => {
  await page.goto(previewURL);
  await expect(page.locator(".conversation-row")).toHaveCount(5);
  await page.evaluate(async () => {
    const moduleURL =
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((name) => name.includes("/src/features/call/session.ts")) ??
      "/src/features/call/session.ts";
    const { CallSession } = await import(moduleURL);
    const original = CallSession.prototype.start;
    CallSession.prototype.start = function (target) {
      const call = {
        target,
        participantCount: 0,
      };
      this.dependencies.capture = async () => [
        {
          stop: () => {
            document.body.dataset.devicesReleased = "true";
          },
        },
      ];
      const room = this.dependencies.room();
      room.connect = async () => {};
      room.disconnect = async () => {};
      room.localParticipant.publishTrack = async () => {};
      Object.defineProperty(room.localParticipant, "isMicrophoneEnabled", {
        get: () => true,
      });
      this.dependencies.room = () => room;
      this.api.start = async () => ({ call });
      this.api.join = async () => ({
        auth: { serverUrl: "wss://media", token: "preview" },
      });
      this.api.status = async (targets) => ({
        items: targets.map((target) => ({
          target,
          call: target.id === call.target.id ? call : null,
        })),
      });
      this.api.leave = async () => {
        document.body.dataset.remoteLeft = "true";
        return {};
      };
      return original.call(this, target);
    };
  });
  await page.getByRole("button", { name: "通话", exact: true }).click();
  await page.locator(".ui-menu-item").getByText("通话", { exact: true }).click();
  await expect(page.locator(".call-dock")).toContainText("等待对方接听");
  await page.locator(".conversation-row").nth(1).click();
  await expect(page.locator(".call-dock")).toContainText("等待对方接听");
  const overlap = await page.evaluate(() => {
    const dock = document.querySelector(".call-dock")!.getBoundingClientRect();
    const chat = document.querySelector("#chat-container")!.getBoundingClientRect();
    return chat.bottom > dock.top + 1;
  });
  expect(overlap).toBe(false);
  await page
    .locator(".call-dock")
    .getByRole("button", { name: "离开", exact: true })
    .click();
  await expect(page.locator(".call-dock")).toHaveCount(0);
  await expect(page.locator("body")).toHaveAttribute("data-devices-released", "true");
  await expect(page.locator("body")).toHaveAttribute("data-remote-left", "true");
});

test("group discovery shows the count without devices or tokens until Join", async ({
  page,
}) => {
  await page.goto(previewURL);
  await expect(page.locator(".conversation-row")).toHaveCount(5);
  await page.evaluate(async () => {
    const callURL = "/src/features/call/CallProvider.tsx";
    const storeURL = "/src/store/index.ts";
    const reactURL = "/node_modules/.vite/deps/react.js";
    const domURL = "/node_modules/.vite/deps/react-dom_client.js";
    const [calls, stores, { default: React }, { default: ReactDOM }] =
      await Promise.all([
        import(callURL),
        import(storeURL),
        import(reactURL),
        import(domURL),
      ]);
    const group = {
      ...stores.useConversationStore.getState().currentConversation,
      groupID: "test-group",
      userID: "",
      showName: "测试群",
    };
    stores.useConversationStore.setState({ currentConversation: group });
    const container = document.createElement("div");
    container.id = "call-probe";
    container.style.cssText =
      "position:fixed;inset:100px 20px auto;z-index:9999;background:white";
    document.body.append(container);
    function Probe() {
      const { session } = calls.useCall();
      session.api.status = async (targets) => ({
        items: targets.map((target) => ({
          target,
          call: {
            target,
            participantCount: 2,
          },
        })),
      });
      session.dependencies.capture = async () => {
        container.dataset.devicesRequested = "true";
        throw new Error("denied");
      };
      session.api.join = async () => {
        container.dataset.tokenRequested = "true";
        throw new Error("unexpected token request");
      };
      session.api.leave = async () => ({});
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(calls.GroupCallBar),
        React.createElement(calls.CallHost),
      );
    }
    ReactDOM.createRoot(container).render(
      React.createElement(calls.CallProvider, null, React.createElement(Probe)),
    );
  });
  const probe = page.locator("#call-probe");
  await expect(probe).toContainText("2 人正在通话");
  await expect(probe).not.toHaveAttribute("data-devices-requested");
  await expect(probe).not.toHaveAttribute("data-token-requested");
  await probe.getByRole("button", { name: "加入", exact: true }).click();
  await expect(probe).toHaveAttribute("data-devices-requested", "true");
  await expect(probe).not.toHaveAttribute("data-token-requested");
  await expect(probe.locator(".call-dock")).toHaveCount(0);
});
