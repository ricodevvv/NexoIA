"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, X } from "lucide-react";
import { useState } from "react";
import chat from "../chat/chat.module.css";
import { useDragToClose } from "../use-drag-to-close";
import styles from "./new-session.module.css";

type View = {
  title: string;
  onBack?: () => void;
  action?: React.ReactNode;
  page?: string;
  dir?: "forward" | "back";
  children: React.ReactNode;
};

/**
 * Hoja que sale desde abajo en el celular (y ventana al centro en
 * escritorio), con cerrar o volver a la izquierda y el título al centro. Con
 * `page` funciona como navegación: al cambiar de página el contenido entra
 * deslizándose hacia `dir`. Se cierra arrastrándola hacia abajo, y mientras
 * se va conserva lo último que mostraba.
 */
export function Sheet({ open, onOpenChange, ...view }: View & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { sheetRef, handleProps } = useDragToClose<HTMLDivElement>(() => onOpenChange(false));
  const [kept, setKept] = useState(view);
  if (open && (kept.children !== view.children || kept.title !== view.title || kept.page !== view.page)) setKept(view);
  const shown = open ? view : kept;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={chat.sheetOverlay} />
        <Dialog.Content ref={sheetRef} className={`${chat.sheet} ${styles.codeSheet}`} aria-describedby={undefined}>
          <div className={chat.dragZone} {...handleProps}>
            <span className={chat.grabber} aria-hidden="true" />
            <header className={chat.sheetHead}>
              {shown.onBack ? (
                <button type="button" className={chat.sheetBtn} onClick={shown.onBack} aria-label="Volver">
                  <ChevronLeft size={20} />
                </button>
              ) : (
                <Dialog.Close className={chat.sheetBtn} aria-label="Cerrar">
                  <X size={18} />
                </Dialog.Close>
              )}
              <Dialog.Title className={chat.sheetTitle}>{shown.title}</Dialog.Title>
              {shown.action ?? <span className={chat.sheetSpacer} />}
            </header>
          </div>
          <div className={`${chat.sheetBody} ${styles.codeSheetBody}`}>
            {shown.page ? (
              <div key={shown.page} className={`${chat.sheetPage} ${styles.codeSheetPage}`} data-dir={shown.dir}>
                {shown.children}
              </div>
            ) : (
              shown.children
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
