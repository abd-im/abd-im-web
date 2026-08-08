import { createHashRouter } from "react-router-dom";

import { MainContentLayout } from "@/layout/MainContentLayout";
import { MainContentWrap } from "@/layout/MainContentWrap";
import { Agent, EmptyAgent } from "@/pages/agent";
import AgentWorkspaceContent from "@/pages/agent/AgentWorkspaceContent";
import { EmptyChat } from "@/pages/chat/EmptyChat";
import { QueryChat } from "@/pages/chat/queryChat";

import contactRoutes from "./ContactRoutes";
import { ConversationKindRoute } from "./ConversationKindRoute";
import GlobalErrorElement from "./GlobalErrorElement";

const router = createHashRouter([
  {
    path: "/",
    element: <MainContentWrap />,
    errorElement: <GlobalErrorElement />,
    children: [
      {
        path: "/",
        element: <MainContentLayout />,
        children: [
          {
            path: "/chat",
            async lazy() {
              const { Chat } = await import("@/pages/chat");
              return { Component: Chat };
            },
            children: [
              {
                index: true,
                element: <EmptyChat />,
              },
              {
                path: ":conversationID",
                element: (
                  <ConversationKindRoute kind="chat">
                    <QueryChat />
                  </ConversationKindRoute>
                ),
              },
            ],
          },
          {
            path: "/agent",
            element: <Agent />,
            children: [
              { index: true, element: <EmptyAgent /> },
              {
                path: ":conversationID",
                element: (
                  <ConversationKindRoute kind="agent_workspace">
                    <AgentWorkspaceContent />
                  </ConversationKindRoute>
                ),
              },
            ],
          },
          {
            path: "contact",
            async lazy() {
              const { Contact } = await import("@/pages/contact");
              return { Component: Contact };
            },
            children: contactRoutes,
          },
        ],
      },
      {
        path: "login",
        async lazy() {
          const { Login } = await import("@/pages/login");
          return { Component: Login };
        },
      },
    ],
  },
]);

export default router;
