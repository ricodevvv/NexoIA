"use client";

import { createContext } from "react";

export type MessageContextValue = {
  attachmentUrl: (id: string) => string;
  openArtifact?: (identifier: string, callId: string) => void;
  activeArtifactCall?: string | null;
  artifactVersion?: (identifier: string, callId: string) => { index: number; total: number };
};

export const MessageContext = createContext<MessageContextValue>({
  attachmentUrl: (id) => `/api/attachments/${id}`,
});
