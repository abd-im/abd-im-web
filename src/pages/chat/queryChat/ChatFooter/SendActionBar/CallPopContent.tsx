import { t } from "i18next";
import { Phone } from "lucide-react";
import { memo } from "react";

import { conversationTarget, useCall } from "@/features/call/CallProvider";
import { useConversationStore } from "@/store";

const CallPopContent = ({ closeAllPop }: { closeAllPop?: () => void }) => {
  const current = useConversationStore((s) => s.currentConversation);
  const { start } = useCall();
  const target = current && conversationTarget(current);
  return (
    <div className="p-1">
      <button
        type="button"
        className="ui-menu-item"
        onClick={() => {
          closeAllPop?.();
          if (target) void start(target);
        }}
      >
        <Phone size={18} />
        {t("placeholder.call")}
      </button>
    </div>
  );
};
export default memo(CallPopContent);
