import { afterEach, describe, expect, it } from "vitest";
import { appManifest, GITHUB_STATE_COOKIE, isGithubAdmin, newState, stateMatches } from "@/lib/github";

const withCookie = (value: string) => new Request("https://nexo.test/api/github/callback", { headers: { cookie: `otra=1; ${GITHUB_STATE_COOKIE}=${encodeURIComponent(value)}` } });

afterEach(() => {
  delete process.env.NEXO_ADMIN_EMAILS;
});

describe("github", () => {
  it("acepta el state solo si coincide con la cookie y es del mismo usuario", () => {
    const { state, cookie } = newState("u1");
    expect(stateMatches(withCookie(cookie), state, "u1")).toBe(true);
    expect(stateMatches(withCookie(cookie), state, "u2")).toBe(false);
    expect(stateMatches(withCookie(cookie), `${state}x`, "u1")).toBe(false);
    expect(stateMatches(new Request("https://nexo.test/"), state, "u1")).toBe(false);
  });

  it("solo los emails de NEXO_ADMIN_EMAILS son administradores", () => {
    expect(isGithubAdmin("a@b.com")).toBe(false);
    process.env.NEXO_ADMIN_EMAILS = " A@b.com , otro@c.com";
    expect(isGithubAdmin("a@B.com")).toBe(true);
    expect(isGithubAdmin("x@b.com")).toBe(false);
  });

  it("el manifest apunta a las rutas de vuelta y no pide más permisos de los necesarios", () => {
    process.env.BETTER_AUTH_URL = "https://chat.example.com/";
    const m = appManifest();
    expect(m.redirect_url).toBe("https://chat.example.com/api/github/app/callback");
    expect(m.callback_urls).toEqual(["https://chat.example.com/api/github/callback"]);
    expect(m.hook_attributes.active).toBe(false);
    expect(m.default_permissions).toEqual({ contents: "write", pull_requests: "write", issues: "write", workflows: "write", metadata: "read" });
    expect(m.name.length).toBeLessThanOrEqual(34);
  });
});
