import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";
import { assertSafeUrl } from "@/lib/mcp";
import { safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  it("acepta rutas internas y rechaza redirecciones a otros sitios", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext(["/a", "/b"])).toBe("/");
    expect(safeNext(undefined)).toBe("/");
  });
});

describe("crypto", () => {
  it("cifra y descifra, y cada cifrado es distinto", () => {
    const a = encrypt("sk-ant-secreto");
    const b = encrypt("sk-ant-secreto");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("sk-ant-secreto");
  });

  it("detecta si alguien alteró el texto cifrado", () => {
    const [iv, tag, data] = encrypt("hola").split(".");
    const tampered = [iv, tag, data.slice(0, -2) + (data.endsWith("A") ? "BB" : "AA")].join(".");
    expect(() => decrypt(tampered)).toThrow();
  });
});

describe("assertSafeUrl", () => {
  it("bloquea redes privadas, loopback y metadata de la nube", async () => {
    process.env.ALLOW_PRIVATE_MCP = "0";
    for (const url of ["https://127.0.0.1/mcp", "https://10.0.0.1/x", "https://192.168.1.10/x", "https://169.254.169.254/latest", "https://172.20.0.5/x"]) {
      await expect(assertSafeUrl(url), url).rejects.toThrow(/red privada/);
    }
  });

  it("exige https y protocolos web", async () => {
    process.env.ALLOW_PRIVATE_MCP = "0";
    await expect(assertSafeUrl("http://example.com/mcp")).rejects.toThrow(/https/);
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow(/http o https/);
  });
});
