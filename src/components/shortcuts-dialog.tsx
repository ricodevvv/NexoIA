"use client";

import * as Dialog from "@radix-ui/react-dialog";

const SHORTCUTS = [
  { keys: ["Ctrl", "K"], label: "Buscar chats" },
  { keys: ["Ctrl", "⇧", "O"], label: "Nuevo chat" },
  { keys: ["Ctrl", "⇧", "S"], label: "Mostrar u ocultar el panel" },
  { keys: ["⇧", "Esc"], label: "Ir a la caja de texto" },
  { keys: ["Ctrl", "/"], label: "Ver estos atajos" },
  { keys: ["Enter"], label: "Enviar mensaje" },
  { keys: ["⇧", "Enter"], label: "Salto de línea" },
  { keys: ["/"], label: "Insertar un prompt de tu biblioteca" },
  { keys: ["Ctrl", "Enter"], label: "Correr en el playground" },
];

/**
 * Lista de atajos de teclado. Se abre con Ctrl + / desde cualquier pantalla.
 */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog" aria-describedby={undefined}>
          <Dialog.Title>Atajos de teclado</Dialog.Title>
          <ul className="shortcut-list">
            {SHORTCUTS.map((s) => (
              <li key={s.label}>
                <span>{s.label}</span>
                <span className="row">
                  {s.keys.map((k) => (
                    <kbd key={k} className="kbd">
                      {k}
                    </kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="hint">En Mac usa ⌘ en lugar de Ctrl.</p>
          <div className="dialog-actions">
            <Dialog.Close className="btn">Cerrar</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
