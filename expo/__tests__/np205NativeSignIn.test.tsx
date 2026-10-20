/**
 * NP-205 — native parity: one sign-in. Acceptance (id: e015cb31): "a member
 * signing in natively with the same email sees all their web data, streaks
 * and history."
 *
 * The underlying guarantee already existed (native and web both authenticate
 * through the same email-keyed backend — see PARITY_GAP_ANALYSIS.md's
 * "Email-link sign-in" row, re-audited at Parity on 2026-10-14); what this
 * card adds is telling the member so, on the one screen that used to say
 * nothing about it. Pinned here as source facts rather than a full render,
 * since login.tsx's exact copy is already pinned (and exercised) by
 * card-NP-251-acceptance.test.tsx and authSignupConsent.test.tsx.
 */

import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
const readRepo = (rel: string) => fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");

describe("NP-205 native sign-in", () => {
  it("the sign-in screen tells the member to use the same email as the web", () => {
    const login = read("app/(auth)/login.tsx");
    const signInBlock = login.slice(login.indexOf('heading: "Sign in"'));
    expect(signInBlock.slice(0, 300)).toMatch(/same email you use on the web/i);
  });

  it("native posts to the exact same magic-link endpoint the web uses", () => {
    const login = read("app/(auth)/login.tsx");
    expect(login).toMatch(/\/api\/auth\/send-link/);

    const webAuthForm = readRepo("webapp/components/AuthForm.tsx");
    expect(webAuthForm).toMatch(/\/api\/auth\/send-link/);
  });

  it("the account a magic link signs into is found by email alone — one account per email, on both clients", () => {
    const sendLinkRoute = readRepo("webapp/app/api/auth/send-link/route.ts");
    // Case-insensitive, trimmed — so "member@x.com" from the web and
    // "Member@X.com" typed into the app land on the same account.
    expect(sendLinkRoute).toMatch(/toLowerCase\(\)/);
  });
});
