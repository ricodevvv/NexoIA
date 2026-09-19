"use client";

import { useMemo, useState } from "react";
import type { MessagePart } from "@/lib/ai/types";
import type { MessageContextValue } from "../chat/message";
import { ArtifactPanel } from "./artifact-panel";
import { collectArtifacts } from "./artifacts";

type OpenState = { identifier: string; callId: string | null } | null;

/**
 * Estado del panel de artifacts para una lista de mensajes: cuál está abierto,
 * qué versión, y el contexto que necesitan las tarjetas de los mensajes.
 */
export function useArtifactViewer(messages: { parts: MessagePart[] }[]) {
  const artifacts = useMemo(() => collectArtifacts(messages), [messages]);
  const [open, setOpen] = useState<OpenState>(null);

  const versions = open ? artifacts.get(open.identifier) : undefined;
  const index = versions && open ? (open.callId ? versions.findIndex((v) => v.callId === open.callId) : versions.length - 1) : -1;
  const active = versions && index >= 0 ? versions[index] : null;

  const context: Omit<MessageContextValue, "attachmentUrl"> = {
    openArtifact: (identifier, callId) => setOpen({ identifier, callId }),
    activeArtifactCall: active?.callId ?? null,
    artifactVersion: (identifier, callId) => {
      const list = artifacts.get(identifier) ?? [];
      return { index: list.findIndex((v) => v.callId === callId), total: list.length };
    },
  };

  const panel =
    versions && active && open ? (
      <ArtifactPanel
        key={open.identifier}
        versions={versions}
        selected={index}
        onSelect={(i) => setOpen({ identifier: open.identifier, callId: versions[i].callId })}
        onClose={() => setOpen(null)}
      />
    ) : null;

  return {
    context,
    panel,
    openLatest: (identifier: string) => setOpen({ identifier, callId: null }),
  };
}
