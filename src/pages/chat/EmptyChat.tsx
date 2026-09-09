import { t } from "i18next";

export const EmptyChat = () => {
  return (
    <div className="no-mobile chat-empty">
      <div className="chat-empty-content">
        <img src="./icons/icon.png" alt="" />
        <strong>ABD IM</strong>
        <span>{t("workspace.noConversationSelected")}</span>
      </div>
    </div>
  );
};
