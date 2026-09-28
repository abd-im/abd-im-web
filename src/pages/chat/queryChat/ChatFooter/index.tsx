import {
  GroupMemberRole,
  MessageItem,
  MessageStatus,
  SessionType,
} from "@abd-im/wasm-client-sdk";
import type {
  AtUsersInfoItem,
  GroupMemberItem,
} from "@abd-im/wasm-client-sdk/lib/types/entity";
import { CloseOutlined, RollbackOutlined, UploadOutlined } from "@ant-design/icons";
import { useLatest } from "ahooks";
import { t } from "i18next";
import { ArrowUp } from "lucide-react";
import {
  ClipboardEvent,
  DragEvent,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { v4 as uuidV4 } from "uuid";

import CKEditor, { CKEditorRef, type MentionQuery } from "@/components/CKEditor";
import { getCleanText } from "@/components/CKEditor/utils";
import { Button } from "@/components/ui";
import { useDesktopDraft } from "@/hooks/useDesktopDraft";
import {
  useUserDisplayName,
  useUserDisplayNameResolver,
} from "@/hooks/useUserDisplayName";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore, useUserStore } from "@/store";
import { useComposerStore } from "@/store/composer";
import { useContactStore } from "@/store/contact";
import { feedbackToast } from "@/utils/common";
import { beginDesktopTask, canStartDesktopTask } from "@/utils/desktopTasks";

import { COMPOSITE_MESSAGE_EX } from "../compositeMessage";
import { AT_ALL_TAG } from "../mentions";
import { getMessagePreview } from "../messagePreview";
import { createQuoteSnapshot } from "../partialQuote";
import { AttachmentType, getAttachmentType } from "./attachmentType";
import ComposerAttachments from "./ComposerAttachments";
import MentionPicker, {
  getMentionWireName,
  type MentionCandidate,
} from "./MentionPicker";
import SendActionBar from "./SendActionBar";
import { useFileMessage } from "./SendActionBar/useFileMessage";
import { useSendMessage } from "./useSendMessage";

