import { describe, expect, it } from "vitest";
import { initialState, type NcMessage, sessionSetup, toUIMessages } from "@/components/code/map";
import { cloneCommand, clonedRepo, cloneSucceeded, repoFolder } from "@/lib/code-setup";

function shellSession(output: string, status: "completed" | "running" = "completed"): NcMessage[] {
  const command = cloneCommand("ricodevvv/nexocode");
  return [
    { info: { id: "msg_1", role: "user", time: { created: 1 } }, parts: [{ id: "prt_1", messageID: "msg_1", type: "text", text: "The following tool was executed by the user", synthetic: true }] },
    {
      info: { id: "msg_2", role: "assistant", time: { created: 2 } },
      parts: [{ id: "prt_2", messageID: "msg_2", type: "tool", tool: "bash", callID: "c1", state: { status, input: { command }, output } }],
    },
    {
      info: { id: "msg_3", role: "user", time: { created: 3 } },
      parts: [
        { id: "prt_3", messageID: "msg_3", type: "text", text: "contexto", synthetic: true },
        { id: "prt_4", messageID: "msg_3", type: "text", text: "Holaa" },
      ],
    },
  ];
}

describe("clonado al arrancar una sesión", () => {
  it("arma el comando con la carpeta del repo y lo reconoce después", () => {
    const command = cloneCommand("ricodevvv/nexocode");
    expect(repoFolder("ricodevvv/nexocode")).toBe("nexocode");
    expect(command).toContain("git clone --quiet 'https://github.com/ricodevvv/nexocode.git' 'nexocode'");
    expect(clonedRepo(command)).toBe("ricodevvv/nexocode");
    expect(clonedRepo("ls -la")).toBeNull();
  });

  it("no deja pasar nombres que rompan el comando", () => {
    expect(() => cloneCommand("a/b'; rm -rf ~")).toThrow();
    expect(() => cloneCommand("a/..")).toThrow();
    expect(() => cloneCommand("solo-nombre")).toThrow();
  });

  it("solo da por bueno el clonado si sale la marca en la salida", () => {
    expect(cloneSucceeded("nexo:clonado ricodevvv/nexocode\n")).toBe(true);
    expect(cloneSucceeded("fatal: repository not found")).toBe(false);
  });

  it("esconde el clonado del chat y lo deja como fila de arranque", () => {
    const state = initialState(shellSession("nexo:clonado ricodevvv/nexocode\n"));
    const ui = toUIMessages(state);
    expect(ui.map((m) => m.role)).toEqual(["user"]);
    expect(ui[0].parts).toEqual([{ type: "text", text: "Holaa" }]);
    expect(sessionSetup(state)).toEqual({ repo: "ricodevvv/nexocode", status: "done" });
  });

  it("marca el arranque como fallido o en curso según el comando", () => {
    expect(sessionSetup(initialState(shellSession("fatal: nope")))?.status).toBe("error");
    expect(sessionSetup(initialState(shellSession("", "running")))?.status).toBe("running");
  });
});
