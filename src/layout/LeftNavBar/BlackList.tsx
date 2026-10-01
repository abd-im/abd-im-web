import { BlackUserItem } from "@abd-im/wasm-client-sdk/lib/types/entity";
import { t } from "i18next";
import { X } from "lucide-react";
import { forwardRef, ForwardRefRenderFunction, memo, useState } from "react";

import OIMAvatar from "@/components/OIMAvatar";
import { Button, Dialog, DialogContent, DialogTitle, Spinner } from "@/components/ui";
import { useContactStore } from "@/store/contact";
import { feedbackToast } from "@/utils/common";

import { OverlayVisibleHandle, useOverlayVisible } from "../../hooks/useOverlayVisible";
import { IMSDK } from "../MainContentWrap";

const BlackList: ForwardRefRenderFunction<OverlayVisibleHandle, unknown> = (_, ref) => {
  const { isOverlayOpen, closeOverlay } = useOverlayVisible(ref);

  return (
    <Dialog open={isOverlayOpen} onOpenChange={(open) => !open && closeOverlay()}>
      <DialogContent className="gap-0 p-0" style={{ width: 420 }}>
        <DialogTitle className="sr-only">{t("placeholder.blackList")}</DialogTitle>
        <BlackListContent closeOverlay={closeOverlay} />
      </DialogContent>
    </Dialog>
  );
};

export default memo(forwardRef(BlackList));

const BlackItem = ({
  black,
  removeBlack,
}: {
  black: BlackUserItem;
  removeBlack: (userID: string) => Promise<void>;
}) => {
  const [loading, setLoading] = useState(false);

  const tryRemove = async () => {
    setLoading(true);
    await removeBlack(black.userID);
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      <div className="flex items-center">
        <OIMAvatar src={black.faceURL} text={black.nickname} />
        <div className="ml-3">{black.nickname}</div>
      </div>
      <Button variant="ghost" disabled={loading} onClick={() => void tryRemove()}>
        {loading && <Spinner />}
        {t("placeholder.remove")}
      </Button>
    </div>
  );
};

export const BlackListContent = ({ closeOverlay }: { closeOverlay?: () => void }) => {
  const blackList = useContactStore((state) => state.blackList);

  const removeBlack = async (userID: string) => {
    try {
      await IMSDK.removeBlack(userID);
    } catch (error) {
      feedbackToast({ error });
    }
  };

  return (
    <div className="flex h-[468px] flex-col bg-[var(--chat-bubble)]">
      <div className="flex items-center justify-between bg-[var(--gap-text)] p-5">
        <span className="text-base font-medium">{t("placeholder.blackList")}</span>
        <Button
          variant="ghost"
          size="icon"
          className="app-no-drag"
          aria-label={t("close")}
          onClick={closeOverlay}
        >
          <X />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {blackList.length > 0 ? (
          blackList.map((black) => (
            <BlackItem black={black} key={black.userID} removeBlack={removeBlack} />
          ))
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("placeholder.noData")}
          </p>
        )}
      </div>
    </div>
  );
};
