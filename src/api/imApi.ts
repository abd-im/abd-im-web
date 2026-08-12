import { v4 as uuidv4 } from "uuid";

import { RUNTIME_CHAT_URL } from "@/config";
import createAxiosInstance from "@/utils/request";
import { getChatToken } from "@/utils/storage";

const request = createAxiosInstance(RUNTIME_CHAT_URL);

export const getRtcConnectData = async (room: string) => {
  const token = (await getChatToken()) as string;
  return request.post<{ serverUrl: string; token: string }>(
    "/user/rtc/get_token",
    {
      room,
    },
    {
      headers: {
        token,
        operationID: uuidv4(),
      },
    },
  );
};
