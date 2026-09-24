import { describe, expect, it } from "vitest";
import { attachmentNote } from "@/lib/ai/history";
import type { AttachmentData } from "@/lib/ai/types";
import { listZip } from "@/lib/zip";

const ZIP = Buffer.from("UEsDBBQAAAAIAIgqOV0AAAAAAgAAAAAAAAAJAAAAcHJveWVjdG8vAwBQSwMEFAAAAAgAiCo5XeR4pL8PAAAAyAAAABAAAABwcm95ZWN0by9wb20ueG1ssykoys9KTS7Rt7MZ0iwAUEsDBBQAAAAIAIgqOV2ojfReDwAAAA0AAAAWAAAAcHJveWVjdG8vc3JjL01haW4uamF2YUvOSSwuVvBNzMxTqK4FAFBLAQIUAxQAAAAIAIgqOV0AAAAAAgAAAAAAAAAJAAAAAAAAAAAAEAD9QQAAAABwcm95ZWN0by9QSwECFAMUAAAACACIKjld5Hikvw8AAADIAAAAEAAAAAAAAAAAAAAAgAEpAAAAcHJveWVjdG8vcG9tLnhtbFBLAQIUAxQAAAAIAIgqOV2ojfReDwAAAA0AAAAWAAAAAAAAAAAAAACAAWYAAABwcm95ZWN0by9zcmMvTWFpbi5qYXZhUEsFBgAAAAADAAMAuQAAAKkAAAAAAA==", "base64");

describe("listZip", () => {
  it("lee los nombres y tamaños del índice sin descomprimir", () => {
    const out = listZip(ZIP);
    expect(out?.total).toBe(3);
    expect(out?.entries).toEqual([
      { name: "proyecto/", size: 0, dir: true },
      { name: "proyecto/pom.xml", size: 200, dir: false },
      { name: "proyecto/src/Main.java", size: 13, dir: false },
    ]);
  });

  it("devuelve null si no es un zip", () => {
    expect(listZip(Buffer.from("esto no es un zip"))).toBeNull();
  });

  it("respeta el máximo de entradas", () => {
    expect(listZip(ZIP, 1)?.entries).toHaveLength(1);
  });
});

describe("attachmentNote", () => {
  const file: AttachmentData = { id: "a", name: "plugin.zip", mediaType: "application/zip", data: ZIP };

  it("le dice al modelo dónde está el zip y qué trae", () => {
    const note = attachmentNote(file, true);
    expect(note).toContain("/mnt/data/plugin.zip");
    expect(note).toContain("proyecto/src/Main.java (13 B)");
  });

  it("avisa cuando no hay ejecución de código", () => {
    expect(attachmentNote(file, false)).toContain("no está disponible");
  });
});
