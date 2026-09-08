import { RUNTIME_CHAT_URL } from "@/config";
import createAxiosInstance from "@/utils/request";

const request = createAxiosInstance(RUNTIME_CHAT_URL);

export interface ApplicationVersion {
  id: string;
  platform: string;
  version: string;
  url: string;
  text: string;
  force: boolean;
  latest: boolean;
  hot: boolean;
  createTime: number;
}

export const getLatestApplicationVersion = async (
  platform: string,
  version: string,
) => {
  const { data } = await request.post<{ version?: ApplicationVersion }>(
    "/application/latest_version",
    { platform, version },
  );
  return data.version;
};
