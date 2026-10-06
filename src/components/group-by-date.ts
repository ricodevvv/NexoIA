const DAY = 86_400_000;

/**
 * Agrupa los chats por fecha como en ChatGPT: hoy, ayer, esta semana, este mes
 * y lo anterior. Los grupos vacíos no aparecen.
 */
export function groupByDate<T extends { updatedAt: string }>(items: T[], now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = today.getTime();
  const groups: { title: string; items: T[] }[] = [
    { title: "Hoy", items: [] },
    { title: "Ayer", items: [] },
    { title: "Últimos 7 días", items: [] },
    { title: "Últimos 30 días", items: [] },
    { title: "Anteriores", items: [] },
  ];
  for (const item of items) {
    const t = new Date(item.updatedAt).getTime();
    const index = t >= start ? 0 : t >= start - DAY ? 1 : t >= start - 7 * DAY ? 2 : t >= start - 30 * DAY ? 3 : 4;
    groups[index].items.push(item);
  }
  return groups.filter((g) => g.items.length);
}
