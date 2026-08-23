import { describe, expect, it } from "vitest";

import { reduceAgentRun } from "./agentRunReducer";

const metadata = JSON.stringify({
  schema: "abd.agent_run",
  schemaVersion: 2,
  runId: "run_123",
  triggerMessageId: "message_123",
});

const packet = (value: Record<string, unknown>) => JSON.stringify(value);

describe("reduceAgentRun", () => {
  it("replays message, reasoning, tool, artifact, and lifecycle events", () => {
    const result = reduceAgentRun(
      metadata,
      [
        packet({ event: "run.queued", at: 1 }),
        packet({ event: "run.started", at: 2 }),
        packet({
          event: "item.started",
          at: 3,
          item: { id: "reasoning_1", type: "reasoning", content: [] },
        }),
        packet({
          event: "item.delta",
          at: 4,
          itemId: "reasoning_1",
          content: { type: "text", text: "检查" },
        }),
        packet({
          event: "item.delta",
          at: 5,
          itemId: "reasoning_1",
          content: { type: "text", text: "代码" },
        }),
        packet({
          event: "item.started",
          at: 6,
          item: {
            id: "tool_1",
            type: "tool",
            name: "shell",
            title: "运行测试",
            category: "execute",
            status: "running",
            content: [],
            locations: [],
          },
        }),
        packet({
          event: "item.updated",
          at: 7,
          itemId: "tool_1",
          update: {
            type: "tool.state",
            title: "测试通过",
            status: "completed",
            locations: [],
            durationMs: 320,
          },
        }),
        packet({
          event: "item.completed",
          at: 8,
          itemId: "tool_1",
          outcome: "completed",
        }),
        packet({
          event: "item.started",
          at: 9,
          item: {
            id: "message_1",
            type: "message",
            role: "assistant",
            phase: "final",
            content: [],
          },
        }),
        packet({
          event: "item.delta",
          at: 10,
          itemId: "message_1",
          content: { type: "text", text: "已经" },
        }),
        packet({
          event: "item.delta",
          at: 11,
          itemId: "message_1",
          content: { type: "text", text: "完成。" },
        }),
        packet({
          event: "item.started",
          at: 12,
          item: {
            id: "artifact_1",
            type: "artifact",
            name: "result.txt",
            mediaType: "text/plain",
            attachmentId: "attachment_1",
            size: 42,
          },
        }),
        packet({
          event: "run.finished",
          at: 13,
          outcome: "completed",
          reason: "end_turn",
          durationMs: 58000,
        }),
      ],
      true,
    );

    expect(result.unsupported).toBe(false);
    expect(result.view).toMatchObject({
      runId: "run_123",
      status: "completed",
      activitySummaries: ["检查代码"],
      answer: "已经完成。",
      durationMs: 58000,
    });
    expect(result.view.tools.get("tool_1")).toEqual({
      callId: "tool_1",
      name: "shell",
      summary: "测试通过",
      status: "completed",
      durationMs: 320,
    });
    expect(result.view.activitySteps).toEqual([
      { kind: "summary", text: "检查代码" },
      { kind: "tool", callId: "tool_1" },
    ]);
    expect(result.view.artifacts).toEqual([
      {
        name: "result.txt",
        mediaType: "text/plain",
        size: 42,
        attachmentId: "attachment_1",
      },
    ]);
  });

  it("tracks canonical permission requests and resolutions", () => {
    const result = reduceAgentRun(metadata, [
      packet({
        event: "permission.requested",
        at: 1,
        request: {
          id: "permission_1",
          title: "Run command",
          description: "pnpm test",
          options: [
            { id: "allow", kind: "allow_once", label: "Allow" },
            { id: "deny", kind: "reject_once", label: "Deny" },
          ],
        },
      }),
      packet({
        event: "permission.resolved",
        at: 2,
        resolution: {
          requestId: "permission_1",
          outcome: "selected",
          optionId: "allow",
        },
      }),
    ]);

    expect(result.view.status).toBe("running");
    expect(result.view.approvals.get("permission_1")).toMatchObject({
      pending: false,
      choices: ["allow", "deny"],
      decision: "allow",
    });
  });

  it("shows commentary messages in the detailed process without mixing them into the answer", () => {
    const result = reduceAgentRun(metadata, [
      packet({
        event: "item.started",
        at: 1,
        item: {
          id: "commentary_1",
          type: "message",
          role: "assistant",
          phase: "commentary",
          content: [],
        },
      }),
      packet({
        event: "item.delta",
        at: 2,
        itemId: "commentary_1",
        content: { type: "text", text: "正在读取文件" },
      }),
    ]);

    expect(result.view.activitySummaries).toEqual(["正在读取文件"]);
    expect(result.view.answer).toBe("");
  });

  it("ignores unknown events while retaining supported content", () => {
    const result = reduceAgentRun(metadata, [
      packet({ event: "future.event", at: 1 }),
      packet({
        event: "item.started",
        at: 2,
        item: {
          id: "message_1",
          type: "message",
          role: "assistant",
          phase: "final",
          content: [{ type: "text", text: "可见" }],
        },
      }),
    ]);

    expect(result.unsupported).toBe(false);
    expect(result.view.answer).toBe("可见");
  });

  it("rejects malformed packets and non-v2 metadata", () => {
    expect(reduceAgentRun(metadata, ["not-json"]).unsupported).toBe(true);
    expect(reduceAgentRun(metadata, [packet({ at: 1 })]).unsupported).toBe(true);
    expect(
      reduceAgentRun(JSON.stringify({ schema: "abd.agent_run", schemaVersion: 1 }), [])
        .unsupported,
    ).toBe(true);
  });

  it("does not treat transport end as a successful run terminal", () => {
    const result = reduceAgentRun(
      metadata,
      [packet({ event: "run.started", at: 1 })],
      true,
    );

    expect(result.view).toMatchObject({
      status: "failed",
      statusSummary: "incomplete_stream",
    });
  });

  it("uses explicit failure and cancellation outcomes", () => {
    const failed = reduceAgentRun(metadata, [
      packet({
        event: "run.finished",
        at: 1,
        outcome: "failed",
        reason: "provider_error",
        errorCode: "provider_error",
      }),
    ]);
    const cancelled = reduceAgentRun(metadata, [
      packet({
        event: "run.finished",
        at: 1,
        outcome: "cancelled",
        reason: "cancelled",
      }),
    ]);

    expect(failed.view).toMatchObject({
      status: "failed",
      statusSummary: "provider_error",
    });
    expect(cancelled.view.status).toBe("cancelled");
  });
});
