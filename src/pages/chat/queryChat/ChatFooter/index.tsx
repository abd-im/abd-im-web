import {
  ComponentMessageParams,
  GroupMemberRole,
  MessageItem,
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
import { beginDesktopTask } from "@/utils/desktopTasks";

import { AT_ALL_TAG } from "../mentions";
import { getMessagePreview } from "../messagePreview";
import { createQuoteSnapshot } from "../partialQuote";
import { AttachmentType, getAttachmentType } from "./attachmentType";
import ComposerAttachments from "./ComposerAttachments";
import MentionPicker, {
  getMentionWireName,
  type MentionCandidate,
} from "./MentionPicker";
import { registerMessageRetry } from "./messageRetry";
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

  const { getUploadedAttachmentBody } = useFileMessage();
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
    if (!currentConversation) return;
    const additions = files.map((file) => ({
      id: uuidV4(),
      file,
      type: requestedType ?? getAttachmentType(file),
    }));
    useComposerStore.getState().add(draftKey, additions);
    // Start uploading as soon as a file enters the composer. The same cached
    // promise is awaited again when the message is sent.
    additions.forEach(({ id, file, type }) => {
      void getUploadedAttachmentBody(file, type, id).catch(() => undefined);
    });
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

  const enterToSend = async () => {
    const cleanText = getCleanText(latestHtml.current ?? "");
    const conversation = currentConversation;
    if ((!cleanText && !pendingFiles.length) || !conversation) return;
    if (!useComposerStore.getState().startSending(draftKey)) return;
    const finishTask = beginDesktopTask();
    let composerReleased = false;
    const releaseComposer = () => {
      if (composerReleased) return;
      composerReleased = true;
      useComposerStore.getState().finishSending(draftKey);
    };
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
      // Partial quotes retain their existing protocol until their metadata is migrated.
      if (quoteMessage) {
        const { data: message } = atUsersInfo.length
          ? await IMSDK.createTextAtMessage({
              text: cleanText,
              atUserIDList: atUsersInfo.map((item) => item.atUserID),
              atUsersInfo,
              message: createQuoteSnapshot(quoteMessage),
            })
          : await IMSDK.createQuoteMessage({
              text: cleanText,
              message: createQuoteSnapshot(quoteMessage),
              quoteText: quoteMessage.quoteText,
              quoteOffset: quoteMessage.quoteOffset,
            } as Parameters<typeof IMSDK.createQuoteMessage>[0]);
        clearText();
        if (!(await sendMessage({ message, conversation }))) return;
      }
      let text = cleanText;
      for (const user of atUsersInfo) {
        if (user.atUserID === AT_ALL_TAG)
          text = text.replaceAll(`@${user.groupNickname}`, "@everyone");
      }
      const textBody: ComponentMessageParams = {
        components: !quoteMessage && text ? [{ type: 10, id: 1, content: text }] : [],
        mentions: atUsersInfo
          .filter((user) => user.atUserID !== AT_ALL_TAG)
          .map((user) => ({ id: user.atUserID, username: user.groupNickname })),
        mention_everyone: atUsersInfo.some((user) => user.atUserID === AT_ALL_TAG),
      };
      if (!quoteMessage) {
        const localURLs: string[] = [];
        const dispose = () => localURLs.forEach((url) => URL.revokeObjectURL(url));
        const prepareBody = async (upload: boolean) => {
          const body: ComponentMessageParams = {
            ...textBody,
            components: [...textBody.components],
            attachments: [],
          };
          for (const { id, file, type } of pendingFiles) {
            if (upload) {
              const part = await getUploadedAttachmentBody(file, type, id);
              body.components.push(...part.components);
              body.attachments!.push(...(part.attachments || []));
            } else {
              const url = URL.createObjectURL(file);
              localURLs.push(url);
              body.attachments!.push({
                id,
                filename: file.name,
                size: file.size,
                url,
                content_type: file.type || "application/octet-stream",
              });
              body.components.push(
                type === "image" || type === "video"
                  ? { type: 12, items: [{ media: { url, attachment_id: id } }] }
                  : {
                      type: 13,
                      file: { url, attachment_id: id },
                      name: file.name,
                      size: file.size,
                      spoiler: false,
                    },
              );
            }
          }
          body.components.forEach((component, index) => {
            component.id = index + 1;
          });
          return (await IMSDK.createComponentMessage(body)).data;
        };
        let message: MessageItem;
        try {
          message = await prepareBody(false);
        } catch (error) {
          dispose();
          throw error;
        }
        const prepare = pendingFiles.length ? () => prepareBody(true) : undefined;
        if (prepare) registerMessageRetry(message.clientMsgID, prepare, dispose);
        removeAttachments(pendingFiles.map(({ id }) => id));
        clearText();
        releaseComposer();
        await sendMessage({ message, conversation, prepare });
      } else {
        if (textBody.components.length) {
          const { data: message } = await IMSDK.createComponentMessage(textBody);
          clearText();
          if (!(await sendMessage({ message, conversation }))) return;
        }
        for (const { id, file, type } of pendingFiles) {
          const body = await getUploadedAttachmentBody(file, type, id);
          const { data: message } = await IMSDK.createComponentMessage(body);
          removeAttachments([id]);
          if (!(await sendMessage({ message, conversation }))) break;
        }
      }
    } catch (error) {
      feedbackToast({ error });
    } finally {
      releaseComposer();
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
        </div>
      </div>
    </footer>
  );
};

export default memo(ChatFooter);
