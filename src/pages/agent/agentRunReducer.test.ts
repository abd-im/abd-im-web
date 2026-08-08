import { describe, expect, it } from "vitest";

import { reduceAgentRun } from "./agentRunReducer";

const metadata = JSON.stringify({
  schema: 1,
  runId: "run_123",
  status: "running",
});

const packet = (value: Record<string, unknown>) =>
  JSON.stringify({ version: 1, ...value });

describe("reduceAgentRun", () => {
  it("reduces an append-only run into the workspace view", () => {
    const result = reduceAgentRun(metadata, [
      packet({ kind: "run.queued", runId: "run_123" }),
      packet({ kind: "run.started", runId: "run_123" }),
      packet({ kind: "activity.summary", text: "已分析题图" }),
      packet({
        kind: "tool.started",
        callId: "tool_1",
        name: "read_image",
        summary: "读取题图",
      }),
      packet({
        kind: "tool.completed",
        callId: "tool_1",
        status: "completed",
        durationMs: 320,
        summary: "已识别受力关系",
      }),
      packet({ kind: "answer.delta", text: "支持力 " }),
      packet({ kind: "answer.delta", text: "大于重力。" }),
      packet({
        kind: "artifact",
        name: "result.txt",
        mediaType: "text/plain",
        size: 42,
        attachmentId: "attachment_1",
      }),
      packet({ kind: "run.completed", durationMs: 58000 }),
    ]);

    expect(result.unsupported).toBe(false);
    expect(result.view).toMatchObject({
      runId: "run_123",
      status: "completed",
      activitySummaries: ["已分析题图"],
      answer: "支持力 大于重力。",
    });
    expect(result.view.tools.get("tool_1")).toEqual({
      callId: "tool_1",
      name: "read_image",
      summary: "已识别受力关系",
      status: "completed",
      durationMs: 320,
    });
    expect(result.view.activitySteps).toEqual([
      { kind: "summary", text: "已分析题图" },
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
    expect(result.view.durationMs).toBe(58000);
  });

  it("keeps distinct reasoning summaries in chronological order", () => {
    const result = reduceAgentRun(metadata, [
      packet({ kind: "activity.summary", text: "确认请求范围" }),
      packet({ kind: "activity.summary", text: "查询最新数据" }),
      packet({ kind: "activity.summary", text: "查询最新数据" }),
    ]);

    expect(result.view.activitySummaries).toEqual(["确认请求范围", "查询最新数据"]);
  });

  it("keeps a tool step in its original position when completion arrives later", () => {
    const result = reduceAgentRun(metadata, [
      packet({ kind: "tool.started", callId: "tool_1", name: "shell" }),
      packet({ kind: "activity.summary", text: "等待命令完成" }),
      packet({
        kind: "tool.completed",
        callId: "tool_1",
        status: "completed",
        summary: "pnpm test",
      }),
    ]);

    expect(result.view.activitySteps).toEqual([
      { kind: "tool", callId: "tool_1" },
      { kind: "summary", text: "等待命令完成" },
    ]);
    expect(result.view.tools.get("tool_1")).toMatchObject({
      status: "completed",
      summary: "pnpm test",
    });
  });

  it("tracks pending approvals and resumes after they are resolved", () => {
    const waiting = reduceAgentRun(metadata, [
      packet({
        kind: "approval.requested",
        requestId: "approval_1",
        name: "run_command",
        summary: "运行测试",
        choices: ["approve", "deny"],
      }),
    ]);

    expect(waiting.view.status).toBe("waiting_approval");
    expect(waiting.view.approvals.get("approval_1")).toMatchObject({
      requestId: "approval_1",
      pending: true,
      choices: ["approve", "deny"],
    });

    const resolved = reduceAgentRun(metadata, [
      packet({
        kind: "approval.requested",
        requestId: "approval_1",
        name: "run_command",
        summary: "运行测试",
        choices: ["approve", "deny"],
      }),
      packet({
        kind: "approval.resolved",
        requestId: "approval_1",
        decision: "approve",
      }),
    ]);

    expect(resolved.view.status).toBe("running");
    expect(resolved.view.approvals.get("approval_1")).toMatchObject({
      pending: false,
      decision: "approve",
    });
  });

  it("ignores unknown packet kinds while retaining supported answer packets", () => {
    const result = reduceAgentRun(metadata, [
      packet({ kind: "future.event", payload: "ignored" }),
      packet({ kind: "answer.delta", text: "仍然可见" }),
    ]);

    expect(result.unsupported).toBe(false);
    expect(result.view.answer).toBe("仍然可见");
  });

  it("returns a finite unsupported state for malformed JSON", () => {
    const result = reduceAgentRun(metadata, ["not-json"]);

    expect(result.unsupported).toBe(true);
    expect(result.view.answer).toBe("");
    expect(result.view.tools.size).toBe(0);
    expect(result.view.approvals.size).toBe(0);
  });

  it("does not expose malformed run metadata", () => {
    const result = reduceAgentRun("not-json", [
      packet({ kind: "answer.delta", text: "raw content" }),
    ]);

    expect(result.unsupported).toBe(true);
    expect(result.view.runId).toBeUndefined();
    expect(result.view.answer).toBe("");
  });

  it("uses terminal failure and cancellation summaries", () => {
    const failed = reduceAgentRun(metadata, [
      packet({ kind: "run.failed", summary: "工具执行失败", durationMs: 2200 }),
    ]);
    const cancelled = reduceAgentRun(metadata, [
      packet({ kind: "run.cancelled", durationMs: 1300 }),
    ]);

    expect(failed.view).toMatchObject({
      status: "failed",
      statusSummary: "工具执行失败",
    });
    expect(cancelled.view.status).toBe("cancelled");
    expect(failed.view.durationMs).toBe(2200);
    expect(cancelled.view.durationMs).toBe(1300);
  });

  it("treats an ended stream without a terminal packet as completed", () => {
    const result = reduceAgentRun(
      metadata,
      [packet({ kind: "answer.delta", text: "回答完成" })],
      true,
    );

    expect(result.view).toMatchObject({
      status: "completed",
      answer: "回答完成",
    });
  });
});
