import type { StreamElem } from "@abd-im/wasm-client-sdk/lib/types/entity";
import clsx from "clsx";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CirclePause,
  CircleX,
  Clock3,
  FileText,
  LoaderCircle,
  Sparkles,
  Square,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";

import styles from "./agent-workspace.module.scss";
import { AgentRunStatus, reduceAgentRun } from "./agentRunReducer";

export interface AgentRunRendererProps {
  streamElem: StreamElem;
  isActive?: boolean;
  onCancel?: (runId: string) => void;
  onApprovalResponse?: (requestId: string, decision: string) => void;
}

export interface AgentRunActivityNavigatorProps {
  runs: AgentRunNavigationItem[];
  activeMessageID?: string;
  onSelect?: (messageID: string) => void;
}

export interface AgentRunNavigationItem {
  messageID: string;
  streamElem: StreamElem;
  title?: string;
}

const statusIcon: Record<AgentRunStatus, JSX.Element> = {
  queued: <Clock3 size={15} strokeWidth={1.8} />,
  running: <LoaderCircle className="animate-spin" size={15} strokeWidth={1.8} />,
  waiting_approval: <CirclePause size={15} strokeWidth={1.8} />,
  completed: <CheckCircle2 size={15} strokeWidth={1.8} />,
  failed: <CircleX size={15} strokeWidth={1.8} />,
  cancelled: <Square size={14} strokeWidth={1.8} />,
};

