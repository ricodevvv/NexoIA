"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, X } from "lucide-react";
import chat from "../chat/chat.module.css";
import styles from "./new-session.module.css";

/**
 * Hoja que sale desde abajo en el celular (y ventana al centro en
 * escritorio), con cerrar o volver a la izquierda y el título al centro.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  onBack,
  action,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onBack?: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={chat.sheetOverlay} />
        <Dialog.Content className={`${chat.sheet} ${styles.codeSheet}`} aria-describedby={undefined}>
          <span className={chat.grabber} aria-hidden="true" />
          <header className={chat.sheetHead}>
            {onBack ? (
              <button type="button" className={chat.sheetBtn} onClick={onBack} aria-label="Volver">
                <ChevronLeft size={20} />
              </button>
            ) : (
              <Dialog.Close className={chat.sheetBtn} aria-label="Cerrar">
                <X size={18} />
              </Dialog.Close>
            )}
            <Dialog.Title className={chat.sheetTitle}>{title}</Dialog.Title>
            {action ?? <span className={chat.sheetSpacer} />}
          </header>
          <div className={`${chat.sheetBody} ${styles.codeSheetBody}`}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
