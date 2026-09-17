import { GroupMemberRole, MessageItem, SessionType } from "@abd-im/wasm-client-sdk";
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
  forwardRef,
  ForwardRefRenderFunction,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

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
import { useContactStore } from "@/store/contact";
import { feedbackToast } from "@/utils/common";
import { beginDesktopTask, canStartDesktopTask } from "@/utils/desktopTasks";

import { AT_ALL_TAG } from "../mentions";
import { getMessagePreview } from "../messagePreview";
import { createQuoteSnapshot } from "../partialQuote";
import { AttachmentType } from "./attachmentType";
import MentionPicker, {
  getMentionWireName,
  type MentionCandidate,
} from "./MentionPicker";
import SendActionBar from "./SendActionBar";
import { useFileMessage } from "./SendActionBar/useFileMessage";
import { useSendMessage } from "./useSendMessage";

const ChatFooter: ForwardRefRenderFunction<unknown, unknown> = (_, ref) => {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<MentionQuery>();
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [selectedMentions, setSelectedMentions] = useState<AtUsersInfoItem[]>([]);
  const ckEditorRef = useRef<CKEditorRef>(null);
  const fileDragDepth = useRef(0);
  const currentConversation = useConversationStore(
    (state) => state.currentConversation,
  );
  const selfID = useUserStore((state) => state.selfInfo.userID);
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

  const { getAttachmentMessage } = useFileMessage();
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
    ckEditorRef.current?.insertEmoji(emoji);
  };

  const sendFiles = async (files: readonly File[], requestedType?: AttachmentType) => {
    if (!files.length || !canStartDesktopTask()) return;
    const finishTask = beginDesktopTask();
    try {
      for (const file of files) {
        try {
          const message = await getAttachmentMessage(file, requestedType);
          await sendMessage({ message });
        } catch (error) {
          feedbackToast({ error });
        }
      }
    } finally {
      finishTask();
    }
  };

  const hasDraggedFiles = (event: DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (!files.length) return;

    event.preventDefault();
    event.stopPropagation();
    void sendFiles(files);
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
    if (files.length) void sendFiles(files);
  };

  const enterToSend = async () => {
    const cleanText = getCleanText(latestHtml.current ?? "");
    if (!cleanText || !canStartDesktopTask()) return;
    const finishTask = beginDesktopTask();
    try {
      const atUsersInfo = selectedMentions.filter(({ groupNickname }) =>
        cleanText.includes(`@${groupNickname}`),
      );
      const message = atUsersInfo.length
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
      setHtml("");
      setSelectedMentions([]);
      setMentionQuery(undefined);
      updateQuoteMessage();
      await sendMessage({ message });
    } catch (e) {
      console.error(e);
    } finally {
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
      <div className="chat-composer-box">
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
            onEnter={() => void enterToSend()}
            onChange={onChange}
            onMentionQueryChange={(query) =>
              setMentionQuery(isGroup ? query : undefined)
            }
            onMentionKeyDown={onMentionKeyDown}
          />
          {mentionQuery && isGroup && (
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
            <SendActionBar
              sendMessage={sendMessage}
              sendFiles={sendFiles}
              onSelectEmoji={onSelectEmoji}
            />
            <Button
              variant="primary"
              size="small"
              disabled={!getCleanText(html || "")}
              onClick={() => void enterToSend()}
            >
              {t("placeholder.send")}
              <ArrowUp />
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default memo(forwardRef(ChatFooter));
