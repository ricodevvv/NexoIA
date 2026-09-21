import { describe, expect, it } from "vitest";
import { defaultLeaf, latestLeaf, pathTo, siblingsOf } from "@/lib/branches";

const at = (n: number) => new Date(2026, 0, 1, 0, 0, n);

const tree = [
  { id: "u1", parentId: null, createdAt: at(1) },
  { id: "a1", parentId: "u1", createdAt: at(2) },
  { id: "u2", parentId: "a1", createdAt: at(3) },
  { id: "a2", parentId: "u2", createdAt: at(4) },
  { id: "u2b", parentId: "a1", createdAt: at(5) },
  { id: "a2b", parentId: "u2b", createdAt: at(6) },
  { id: "a2c", parentId: "u2b", createdAt: at(7) },
];

describe("ramas", () => {
  it("arma el camino desde la raíz hasta la hoja", () => {
    expect(pathTo(tree, "a2").map((n) => n.id)).toEqual(["u1", "a1", "u2", "a2"]);
  });

  it("al cambiar de versión baja por la rama más reciente", () => {
    expect(latestLeaf(tree, "u2b")).toBe("a2c");
    expect(latestLeaf(tree, "u2")).toBe("a2");
    expect(defaultLeaf(tree)).toBe("a2c");
  });

  it("cuenta las versiones de cada mensaje en el camino", () => {
    const path = pathTo(tree, "a2b");
    const siblings = siblingsOf(tree, path);
    expect(siblings.get("u2b")).toEqual({ index: 1, total: 2, ids: ["u2", "u2b"] });
    expect(siblings.get("a2b")).toEqual({ index: 0, total: 2, ids: ["a2b", "a2c"] });
    expect(siblings.has("u1")).toBe(false);
  });

  it("no se cuelga si hay un ciclo por datos corruptos", () => {
    const cyclic = [
      { id: "x", parentId: "y", createdAt: at(1) },
      { id: "y", parentId: "x", createdAt: at(2) },
    ];
    expect(pathTo(cyclic, "x")).toHaveLength(2);
  });
});
