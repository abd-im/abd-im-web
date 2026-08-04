import { MessageItem } from "@abd-im/wasm-client-sdk";
import { FC, useEffect, useState } from "react";

import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore } from "@/store";

import { deleteMessage } from "../useHistoryMessageList";
import styles from "./message-item.module.scss";

interface IBurnCountdownProps {
  message: MessageItem;
  conversationID?: string;
}

const BurnCountdown: FC<IBurnCountdownProps> = ({ message, conversationID }) => {
  const [remain, setRemain] = useState(-1);
  const currentConversation = useConversationStore((state) => state.currentConversation);

  useEffect(() => {
    if (!message.attachedInfoElem) return;
    const { isPrivateChat, burnDuration, hasReadTime } = message.attachedInfoElem;
    if (!isPrivateChat || !message.isRead || !hasReadTime) return;

    // Priority: message burnDuration > conversation burnDuration > default 30
    const finalBurnDuration = burnDuration || currentConversation?.burnDuration || 30;

    const calculateRemain = () => {
      const now = Date.now();
      const diff = Math.floor((now - hasReadTime) / 1000);
      const left = finalBurnDuration - diff;
      return left > 0 ? left : 0;
    };

    const left = calculateRemain();
    if (left <= 0) {
      handleBurn();
      return;
    }

    setRemain(left);

    const timer = setInterval(() => {
      const left = calculateRemain();
      if (left <= 0) {
        clearInterval(timer);
        handleBurn();
      } else {
        setRemain(left);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [message.isRead, message.attachedInfoElem?.hasReadTime, currentConversation?.burnDuration]);

  const handleBurn = async () => {
    if (!conversationID) return;
    try {
      await IMSDK.deleteMessageFromLocalStorage({
        conversationID,
        clientMsgID: message.clientMsgID,
      });
      deleteMessage(message.clientMsgID);
    } catch (error) {
      console.error("Burn failed", error);
    }
  };

  if (remain <= 0) {
    return null;
  }

  return (
    <div className={styles["burn-countdown"]}>
      <span className="mr-1">🔥</span>
      <span>{remain}s</span>
    </div>
  );
};

export default BurnCountdown;
