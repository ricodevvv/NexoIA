export type TreeNode = { id: string; parentId: string | null; createdAt: Date };

export type Siblings = { index: number; total: number; ids: string[] };

function childrenIndex<T extends TreeNode>(nodes: T[]) {
  const children = new Map<string | null, T[]>();
  for (const node of [...nodes].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const list = children.get(node.parentId) ?? [];
    list.push(node);
    children.set(node.parentId, list);
  }
  return children;
}

/**
 * Camino desde la raíz hasta `leafId`, siguiendo los padres.
 */
export function pathTo<T extends TreeNode>(nodes: T[], leafId: string | null): T[] {
  if (!leafId) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: T[] = [];
  const seen = new Set<string>();
  let current = byId.get(leafId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path.reverse();
}

/**
 * Baja desde `id` eligiendo siempre el hijo más reciente, hasta llegar a una
 * hoja. Es la rama que se muestra al cambiar de versión.
 */
export function latestLeaf<T extends TreeNode>(nodes: T[], id: string): string {
  const children = childrenIndex(nodes);
  let current = id;
  for (;;) {
    const next = children.get(current)?.at(-1);
    if (!next) return current;
    current = next.id;
  }
}

/**
 * La hoja que se muestra si la conversación no tiene una guardada: la rama
 * más reciente desde la raíz.
 */
export function defaultLeaf<T extends TreeNode>(nodes: T[]): string | null {
  const roots = childrenIndex(nodes).get(null);
  const root = roots?.at(-1);
  return root ? latestLeaf(nodes, root.id) : null;
}

/**
 * Para cada mensaje del camino, sus hermanos (versiones alternativas) y en
 * qué posición está.
 */
export function siblingsOf<T extends TreeNode>(nodes: T[], path: T[]): Map<string, Siblings> {
  const children = childrenIndex(nodes);
  const result = new Map<string, Siblings>();
  for (const node of path) {
    const ids = (children.get(node.parentId) ?? []).map((n) => n.id);
    if (ids.length > 1) result.set(node.id, { index: ids.indexOf(node.id), total: ids.length, ids });
  }
  return result;
}
