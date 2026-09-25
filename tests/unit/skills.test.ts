import { describe, expect, it } from "vitest";
import { availableSkills, chatSkills, skillSpec } from "@/lib/ai/skills";

describe("skills del chat", () => {
  it("lee todos los skills de prompts/chat/skills con su cuerpo", () => {
    const names = chatSkills().map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(["office-files", "python-analysis", "artifact-craft", "research"]));
    const office = chatSkills().find((s) => s.name === "office-files")!;
    expect(office.requires).toBe("code");
    expect(office.body).toContain("micropip");
    expect(office.body.startsWith("---")).toBe(false);
  });

  it("esconde los skills cuyas tools no están activas", () => {
    const none = availableSkills({ code: false, artifacts: false }).map((s) => s.name);
    expect(none).not.toContain("office-files");
    expect(none).not.toContain("artifact-craft");
    expect(none).toContain("research");
    const all = availableSkills({ code: true, artifacts: true }).map((s) => s.name);
    expect(all).toEqual(expect.arrayContaining(["office-files", "artifact-craft"]));
  });

  it("lista los skills en la descripción y limita el nombre a los que existen", () => {
    const skills = availableSkills({ code: true, artifacts: true });
    const spec = skillSpec(skills);
    expect(spec.description).toContain("office-files:");
    expect((spec.inputSchema.properties as { name: { enum: string[] } }).name.enum).toEqual(skills.map((s) => s.name));
  });
});
