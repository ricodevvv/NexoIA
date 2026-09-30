"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { ArrowUpCircle, Check, KeyRound, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useDragToClose } from "./use-drag-to-close";
import { useTheme } from "./use-theme";
import styles from "./user-menu.module.css";

export type MenuUser = { name: string; email: string; image: string | null };

const THEMES = [
  { value: "system", label: "Sistema", Icon: Monitor },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Oscuro", Icon: Moon },
] as const;

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function PlanTag({ plan }: { plan: "free" | "pro" }) {
  return <span className={`tag${plan === "pro" ? " tag-accent" : ""}`}>{plan === "pro" ? "Pro" : "Free"}</span>;
}

function useAccountActions(plan: "free" | "pro") {
  const router = useRouter();

  async function logout() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  const actions = [
    { label: "Configuración", Icon: Settings, run: () => router.push("/settings") },
    ...(plan === "pro" ? [] : [{ label: "Mejorar plan", Icon: ArrowUpCircle, run: () => router.push("/settings?tab=billing") }]),
    { label: "Claves de API", Icon: KeyRound, run: () => router.push("/settings?tab=keys") },
  ];

  return { actions, logout };
}

/**
 * Avatar del riel. Abre el menú de cuenta hacia la derecha, con el tema y la
 * salida.
 */
export function RailUserMenu({ user, plan }: { user: MenuUser; plan: "free" | "pro" }) {
  const [theme, setTheme] = useTheme();
  const { actions, logout } = useAccountActions(plan);

  return (
    <Menu.Root>
      <Menu.Trigger className={styles.avatarButton} aria-label={`Cuenta de ${user.name}`}>
        <span className={styles.avatar} aria-hidden="true">
          {initialsOf(user.name)}
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className={`menu ${styles.menu}`} side="right" align="end" sideOffset={10}>
          <div className={styles.identity}>
            <span className={styles.identityName}>
              {user.name} <PlanTag plan={plan} />
            </span>
            <span className={styles.identityMeta}>{user.email}</span>
          </div>
          <Menu.Separator className="menu-sep" />
          {actions.map(({ label, Icon, run }) => (
            <Menu.Item key={label} className="menu-item" onSelect={run}>
              <Icon /> {label}
            </Menu.Item>
          ))}
          <Menu.Separator className="menu-sep" />
          <p className="menu-label label">Tema</p>
          <Menu.RadioGroup value={theme} onValueChange={(v) => setTheme(v as typeof theme)}>
            {THEMES.map(({ value, label, Icon }) => (
              <Menu.RadioItem key={value} className="menu-item" value={value}>
                <Icon /> {label}
                <Menu.ItemIndicator className="menu-check">
                  <Check />
                </Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
          <Menu.Separator className="menu-sep" />
          <Menu.Item className="menu-item" onSelect={logout}>
            <LogOut /> Cerrar sesión
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * Pestaña "Cuenta" de la barra inferior en el celular. Abre una hoja que se
 * cierra arrastrándola hacia abajo.
 */
export function SheetUserMenu({ user, plan, className, current }: { user: MenuUser; plan: "free" | "pro"; className?: string; current?: boolean }) {
  const [theme, setTheme] = useTheme();
  const { actions, logout } = useAccountActions(plan);
  const [open, setOpen] = useState(false);
  const { sheetRef, handleProps } = useDragToClose<HTMLDivElement>(() => setOpen(false));

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={className} aria-current={current ? "page" : undefined}>
        <span className={styles.avatarSmall} aria-hidden="true">
          {initialsOf(user.name)}
        </span>
        <span>Cuenta</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.sheetOverlay} />
        <Dialog.Content ref={sheetRef} className={styles.sheet} aria-describedby={undefined} {...handleProps}>
          <span className={styles.grabber} aria-hidden="true" />
          <div className={styles.identity}>
            <Dialog.Title className={styles.identityName}>
              {user.name} <PlanTag plan={plan} />
            </Dialog.Title>
            <span className={styles.identityMeta}>{user.email}</span>
          </div>
          <hr className={styles.sheetSep} />
          {actions.map(({ label, Icon, run }) => (
            <button
              key={label}
              type="button"
              className={styles.sheetItem}
              onClick={() => {
                setOpen(false);
                run();
              }}
            >
              <Icon size={19} /> {label}
            </button>
          ))}
          <hr className={styles.sheetSep} />
          <div className={styles.themeRow}>
            <span>Tema</span>
            <div className={styles.segmented} role="radiogroup" aria-label="Tema">
              {THEMES.map(({ value, label, Icon }) => (
                <button key={value} type="button" role="radio" aria-checked={theme === value} aria-label={label} title={label} onClick={() => setTheme(value)}>
                  <Icon size={16} />
                </button>
              ))}
            </div>
          </div>
          <hr className={styles.sheetSep} />
          <button type="button" className={styles.sheetItem} onClick={logout}>
            <LogOut size={19} /> Cerrar sesión
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