const ChatFooter = () => {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<MentionQuery>();
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [selectedMentions, setSelectedMentions] = useState<AtUsersInfoItem[]>([]);
  const ckEditorRef = useRef<CKEditorRef>(null);
  const fileDragDepth = useRef(0);
  const [sendMode, setSendMode] = useState<"combined" | "separate">("combined");
  const currentConversation = useConversationStore(
    (state) => state.currentConversation,
  );
  const selfID = useUserStore((state) => state.selfInfo.userID);
  const draftKey = `${selfID}:${currentConversation?.conversationID || ""}`;
  const pendingFiles = useComposerStore((state) => state.attachments[draftKey]) || [];
  const sending = useComposerStore((state) => state.sending.includes(draftKey));
  const friendList = useContactStore((state) => state.friendList);
  const currentMemberInGroup = useConversationStore(
    (state) => state.currentMemberInGroup,
  );
  const resolveUserDisplayName = useUserDisplayNameResolver();
  const [html, setHtml] = useDesktopDraft(
    `desktop-draft:${selfID}:chat:${currentConversation?.conversationID || ""}`,
  );
  const latestHtml = useLatest(html);
  const quoteMessage = useConversationStore((state) => state.quoteMessage);
  const updateQuoteMessage = useConversationStore((state) => state.updateQuoteMessage);

  const { getAttachmentMessage, getUploadedAttachmentMessage } = useFileMessage();
  const { sendMessage } = useSendMessage();
  const isGroup = currentConversation?.conversationType === SessionType.WorkingGroup;
  const mentionKeyword = mentionQuery?.query;
  const canMentionAll = (currentMemberInGroup?.roleLevel ?? 0) >= GroupMemberRole.Admin;
  const quoteAuthorSnapshot =
    quoteMessage?.message.senderNickname || quoteMessage?.message.sendID || "";
  const quoteAuthor = useUserDisplayName(
    {
      userID: quoteMessage?.message.sendID,
      nickname: quoteAuthorSnapshot,
    },
    quoteAuthorSnapshot,
  );

  useEffect(() => {
    if (!quoteMessage) return;

    if (
      currentConversation?.conversationType === SessionType.Group &&
      quoteAuthor &&
      !getCleanText(latestHtml.current ?? "")
    ) {
      const mention = `@${quoteAuthor}`;
      const escapedMention = mention.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      setHtml(`<p>${escapedMention}&nbsp;</p>`);
    }

    const focusTimer = window.setTimeout(() => ckEditorRef.current?.focus(true));
    return () => window.clearTimeout(focusTimer);
  }, [currentConversation?.conversationType, latestHtml, quoteAuthor, quoteMessage]);

  useEffect(() => {
    setMentionQuery(undefined);
    setMentionCandidates([]);
    setSelectedMentions([]);
    setActiveMentionIndex(0);
    fileDragDepth.current = 0;
    setIsDraggingFiles(false);
  }, [currentConversation?.conversationID]);

  useEffect(() => {
    if (mentionKeyword === undefined || !isGroup || !currentConversation?.groupID) {
      setMentionCandidates([]);
      setMentionLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setMentionLoading(true);
      const keyword = mentionKeyword.trim();
      const memberRequest = keyword
        ? IMSDK.searchGroupMembers({
            groupID: currentConversation.groupID,
            keywordList: [keyword],
            isSearchUserID: true,
            isSearchMemberNickname: true,
            offset: 0,
            count: 50,
          })
        : IMSDK.getGroupMemberList({
            groupID: currentConversation.groupID,
            filter: 0,
            offset: 0,
            count: 50,
          });
      const normalizedKeyword = keyword.toLocaleLowerCase();
      const remarkUserIDs = keyword
        ? friendList
            .filter((friend) =>
              friend.remark?.toLocaleLowerCase().includes(normalizedKeyword),
            )
            .map((friend) => friend.userID)
            .slice(0, 50)
        : [];
      const remarkMemberRequest = remarkUserIDs.length
        ? IMSDK.getSpecifiedGroupMembersInfo({
            groupID: currentConversation.groupID,
            userIDList: remarkUserIDs,
          })
        : Promise.resolve({ data: [] as GroupMemberItem[] });

      void Promise.all([memberRequest, remarkMemberRequest])
        .then(([{ data }, { data: remarkMembers }]) => {
          if (cancelled) return;
          const seen = new Set<string>();
          const members = [...data, ...remarkMembers].filter((member) => {
            if (member.userID === selfID || seen.has(member.userID)) return false;
            seen.add(member.userID);
            if (!normalizedKeyword) return true;
            const displayName = resolveUserDisplayName(member).toLocaleLowerCase();
            return (
              displayName.includes(normalizedKeyword) ||
              member.nickname.toLocaleLowerCase().includes(normalizedKeyword) ||
              member.userID.toLocaleLowerCase().includes(normalizedKeyword)
            );
          });
          const mentionAll = t("placeholder.mentionAll");
          const includeAll =
            canMentionAll && mentionAll.toLocaleLowerCase().includes(normalizedKeyword);
          setMentionCandidates([
            ...(includeAll ? [{ userID: AT_ALL_TAG } as const] : []),
            ...members,
          ]);
          setActiveMentionIndex(0);
        })
        .catch(() => {
          if (!cancelled) setMentionCandidates([]);
        })
        .finally(() => {
          if (!cancelled) setMentionLoading(false);
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    canMentionAll,
    currentConversation?.groupID,
    friendList,
    isGroup,
    mentionKeyword,
    resolveUserDisplayName,
    selfID,
  ]);

  const onChange = (value: string) => {
    setHtml(value);
    const cleanText = getCleanText(value);
    setSelectedMentions((current) =>
      current.filter(({ groupNickname }) => cleanText.includes(`@${groupNickname}`)),
    );
  };

  const selectMention = useCallback(
    (candidate: MentionCandidate) => {
      if (!mentionQuery) return;
      const wireName = getMentionWireName(candidate, t("placeholder.mentionAll"));
      ckEditorRef.current?.insertMention(`@${wireName} `, mentionQuery.replaceLength);
      setSelectedMentions((current) => {
        const next = current.filter((item) => item.atUserID !== candidate.userID);
        return [...next, { atUserID: candidate.userID, groupNickname: wireName }];
      });
      setMentionQuery(undefined);
      setMentionCandidates([]);
      setActiveMentionIndex(0);
    },
    [mentionQuery],
  );

  const onMentionKeyDown = useCallback(
    (key: string, isComposing: boolean) => {
      if (!mentionQuery || isComposing) return false;
      if (key === "Escape") {
        setMentionQuery(undefined);
        return true;
      }
      if (mentionCandidates.length === 0) return false;
      if (key === "ArrowDown" || key === "ArrowUp") {
        const direction = key === "ArrowDown" ? 1 : -1;
        setActiveMentionIndex(
          (current) =>
            (current + direction + mentionCandidates.length) % mentionCandidates.length,
        );
        return true;
      }
      if (key === "Enter" || key === "Tab") {
        const candidate = mentionCandidates[activeMentionIndex];
        if (candidate) selectMention(candidate);
        return true;
      }
      return false;
    },
    [activeMentionIndex, mentionCandidates, mentionQuery, selectMention],
  );

  const onSelectEmoji = (emoji: string) => {
    if (sending) return;
    ckEditorRef.current?.insertEmoji(emoji);
  };

  const removeAttachments = (ids: string[]) => {
    useComposerStore.getState().remove(draftKey, ids);
  };

  const addFiles = (files: readonly File[], requestedType?: AttachmentType) => {
    if (
      !files.length ||
      !currentConversation ||
      useComposerStore.getState().sending.includes(draftKey) ||
      !canStartDesktopTask()
    )
      return;
    const additions = files.map((file) => ({
      id: uuidV4(),
      file,
      type: requestedType ?? getAttachmentType(file),
    }));
    useComposerStore.getState().add(draftKey, additions);
    ckEditorRef.current?.focus(true);
  };

  const hasDraggedFiles = (event: DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (!files.length) return;

    event.preventDefault();
    event.stopPropagation();
    addFiles(files);
  };

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    fileDragDepth.current += 1;
    setIsDraggingFiles(true);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    fileDragDepth.current = Math.max(0, fileDragDepth.current - 1);
    if (!fileDragDepth.current) setIsDraggingFiles(false);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    fileDragDepth.current = 0;
    setIsDraggingFiles(false);

    const files = Array.from(event.dataTransfer.files);
    addFiles(files);
  };

  const hasMentions = selectedMentions.some(({ groupNickname }) =>
    getCleanText(html || "").includes(`@${groupNickname}`),
  );

  const enterToSend = async () => {
    const cleanText = getCleanText(latestHtml.current ?? "");
    const conversation = currentConversation;
    if (
      (!cleanText && !pendingFiles.length) ||
      !conversation ||
      useComposerStore.getState().sending.includes(draftKey) ||
      !canStartDesktopTask()
    )
      return;
    if (!useComposerStore.getState().startSending(draftKey)) return;
    const finishTask = beginDesktopTask();
    const clearText = () => {
      setHtml("");
      if (
        useConversationStore.getState().currentConversation?.conversationID ===
        conversation.conversationID
      ) {
        setSelectedMentions([]);
        setMentionQuery(undefined);
        if (useConversationStore.getState().quoteMessage === quoteMessage)
          updateQuoteMessage();
      }
    };
    try {
      const atUsersInfo = selectedMentions.filter(({ groupNickname }) =>
        cleanText.includes(`@${groupNickname}`),
      );
      const textMessage =
        !cleanText && !quoteMessage
          ? undefined
          : atUsersInfo.length
          ? (
              await IMSDK.createTextAtMessage({
                text: cleanText,
                atUserIDList: atUsersInfo.map((item) => item.atUserID),
                atUsersInfo,
                message: quoteMessage ? createQuoteSnapshot(quoteMessage) : undefined,
              })
            ).data
          : quoteMessage
          ? (
              await (
                IMSDK.createQuoteMessage as unknown as (params: {
                  text: string;
                  message: MessageItem;
                  quoteText?: string;
                  quoteOffset?: number;
                }) => ReturnType<typeof IMSDK.createQuoteMessage>
              )({
                text: cleanText,
                message: createQuoteSnapshot(quoteMessage),
                quoteText: quoteMessage.quoteText,
                quoteOffset: quoteMessage.quoteOffset,
              })
            ).data
          : (await IMSDK.createTextMessage(cleanText)).data;

      const combined =
        sendMode === "combined" &&
        !atUsersInfo.length &&
        pendingFiles.length + Number(Boolean(textMessage)) > 1;
      if (combined) {
        const parts: MessageItem[] = textMessage ? [textMessage] : [];
        for (const { file, type } of pendingFiles) {
          parts.push(await getUploadedAttachmentMessage(file, type));
        }
        const { data: message } = await IMSDK.createMergerMessage({
          messageList: parts.map((part) => ({
            ...part,
            status: MessageStatus.Succeed,
          })),
          title: t("attachments.combinedTitle"),
          summaryList: parts.map((part) => getMessagePreview(part)),
        });
        message.ex = COMPOSITE_MESSAGE_EX;
        removeAttachments(pendingFiles.map(({ id }) => id));
        clearText();
        await sendMessage({ message, conversation });
      } else {
        if (textMessage) {
          clearText();
          if (!(await sendMessage({ message: textMessage, conversation }))) return;
        }
        for (const { id, file, type } of pendingFiles) {
          const message = await getAttachmentMessage(file, type);
          removeAttachments([id]);
          // Failed transmissions have a retryable bubble; leave all unattempted
          // attachments in the draft so retrying cannot duplicate successful ones.
          if (!(await sendMessage({ message, conversation }))) break;
        }
      }
    } catch (error) {
      feedbackToast({ error });
    } finally {
      useComposerStore.getState().finishSending(draftKey);
      finishTask();
    }
  };

  return (
    <footer
      className="chat-composer"
      onPasteCapture={handlePaste}
      onDragEnterCapture={handleDragEnter}
      onDragOverCapture={handleDragOver}
      onDragLeaveCapture={handleDragLeave}
      onDropCapture={handleDrop}
    >
      {isDraggingFiles && (
        <div
          className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-brand bg-surface-raised"
          data-testid="file-drop-target"
          aria-hidden
        >
          <UploadOutlined className="text-3xl text-brand" />
        </div>
      )}
      <div className="chat-composer-box" aria-busy={sending}>
        {pendingFiles.length > 0 && (
          <ComposerAttachments
            attachments={pendingFiles}
            disabled={sending}
            onRemove={(id) => removeAttachments([id])}
          />
        )}
        {quoteMessage && (
          <div className="chat-composer-reply" data-testid="composer-reply">
            <RollbackOutlined className="shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-xs font-semibold text-foreground">
                {t("placeholder.reply")} {quoteAuthor}
              </strong>
              <span className="block truncate text-xs text-muted-foreground">
                {quoteMessage.quoteText || getMessagePreview(quoteMessage.message)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              title={`${t("cancel")} ${t("placeholder.reply")}`}
              aria-label={`${t("cancel")} ${t("placeholder.reply")}`}
              disabled={sending}
              onClick={() => updateQuoteMessage()}
            >
              <CloseOutlined />
            </Button>
          </div>
        )}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <CKEditor
            ref={ckEditorRef}
            value={html}
            disabled={sending}
            onEnter={() => void enterToSend()}
            onChange={onChange}
            onMentionQueryChange={(query) =>
              setMentionQuery(isGroup ? query : undefined)
            }
            onMentionKeyDown={onMentionKeyDown}
          />
          {mentionQuery && isGroup && !sending && (
            <MentionPicker
              query={mentionQuery}
              candidates={mentionCandidates}
              activeIndex={activeMentionIndex}
              loading={mentionLoading}
              onActiveIndexChange={setActiveMentionIndex}
              onSelect={selectMention}
            />
          )}
          <div className="chat-composer-bottom">
            <fieldset disabled={sending} className="min-w-0 border-0 p-0">
              <SendActionBar
                sendMessage={sendMessage}
                onAddFiles={addFiles}
                onSelectEmoji={onSelectEmoji}
              />
            </fieldset>
            <div className="flex shrink-0 items-center gap-2">
              {pendingFiles.length > 0 && (
                <select
                  className="composer-send-mode"
                  aria-label={t("attachments.sendMode")}
                  value={hasMentions ? "separate" : sendMode}
                  disabled={sending || hasMentions}
                  title={
                    hasMentions
                      ? t("attachments.mentionHint")
                      : t("attachments.modeHint")
                  }
                  onChange={(event) =>
                    setSendMode(event.target.value as "combined" | "separate")
                  }
                >
                  <option value="combined">{t("attachments.combined")}</option>
                  <option value="separate">{t("attachments.separate")}</option>
                </select>
              )}
              <Button
                variant="primary"
                size="small"
                disabled={
                  sending || (!getCleanText(html || "") && !pendingFiles.length)
                }
                onClick={() => void enterToSend()}
              >
                {sending ? t("attachments.sending") : t("placeholder.send")}
                <ArrowUp />
              </Button>
            </div>
          </div>
          {pendingFiles.length > 0 && hasMentions && (
            <p className="composer-mention-hint">{t("attachments.mentionHint")}</p>
          )}
        </div>
      </div>
    </footer>
  );
};

export default memo(ChatFooter);
