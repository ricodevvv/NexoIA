const EVENT = "nexo:conversations";

export function notifyConversationsChanged() {
  window.dispatchEvent(new Event(EVENT));
}

export function onConversationsChanged(fn: () => void) {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
