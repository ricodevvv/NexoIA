const ICON = "/icons/icon-192.png";

function supported() {
  return typeof window !== "undefined" && "Notification" in window;
}

async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.getRegistration("/").then((r) => r ?? navigator.serviceWorker.register("/sw.js", { scope: "/" })).catch(() => null);
}

/**
 * Pide permiso para avisar cuando el agente termina. Solo pregunta la primera
 * vez y tiene que llamarse desde un clic o un envío, que es cuando los
 * navegadores dejan mostrar el diálogo.
 */
export function askNotifications() {
  if (!supported() || Notification.permission !== "default") return;
  void Notification.requestPermission().then((p) => (p === "granted" ? registration() : null));
}

/**
 * Avisa con una notificación del sistema si la pestaña no está a la vista.
 * En el móvil solo funcionan las que manda el service worker, así que usa esas
 * cuando puede.
 */
export async function notify(title: string, body: string, tag: string) {
  if (!supported() || Notification.permission !== "granted" || document.visibilityState === "visible") return;
  const options = { body, tag, icon: ICON, data: { url: window.location.pathname + window.location.search } };
  const reg = await registration();
  if (reg) {
    await reg.showNotification(title, options).catch(() => {});
    return;
  }
  const n = new Notification(title, options);
  n.onclick = () => {
    window.focus();
    n.close();
  };
}
