import { RUNTIME_CHAT_URL } from "@/config";
import createAxiosInstance from "@/utils/request";
import { getChatToken } from "@/utils/storage";

const request = createAxiosInstance(RUNTIME_CHAT_URL);

export interface ChatManagement {
  conversationID: string;
  instruction: string;
  historyAccessEnabled: boolean;
  hostingEnabled: boolean;
}

export interface BusinessConnection {
  id: string;
  ownerUserID: string;
  chatManagement: ChatManagement[];
  createdAt: number;
  updatedAt: number;
}

export type ChatManagementPatch = Pick<ChatManagement, "conversationID"> &
  Partial<Omit<ChatManagement, "conversationID">>;

const chatTokenHeaders = async () => ({ token: (await getChatToken()) as string });

export const getBusinessConnection = async () => {
  const { data } = await request.post<{ connection?: BusinessConnection }>(
    "/agent/business_connection/get",
    {},
    { headers: await chatTokenHeaders() },
  );
  return data.connection;
};

export const updateChatManagement = async (items: ChatManagementPatch[]) => {
  const { data } = await request.post<{ connection: BusinessConnection }>(
    "/agent/business_connection/update_chat_management",
    { items },
    { headers: await chatTokenHeaders() },
  );
  return data.connection;
};
