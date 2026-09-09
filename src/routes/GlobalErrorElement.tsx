import { t } from "i18next";
import { CircleAlert, RotateCw } from "lucide-react";
import { useRouteError } from "react-router-dom";

import { Button } from "@/components/ui";

export const ErrorState = ({ onRetry }: { onRetry: () => void }) => (
  <div
    className="flex h-full min-h-[240px] w-full items-center justify-center bg-surface p-6"
    role="alert"
  >
    <div className="flex max-w-sm flex-col items-center gap-3 text-center">
      <CircleAlert size={24} strokeWidth={1.5} className="text-muted-foreground" />
      <p className="m-0 text-sm text-foreground">{t("toast.somethingError")}</p>
      <Button size="small" onClick={onRetry}>
        <RotateCw size={14} />
        {t("placeholder.recover")}
      </Button>
    </div>
  </div>
);

const GlobalErrorElement = () => {
  const error = useRouteError();

  const reload = () => {
    window.location.reload();
  };

  console.error("GlobalErrorElement");
  console.error(error);

  return <ErrorState onRetry={reload} />;
};

export default GlobalErrorElement;