const formatFileSize = (size?: number) => {
  if (size === undefined || !Number.isFinite(size)) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

const statusLabel = (status: AgentRunStatus, t: (key: string) => string) =>
  t(`agentWorkspace.runStatus.${status}`);

const toolLabel = (name: string, t: (key: string) => string) => {
  const key = `agentWorkspace.tools.${name}`;
  const label = t(key);
  return label === key ? name : label;
};

const approvalLabel = (name: string, t: (key: string) => string) =>
  name === "permission" ? t("agentWorkspace.permissionRequest") : name;

const liveProgress = (
  view: ReturnType<typeof reduceAgentRun>["view"],
  t: (key: string, values?: object) => string,
) => {
  const activeTool = [...view.tools.values()]
    .reverse()
    .find((tool) => tool.status === "running");
  if (activeTool) {
    return {
      label: t("agentWorkspace.runStatus.running"),
      detail: activeTool.summary
        ? `${toolLabel(activeTool.name, t)} - ${activeTool.summary}`
        : toolLabel(activeTool.name, t),
    };
  }

  const latestSummary = view.activitySummaries.at(-1);
  if (latestSummary) {
    return {
      label: t("agentWorkspace.runStatus.running"),
      detail: latestSummary,
    };
  }

  return { label: statusLabel(view.status, t) };
};

const formatDuration = (
  durationMs: number,
  t: (key: string, values?: object) => string,
) => {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  if (seconds < 60) return t("agentWorkspace.seconds", { count: seconds });
  return t("agentWorkspace.minutesSeconds", {
    minutes: Math.floor(seconds / 60),
    seconds: seconds % 60,
  });
};

export default function AgentRunRenderer({
  streamElem,
  isActive = true,
  onCancel,
  onApprovalResponse,
}: AgentRunRendererProps) {
  const { t } = useTranslation();
  const { view, unsupported } = useMemo(
    () => reduceAgentRun(streamElem.content, streamElem.packets ?? [], streamElem.end),
    [streamElem.content, streamElem.end, streamElem.packets],
  );
  const hasProcess = view.activitySteps.length > 0;
  const isLive =
    isActive &&
    !streamElem.end &&
    (view.status === "queued" ||
      view.status === "running" ||
      view.status === "waiting_approval");
  const hasReceivedPacket = (streamElem.packets?.length ?? 0) > 0;
  const isProcessing = isLive && !view.answer;
  const [processOpen, setProcessOpen] = useState(false);

  if (unsupported) {
    return (
      <div className={styles.unsupported} role="status">
        {t("agentWorkspace.unsupportedRun")}
      </div>
    );
  }

  const approvals = [...view.approvals.values()];

  const canCancel = Boolean(
    onCancel &&
      view.runId &&
      (view.status === "queued" ||
        view.status === "running" ||
        view.status === "waiting_approval"),
  );
  const cancelRunId = canCancel ? view.runId : undefined;
  const progress = isLive ? liveProgress(view, t) : undefined;
  return (
    <div className={styles.run} data-run-id={view.runId} data-run-status={view.status}>
      {((isProcessing && hasReceivedPacket) ||
        view.status === "failed" ||
        view.status === "cancelled") && (
        <div className={styles.status} role="status">
          <span className={clsx(styles.statusIcon, styles[`status-${view.status}`])}>
            {statusIcon[view.status]}
          </span>
          <span>{progress?.label ?? statusLabel(view.status, t)}</span>
          {progress?.detail && (
            <span className={styles.statusDetail}>{progress.detail}</span>
          )}
          {canCancel && (
            <button
              className={styles.stopButton}
              type="button"
              title={t("agentWorkspace.cancelRun")}
              aria-label={t("agentWorkspace.cancelRun")}
              onClick={() => cancelRunId && onCancel?.(cancelRunId)}
            >
              <Square size={12} strokeWidth={1.8} />
            </button>
          )}
        </div>
      )}

      {view.statusSummary && (
        <p className={styles.statusSummary}>{view.statusSummary}</p>
      )}

      {hasProcess && (
        <section className={styles.runProcess}>
          <button
            className={styles.runProcessToggle}
            type="button"
            aria-expanded={processOpen}
            onClick={() => setProcessOpen((open) => !open)}
          >
            {processOpen ? (
              <ChevronDown size={14} strokeWidth={1.8} />
            ) : (
              <ChevronRight size={14} strokeWidth={1.8} />
            )}
            {isProcessing && (
              <span className={styles.runProcessPulse} aria-hidden="true" />
            )}
            <span>
              {view.durationMs !== undefined
                ? t("agentWorkspace.workedFor", {
                    duration: formatDuration(view.durationMs, t),
                  })
                : t("agentWorkspace.processSteps", {
                    count: view.activitySteps.length,
                  })}
            </span>
          </button>
          {processOpen && (
            <div className={styles.runProcessRows}>
              {view.activitySteps.map((step, index) => {
                if (step.kind === "summary") {
                  return (
                    <div
                      className={styles.runProcessSummary}
                      key={`summary-${index}-${step.text}`}
                    >
                      <Sparkles size={14} strokeWidth={1.7} />
                      <span>{step.text}</span>
                    </div>
                  );
                }
                const tool = view.tools.get(step.callId);
                if (!tool) return null;
                return (
                  <div className={styles.runProcessTool} key={tool.callId}>
                    <Wrench size={14} strokeWidth={1.7} />
                    <span className={styles.runProcessToolName}>
                      {toolLabel(tool.name, t)}
                    </span>
                    {tool.summary && (
                      <span className={styles.runProcessToolSummary}>
                        {tool.summary}
                      </span>
                    )}
                    <small
                      className={clsx(
                        styles.runProcessToolStatus,
                        styles[`tool-${tool.status}`],
                      )}
                    >
                      {tool.durationMs !== undefined
                        ? formatDuration(tool.durationMs, t)
                        : statusLabel(tool.status, t)}
                    </small>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {approvals.map((approval) => (
        <section className={styles.approval} key={approval.requestId}>
          <div className={styles.approvalHeader}>
            <CirclePause size={15} strokeWidth={1.8} />
            <strong>{approvalLabel(approval.name, t)}</strong>
          </div>
          {approval.summary && <p>{approval.summary}</p>}
          <div className={styles.approvalChoices}>
            {approval.choices.map((choice) => (
              <button
                key={choice}
                type="button"
                disabled={!approval.pending || !onApprovalResponse}
                onClick={() => onApprovalResponse?.(approval.requestId, choice)}
              >
                {choice}
              </button>
            ))}
          </div>
          {!approval.pending && approval.decision && (
            <span className={styles.approvalDecision}>
              <Check size={14} strokeWidth={1.8} />
              {approval.decision === "accepted"
                ? t("agentWorkspace.approvalAccepted")
                : approval.decision}
            </span>
          )}
        </section>
      ))}

      {view.answer && (
        <div className={styles.answer} data-quote-source>
          <ReactMarkdown skipHtml>{view.answer}</ReactMarkdown>
        </div>
      )}

      {view.artifacts.length > 0 && (
        <div className={styles.artifacts}>
          {view.artifacts.map((artifact) => (
            <div
              className={styles.artifact}
              key={artifact.attachmentId || artifact.name}
            >
              <FileText size={16} strokeWidth={1.8} />
              <span>
                <strong>{artifact.name}</strong>
                <small>{formatFileSize(artifact.size)}</small>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentRunActivityNavigator({
  runs,
  activeMessageID,
  onSelect,
}: AgentRunActivityNavigatorProps) {
  const { t } = useTranslation();
  const [hoveredMessageID, setHoveredMessageID] = useState<string>();
  const previewMessageID = hoveredMessageID ?? activeMessageID;
  const previewRun =
    runs.find((run) => run.messageID === previewMessageID) ?? runs.at(-1);
  const { view, unsupported } = useMemo(
    () =>
      previewRun
        ? reduceAgentRun(
            previewRun.streamElem.content,
            previewRun.streamElem.packets ?? [],
            previewRun.streamElem.end,
          )
        : { view: undefined, unsupported: true },
    [previewRun],
  );
  if (unsupported || !view || !previewRun) return null;

  const prompt = previewRun.title?.trim();

  return (
    <section
      className={styles.process}
      onMouseLeave={() => setHoveredMessageID(undefined)}
    >
      <div className={styles.processRail} aria-label={t("agentWorkspace.activity")}>
        {runs.map((run) => (
          <button
            className={clsx(
              styles.processStep,
              run.messageID === previewRun.messageID && styles.processStepActive,
            )}
            type="button"
            aria-label={run.title || t("agentWorkspace.activity")}
            key={run.messageID}
            onMouseEnter={() => setHoveredMessageID(run.messageID)}
            onFocus={() => setHoveredMessageID(run.messageID)}
            onClick={() => onSelect?.(run.messageID)}
          />
        ))}
      </div>
      <div className={styles.processPreview}>
        {prompt && <p className={styles.processPreviewUser}>{prompt}</p>}
        {view.answer && (
          <div className={styles.processPreviewAnswer}>
            <ReactMarkdown skipHtml>{view.answer}</ReactMarkdown>
          </div>
        )}
      </div>
    </section>
  );
}

export { formatFileSize };
