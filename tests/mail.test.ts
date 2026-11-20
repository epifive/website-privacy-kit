import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deliverMail, isSuppressed, MailSuppressedError, setMailTransport, smtpOptions, suppressAddress, type MailMessage } from "@/lib/mail";
import { listMailLog, sendLoggedMail } from "@/lib/privacy/mailer";
import { setMasterKeyForTests } from "@/lib/secrets";
import { SETTING_DEFAULTS } from "@/lib/settings";
import { createTestDb } from "./helpers/db";
import { createReadyOrg } from "./helpers/fixtures";

/** Email: SMTP transport (MAIL-01) and suppression list (MAIL-02). */

describe("MAIL email transport and suppression", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  const sent: MailMessage[] = [];

  beforeAll(async () => {
    setMasterKeyForTests(Buffer.alloc(32, 3));
    db = await createTestDb();
    setMailTransport(async (m) => {
      sent.push(m);
    });
  });
  afterAll(async () => {
    setMailTransport(null);
    setMasterKeyForTests(null);
    await db.destroy();
  });

  it("MAIL-01 SMTP: STARTTLS on 587, SSL on 465, short timeouts", () => {
    const starttls = smtpOptions({ ...SETTING_DEFAULTS, smtp_host: "email-smtp.ap-south-1.amazonaws.com", smtp_port: 587, smtp_user: "AKIA", smtp_pass: "pw" });
    expect(starttls).toMatchObject({ host: "email-smtp.ap-south-1.amazonaws.com", port: 587, secure: false, requireTLS: true, auth: { user: "AKIA", pass: "pw" } });
    expect(starttls.connectionTimeout).toBeLessThanOrEqual(10_000);
    const smtp = smtpOptions({ ...SETTING_DEFAULTS, smtp_host: "smtp.example.com", smtp_port: 465, smtp_secure: true });
    expect(smtp).toMatchObject({ host: "smtp.example.com", port: 465, secure: true, requireTLS: false });
  });

  it("MAIL-02 suppressed addresses are never sent to and are logged as skipped", async () => {
    await suppressAddress(db, "Bounced@Example.com", "manual");
    expect(await isSuppressed(db, "bounced@example.com")).toBe(true);
    await expect(deliverMail({ to: "bounced@example.com", subject: "x", text: "y" }, { db })).rejects.toBeInstanceOf(MailSuppressedError);
    expect(await deliverMail({ to: "fine@example.com", subject: "x", text: "y" }, { db })).toBe("test");
    expect(sent.map((m) => m.to)).toEqual(["fine@example.com"]);
    // The logged mailer turns a suppressed recipient into a "skipped" row (the transport checks via the platform DB in production).
    const org = await createReadyOrg(db, "owner-mail@test.in", "Mail Org");
    setMailTransport(async () => {
      throw new MailSuppressedError();
    });
    const r = await sendLoggedMail(org.t, { kind: "test", to: "bounced@example.com", subject: "s", text: "t" });
    expect(r).toMatchObject({ ok: false, error: "suppressed" });
    expect((await listMailLog(org.t))[0]).toMatchObject({ status: "skipped", error: "suppressed" });
    setMailTransport(async (m) => {
      sent.push(m);
    });
  });
});
