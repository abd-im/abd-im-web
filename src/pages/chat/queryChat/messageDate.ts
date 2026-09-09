import dayjs from "dayjs";
import { t } from "i18next";

export const messageDate = (timestamp: number) =>
  dayjs(timestamp < 10000000000 ? timestamp * 1000 : timestamp);

export const startsMessageDay = (timestamp: number, previous?: number) =>
  Boolean(timestamp) &&
  (!previous || !messageDate(timestamp).isSame(messageDate(previous), "day"));

export const formatMessageDate = (timestamp: number, now = Date.now()) => {
  const date = messageDate(timestamp);
  const today = dayjs(now);
  if (date.isSame(today, "day")) return t("chatDate.today");
  if (date.isSame(today.subtract(1, "day"), "day")) return t("chatDate.yesterday");
  return date.format(
    t(date.isSame(today, "year") ? "chatDate.shortFormat" : "chatDate.fullFormat"),
  );
};
