import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { REQUEST_TYPES, OTP_MAX_ATTEMPTS, OTP_MAX_SENDS, DAY_MS, clampInternalTarget, computeDueAt, computeTargetAt, daysLeft, reminderDue, slaState, checkAttachments, sniffAttachment, canMove, outcomesFor } from "@/core/rights/model";
import { contactBlock, ensureContactBlock, REPLY_TEMPLATES } from "@/core/rights/emails";
import type { Site } from "@/lib/db/schema";
import { setMailTransport, type MailMessage } from "@/lib/mail";
import { attachmentPath, listAttachments, readAttachment } from "@/lib/privacy/attachments";
import { getConsentState, recordConsent } from "@/lib/privacy/consent";
import { listMailLog } from "@/lib/privacy/mailer";
import { publishNotice } from "@/lib/privacy/notices";
import { updateOrgProfile } from "@/lib/privacy/orgs";
import { createSite, getSite, listPurposes, listVendors } from "@/lib/privacy/registers";
import {
  accessSummary,
  addNote,
  assignRequest,
  buildReply,
  changeStatus,
  closeRequest,
  contactBlockFor,
  createRequestToken,
  getDecrypted,
  getRequest,
  listNominations,
  listRequestEvents,
  listRequests,
  readRequestToken,
  recordNomination,
  resendCode,
  rightsStats,
  sendDueReminders,
  sendReply,
  submitRequest,
  verifyRequest,
  type SubmitInput,
} from "@/lib/privacy/rights";
import { setMasterKeyForTests } from "@/lib/secrets";
import { hostedLinks, renderDone, renderHub, renderRightsForm, renderVerify } from "@/lib/privacy/hosted-pages";
import { turnstileConfig, verifyTurnstile } from "@/lib/turnstile";
import { createTestDb } from "./helpers/db";
import { BASE_URL, createReadyOrg, createUser } from "./helpers/fixtures";

const PDF = Buffer.from("%PDF-1.4\n% test attachment with a secret phrase: mango-umbrella\n%%EOF\n");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

describe("rights requests (R1–R5, OTP, limits)", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let org: Awaited<ReturnType<typeof createReadyOrg>>;
  let site: Site;
  let tmp: string;
  const outbox: MailMessage[] = [];
  let failMail = false;
  let n = 0;

  const lastCode = (to: string) => {
    const mail = [...outbox].reverse().find((m) => m.to === to && /verification code|सत्यापन कोड/.test(m.subject));
    return mail?.text.match(/(?:is|है): (\d{6})/)?.[1] ?? "";
  };

  /** Each call uses a fresh IP and email so the rate limits only bite where a test wants them to. */
  const submit = (overrides: Partial<SubmitInput> = {}, now?: Date) => {
    n++;
    return submitRequest(
      org.t,
      { type: "access", name: "Asha Verma", email: `asha${n}@example.in`, details: "Please send me a summary of my data.", identifiers: { mobile: "9876543210", customer_id: "P-1001" }, lang: "en", ip: `198.51.100.${n}`, ...overrides },
      { baseUrl: BASE_URL, now },
    );
  };

  const submitVerified = async (overrides: Partial<SubmitInput> = {}) => {
    const s = await submit(overrides);
    if (!s.ok) throw new Error(`submit failed: ${s.error}`);
    const v = await verifyRequest(org.t, s.requestId, lastCode(s.email), { baseUrl: BASE_URL });
    if (!v.ok) throw new Error(`verify failed: ${v.error}`);
    return { ...s, verify: v };
  };

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wpk-rights-"));
    process.env.STORAGE_DIR = tmp;
    setMasterKeyForTests(Buffer.alloc(32, 5));
    setMailTransport(async (m) => {
      if (failMail) throw new Error("SMTP down");
      outbox.push(m);
    });
    db = await createTestDb();
    org = await createReadyOrg(db, "owner@clinic.test", "Sharma Physio", "clinic");
    expect((await publishNotice(org.t, { baseUrl: BASE_URL, userId: org.userId })).ok).toBe(true);
    site = (await getSite(org.t, await createSite(org.t, { name: "Clinic", domain: "sharmaphysio.in", allowedOrigins: [], childrenMode: false })))!;
  });
  afterAll(async () => {
    setMailTransport(null);
    setMasterKeyForTests(null);
    delete process.env.STORAGE_DIR;
    await db.destroy();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  beforeEach(() => {
    failMail = false;
  });

  // ── R1 ──

  it("R1-01 every request type is accepted, verified by email code and acknowledged with reference and due date", async () => {
    for (const type of REQUEST_TYPES.filter((t) => t !== "withdraw")) {
      const s = await submitVerified({ type, details: `Details for ${type} request.`, nominee: type === "nomination" ? { name: "Ravi Verma", relation: "Brother", contact: "ravi@example.in" } : undefined });
      const row = (await getRequest(org.t, s.requestId))!;
      expect(row.type).toBe(type);
      expect(row.status).toBe("new");
      expect(row.verified_at).not.toBeNull();
      const ack = outbox.filter((m) => m.to === s.email).pop()!;
      expect(ack.subject).toContain(s.ref);
      expect(ack.text).toContain(s.ref);
      expect(ack.text).toContain(row.due_at.slice(0, 10).slice(0, 4)); // year of the due date
      expect(ack.text).toMatch(/We will respond by: \d{4}-\d{2}-\d{2} \(within 30 days\)/);
    }
    const open = await listRequests(org.t, { status: "open" });
    expect(new Set(open.rows.map((r) => r.type))).toEqual(new Set(["access", "correction", "erasure", "nomination", "grievance"]));
  });

  it("R1-01 rejects unknown types and incomplete forms", async () => {
    expect(await submit({ type: "delete_everything" })).toEqual({ ok: false, error: "type" });
    expect(await submit({ name: "" })).toEqual({ ok: false, error: "name" });
    expect(await submit({ email: "not-an-email" })).toEqual({ ok: false, error: "email" });
    expect(await submit({ type: "grievance", details: "" })).toEqual({ ok: false, error: "details" });
    expect(await submit({ type: "correction", details: "x" })).toEqual({ ok: false, error: "details" });
    expect((await submit({ type: "erasure", details: "" })).ok).toBe(true);
    expect(await submit({ type: "nomination", nominee: { name: "R", relation: "", contact: "x" } })).toEqual({ ok: false, error: "nominee" });
  });

  it("R1-02 the access answer lists data categories from the purposes register and every vendor from the vendor register", async () => {
    const s = await submitVerified({ type: "access" });
    const reply = (await buildReply(org.t, s.requestId, "access", BASE_URL))!;
    const vendors = await listVendors(org.t);
    expect(vendors.length).toBeGreaterThan(0);
    for (const v of vendors) expect(reply.text).toContain(v.name);
    const purposes = (await listPurposes(org.t)).filter((p) => p.active === 1);
    for (const p of purposes) expect(reply.text).toContain(p.name_en);
    expect(reply.text).toMatch(/A\. Personal data we hold/);
    expect(reply.text).toMatch(/B\. Who we have shared it with/);
    expect(reply.text).toContain("Data Processor");
    const hi = await accessSummary(org.t, "hi");
    expect(hi.purposes[0].items.join(" ")).toMatch(/[ऀ-ॿ]/);
  });

  // ── R3 ──

  it("R3-01 due date = received + the organisation's response period; internal target is shorter", async () => {
    await updateOrgProfile(org.t, { response_days: 45, internal_target_days: 10 });
    const received = new Date("2026-11-20T04:30:00.000Z");
    const s = await submit({}, received);
    expect(s.ok).toBe(true);
    const row = (await getRequest(org.t, (s as { requestId: number }).requestId))!;
    expect(row.received_at).toBe(received.toISOString());
    expect(Date.parse(row.due_at) - received.getTime()).toBe(45 * DAY_MS);
    expect(Date.parse(row.target_at!) - received.getTime()).toBe(10 * DAY_MS);
    expect(computeTargetAt(received.toISOString(), 0, 30)).toBeNull();
    expect(clampInternalTarget(100, 30)).toBe(29);
    expect(clampInternalTarget(-3, 30)).toBe(0);
    await updateOrgProfile(org.t, { response_days: 30, internal_target_days: 0 });
  });

  it("R3-02 the response period is capped at 90 days even if the stored setting is higher", async () => {
    expect(computeDueAt("2026-01-01T00:00:00.000Z", 365)).toBe(new Date(Date.parse("2026-01-01T00:00:00.000Z") + 90 * DAY_MS).toISOString());
    await org.t.updateOrg({ response_days: 120 });
    const s = await submit({}, new Date("2026-11-20T00:00:00.000Z"));
    const row = (await getRequest(org.t, (s as { requestId: number }).requestId))!;
    expect(Date.parse(row.due_at) - Date.parse(row.received_at)).toBe(90 * DAY_MS);
    await updateOrgProfile(org.t, { response_days: 30 });
    expect((await org.t.org())!.response_days).toBe(30);
  });

  it("R3-03 reminders go out once at T−7, once at T−1 and once when overdue", async () => {
    const owner = "owner@clinic.test";
    const s = await submitVerified({});
    const row = (await getRequest(org.t, s.requestId))!;
    const due = Date.parse(row.due_at);
    const recipients = async () => [owner];
    const run = (offsetMs: number) => sendDueReminders(org.t, { baseUrl: BASE_URL, now: new Date(due + offsetMs), recipients });
    const before = outbox.length;
    expect(await run(-10 * DAY_MS)).toBe(0);
    const t7 = await run(-6 * DAY_MS);
    expect(t7).toBeGreaterThanOrEqual(1);
    const mine = () => outbox.slice(before).filter((m) => m.text.includes(row.ref));
    expect(mine()).toHaveLength(1);
    expect(mine()[0].subject).toContain(`Request ${row.ref} is due on`);
    expect(mine()[0].to).toBe(owner);
    await run(-5 * DAY_MS);
    expect(mine()).toHaveLength(1);
    await run(-12 * 3600_000);
    expect(mine()).toHaveLength(2);
    await run(-6 * 3600_000);
    expect(mine()).toHaveLength(2);
    await run(3600_000);
    expect(mine()).toHaveLength(3);
    expect(mine()[2].subject).toMatch(/^Overdue/);
    await run(2 * DAY_MS);
    expect(mine()).toHaveLength(3);
    const log = (await listMailLog(org.t, { requestId: s.requestId })).map((l) => l.kind);
    expect(log).toEqual(expect.arrayContaining(["rights.reminder.t7", "rights.reminder.t1", "rights.reminder.overdue"]));
    // Pure rule: closed requests never remind.
    expect(reminderDue({ status: "closed", due_at: row.due_at, reminded_t7_at: null, reminded_t1_at: null, reminded_overdue_at: null }, new Date(due))).toBeNull();
  });

  it("SLA states and days left", () => {
    const now = new Date("2026-12-01T00:00:00.000Z");
    const at = (days: number) => new Date(now.getTime() + days * DAY_MS).toISOString();
    expect(slaState({ status: "new", due_at: at(-1) }, now)).toBe("overdue");
    expect(slaState({ status: "unverified", due_at: at(-1) }, now)).toBe("overdue");
    expect(slaState({ status: "in_progress", due_at: at(3) }, now)).toBe("due_soon");
    expect(slaState({ status: "new", due_at: at(20), target_at: at(-2) }, now)).toBe("target_missed");
    expect(slaState({ status: "new", due_at: at(20), target_at: at(5) }, now)).toBe("on_track");
    expect(slaState({ status: "closed", due_at: at(-5) }, now)).toBe("closed");
    expect(daysLeft(at(2.5), now)).toBe(3);
    expect(daysLeft(at(-1.5), now)).toBe(-2);
  });

  // ── R4 ──

  it("R4-02 every reply template and the acknowledgement carry the Rule 9 contact block", async () => {
    const s = await submitVerified({ type: "erasure", details: "Please erase my data." });
    const block = await contactBlockFor(org.t, "en");
    expect(block).toContain("privacy@clinic.example.in");
    expect(block).toContain("+91 98765 43210");
    const ack = outbox.filter((m) => m.to === s.email).pop()!;
    expect(ack.text).toContain(block);
    for (const tpl of REPLY_TEMPLATES) {
      const reply = (await buildReply(org.t, s.requestId, tpl, BASE_URL))!;
      expect(reply.text, tpl).toContain(block);
      expect(reply.text, tpl).toMatch(/draft — pending lawyer review/);
    }
  });

  it("R4-02 a reply edited to remove the contact block gets it back before sending", async () => {
    const s = await submitVerified({ type: "correction", details: "My mobile number is wrong." });
    const r = await sendReply(org.t, s.requestId, { subject: "Your data has been updated", text: "Dear Asha,\n\nDone." }, org.userId);
    expect(r).toEqual({ ok: true });
    const sent = outbox.filter((m) => m.to === s.email).pop()!;
    expect(sent.text).toContain(await contactBlockFor(org.t, "en"));
    expect((await getRequest(org.t, s.requestId))!.status).toBe("in_progress");
    const events = await listRequestEvents(org.t, s.requestId);
    expect(events.find((e) => e.kind === "reply")?.body).toContain("Done.");
    expect(ensureContactBlock("x", "---\nblock")).toBe("x\n\n---\nblock");
    expect(ensureContactBlock("x\n\n---\nblock", "---\nblock")).toBe("x\n\n---\nblock");
    // Hindi requests get the Hindi block.
    expect(contactBlock("hi", "Sharma Physio", { role: "grievance", name: "A", email: "a@b.in", phone: "", address: "" })).toMatch(/शिकायत अधिकारी/);
  });

  // ── R5 ──

  it("R5-01 a grievance closes with an outcome and a closure letter that points to the Board", async () => {
    const s = await submitVerified({ type: "grievance", details: "You sent me WhatsApp offers after I said no." });
    expect(await closeRequest(org.t, s.requestId, { outcome: "resolved", letter: null }, org.userId)).toEqual({ ok: false, error: "letter" });
    expect(await closeRequest(org.t, s.requestId, { outcome: "completed", letter: { subject: "x", text: "y" } }, org.userId)).toEqual({ ok: false, error: "outcome" });
    expect(outcomesFor("grievance")).toContain("not_upheld");
    const letter = (await buildReply(org.t, s.requestId, "grievance", BASE_URL, "partly_resolved"))!;
    expect(letter.text).toContain("You sent me WhatsApp offers");
    expect(letter.text).toMatch(/Outcome: partly resolved/);
    expect(letter.text).toMatch(/Data Protection Board of India/);
    // Staff remove the Board paragraph and the contact block: both come back.
    const edited = letter.text.split("If you are not satisfied")[0];
    expect(await closeRequest(org.t, s.requestId, { outcome: "partly_resolved", letter: { subject: letter.subject, text: edited } }, org.userId)).toEqual({ ok: true });
    const sent = outbox.filter((m) => m.to === s.email).pop()!;
    expect(sent.subject).toContain(s.ref);
    expect(sent.text).toMatch(/Data Protection Board of India/);
    expect(sent.text).toContain(await contactBlockFor(org.t, "en"));
    const row = (await getRequest(org.t, s.requestId))!;
    expect(row.status).toBe("closed");
    expect(row.outcome).toBe("partly_resolved");
    expect(row.closed_at).not.toBeNull();
    expect((await listMailLog(org.t, { requestId: s.requestId })).map((l) => l.kind)).toContain("rights.closure.grievance");
    // Reopen is allowed; closing twice is not.
    expect(await closeRequest(org.t, s.requestId, { outcome: "resolved", letter: letter }, org.userId)).toEqual({ ok: false, error: "status" });
    expect(await changeStatus(org.t, s.requestId, "in_progress", org.userId)).toEqual({ ok: true });
    expect((await getRequest(org.t, s.requestId))!.outcome).toBeNull();
  });

  // ── OTP ──

  it("OTP: the code is stored only as a keyed hash; wrong codes are counted and lock the request", async () => {
    const s = await submit({});
    if (!s.ok) throw new Error();
    const code = lastCode(s.email);
    expect(code).toMatch(/^\d{6}$/);
    const row = (await getRequest(org.t, s.requestId))!;
    expect(row.status).toBe("unverified");
    expect(JSON.stringify(row)).not.toContain(code);
    expect(JSON.stringify(row)).not.toContain(s.email);
    expect(JSON.stringify(row)).not.toContain("Asha");
    const wrong = code === "000000" ? "111111" : "000000";
    const first = await verifyRequest(org.t, s.requestId, wrong, { baseUrl: BASE_URL });
    expect(first).toEqual({ ok: false, error: "code", left: OTP_MAX_ATTEMPTS - 1 });
    for (let i = 2; i < OTP_MAX_ATTEMPTS; i++) await verifyRequest(org.t, s.requestId, wrong, { baseUrl: BASE_URL });
    expect(await verifyRequest(org.t, s.requestId, wrong, { baseUrl: BASE_URL })).toEqual({ ok: false, error: "locked" });
    expect(await verifyRequest(org.t, s.requestId, code, { baseUrl: BASE_URL })).toEqual({ ok: false, error: "locked" });
    expect((await getRequest(org.t, s.requestId))!.status).toBe("unverified");
  });

  it("OTP: codes expire after 15 minutes; resend has a cooldown and a maximum, and replaces the old code", async () => {
    const t0 = new Date("2026-11-21T10:00:00.000Z");
    const s = await submit({}, t0);
    if (!s.ok) throw new Error();
    const first = lastCode(s.email);
    expect(await verifyRequest(org.t, s.requestId, first, { baseUrl: BASE_URL, now: new Date(t0.getTime() + 16 * 60_000) })).toEqual({ ok: false, error: "expired" });
    expect(await resendCode(org.t, s.requestId, { baseUrl: BASE_URL, now: new Date(t0.getTime() + 30_000) })).toEqual({ ok: false, error: "wait" });
    let at = t0.getTime();
    for (let i = 2; i <= OTP_MAX_SENDS; i++) {
      at += 61_000;
      expect(await resendCode(org.t, s.requestId, { baseUrl: BASE_URL, now: new Date(at) })).toEqual({ ok: true, mailSent: true });
    }
    at += 61_000;
    expect(await resendCode(org.t, s.requestId, { baseUrl: BASE_URL, now: new Date(at) })).toEqual({ ok: false, error: "max" });
    const latest = lastCode(s.email);
    if (latest !== first) expect((await verifyRequest(org.t, s.requestId, first, { baseUrl: BASE_URL, now: new Date(at) })).ok).toBe(false);
    const ok = await verifyRequest(org.t, s.requestId, ` ${latest.slice(0, 3)} ${latest.slice(3)} `, { baseUrl: BASE_URL, now: new Date(at) });
    expect(ok.ok).toBe(true);
    // Verifying again is harmless.
    expect(await verifyRequest(org.t, s.requestId, latest, { baseUrl: BASE_URL })).toMatchObject({ ok: true, already: true });
    expect(await resendCode(org.t, s.requestId, { baseUrl: BASE_URL })).toEqual({ ok: false, error: "done" });
  });

  it("OTP: the verification token is signed and only resolves inside its own organisation", async () => {
    const token = createRequestToken(42);
    expect(readRequestToken(token)).toBe(42);
    expect(readRequestToken(token.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBeNull();
    expect(readRequestToken(`${Buffer.from("43").toString("base64url")}.${token.split(".")[1]}`)).toBeNull();
    expect(readRequestToken("")).toBeNull();
  });

  // ── Rate limits ──

  it("rate limits: at most 3 requests per email and 5 per IP address per hour", async () => {
    const email = "repeat@example.in";
    for (let i = 0; i < 3; i++) expect((await submit({ email })).ok).toBe(true);
    expect(await submit({ email })).toEqual({ ok: false, error: "rate" });
    const ip = "203.0.113.200";
    for (let i = 0; i < 5; i++) expect((await submit({ ip })).ok).toBe(true);
    expect(await submit({ ip })).toEqual({ ok: false, error: "rate" });
  });

  // ── Withdraw shortcut ──

  it("withdraw shortcut: a verified email withdraws the consents recorded with that email and closes itself", async () => {
    const email = "lead@example.in";
    const rec = await recordConsent(org.t, site, { subject: { kind: "email", value: email }, choices: { marketing_whatsapp: true, analytics: true }, lang: "en", channel: "form", noticeVersion: 1 });
    expect(rec.ok).toBe(true);
    const subjectRef = (rec as { subjectRef: string }).subjectRef;
    const s = await submitVerified({ type: "withdraw", email: email.toUpperCase(), details: "" });
    expect(s.verify.withdrawn?.length).toBe(2);
    expect((await getConsentState(org.t, site.id, subjectRef)).every((c) => c.status === "withdrawn")).toBe(true);
    const row = (await getRequest(org.t, s.requestId))!;
    expect(row.status).toBe("closed");
    expect(row.outcome).toBe("completed");
    const mail = outbox.filter((m) => m.to === email).pop()!;
    expect(mail.subject).toContain(row.ref);
    expect(mail.text).toMatch(/withdrawn your consent for/);
    // Nothing linked to this email: closed as nothing_found with guidance.
    const none = await submitVerified({ type: "withdraw", email: "nobody@example.in", details: "" });
    expect(none.verify.withdrawn).toEqual([]);
    expect((await getRequest(org.t, none.requestId))!.outcome).toBe("nothing_found");
  });

  // ── Attachments ──

  it("attachments: optional, PDF/JPG/PNG only, size-limited and encrypted at rest", async () => {
    expect(sniffAttachment(PDF)).toBe("application/pdf");
    expect(sniffAttachment(PNG)).toBe("image/png");
    expect(sniffAttachment(Buffer.from("MZ\x90\x00"))).toBeNull();
    const big = { name: "big.pdf", size: 2 * 1024 * 1024 + 1, bytes: PDF };
    expect(checkAttachments([big])).toBe("size");
    expect(checkAttachments([1, 2, 3, 4].map(() => ({ name: "a.pdf", size: PDF.length, bytes: PDF })))).toBe("count");
    expect(await submit({ files: [{ name: "virus.exe", size: 4, bytes: Buffer.from("MZ\x90\x00") }] })).toEqual({ ok: false, error: "type_file" });
    expect(await submit({ files: [big] })).toEqual({ ok: false, error: "size" });

    const s = await submit({ type: "correction", details: "My date of birth is wrong, see the attached certificate.", files: [{ name: "../../etc/birth certificate.pdf", size: PDF.length, bytes: PDF }, { name: "photo.png", size: PNG.length, bytes: PNG }] });
    if (!s.ok) throw new Error(s.error);
    const files = await listAttachments(org.t, s.requestId);
    expect(files.map((f) => f.filename)).toEqual(["birth certificate.pdf", "photo.png"]);
    const onDisk = fs.readFileSync(attachmentPath(org.orgId, files[0]));
    expect(onDisk.includes(Buffer.from("mango-umbrella"))).toBe(false);
    const back = await readAttachment(org.t, files[0].id);
    expect(back?.bytes.equals(PDF)).toBe(true);
  });

  // ── Mail log, audit, workflow, assignment, nomination ──

  it("every email send is logged, including failures (without the body)", async () => {
    failMail = true;
    const s = await submit({});
    expect(s).toMatchObject({ ok: true, mailSent: false });
    failMail = false;
    const log = await listMailLog(org.t, { requestId: (s as { requestId: number }).requestId });
    expect(log[0]).toMatchObject({ kind: "rights.otp", status: "failed", error: "SMTP down" });
    expect(log[0].to_masked).toMatch(/^a\*\*\*@example\.in$/);
    expect(log[0].subject).not.toMatch(/\d{6}/);
    expect(Object.keys(log[0])).not.toEqual(expect.arrayContaining(["text"]));
    const all = await listMailLog(org.t, { limit: 500 });
    expect(all.filter((l) => l.status === "sent").length).toBeGreaterThan(10);
  });

  it("status workflow, assignment, notes and nominations are recorded and audited", async () => {
    const s = await submitVerified({ type: "nomination", details: "", nominee: { name: "Ravi Verma", relation: "Brother", contact: "+91 99887 76655" } });
    expect(canMove("new", "closed")).toBe(true);
    expect(canMove("closed", "new")).toBe(false);
    expect(await changeStatus(org.t, s.requestId, "closed", org.userId)).toEqual({ ok: false, error: "status" });
    expect(await changeStatus(org.t, s.requestId, "waiting", org.userId)).toEqual({ ok: true });
    expect(await changeStatus(org.t, s.requestId, "unverified", org.userId)).toEqual({ ok: false, error: "status" });

    const stranger = await createUser(db, "stranger@else.test");
    expect(await assignRequest(org.t, s.requestId, stranger, org.userId)).toEqual({ ok: false, error: "assignee" });
    expect(await assignRequest(org.t, s.requestId, org.userId, org.userId)).toEqual({ ok: true });
    expect((await listRequests(org.t, { assignee: org.userId })).rows.map((r) => r.id)).toContain(s.requestId);
    expect(await addNote(org.t, s.requestId, "identity", "Matched mobile number and patient ID with our records.", org.userId)).toEqual({ ok: true });
    expect(await addNote(org.t, s.requestId, "note", "   ", org.userId)).toEqual({ ok: false, error: "empty" });

    expect(await recordNomination(org.t, s.requestId, org.userId)).toEqual({ ok: true });
    const first = await listNominations(org.t, { requestId: s.requestId });
    expect(first[0]).toMatchObject({ nomineeName: "Ravi Verma", relation: "Brother", status: "active", principalName: "Asha Verma" });
    const reply = (await buildReply(org.t, s.requestId, "nomination", BASE_URL))!;
    expect(reply.text).toContain("Ravi Verma (Brother)");
    // A new nomination by the same person replaces the old one.
    const again = await submitVerified({ type: "nomination", email: (await getDecrypted(org.t, s.requestId))!.email, details: "", nominee: { name: "Meena Verma", relation: "Mother", contact: "meena@example.in" } });
    expect(await recordNomination(org.t, again.requestId, org.userId)).toEqual({ ok: true });
    expect((await listNominations(org.t, { requestId: s.requestId }))[0].status).toBe("revoked");
    expect(await recordNomination(org.t, (await submitVerified({ type: "access" })).requestId, org.userId)).toEqual({ ok: false, error: "nominee" });

    const timeline = (await listRequestEvents(org.t, s.requestId)).map((e) => e.kind);
    expect(timeline).toEqual(expect.arrayContaining(["submitted", "otp_sent", "verified", "ack", "status", "assign", "identity", "nomination"]));
    const audit = (await org.t.selectFrom("audit_log").select("action").execute()).map((a) => a.action);
    for (const a of ["request.submit", "request.verify", "request.status", "request.assign", "request.identity", "nomination.record", "request.reply", "request.close"]) expect(audit).toContain(a);
  });

  it("inbox filters and counts", async () => {
    const stats = await rightsStats(org.t);
    expect(stats.open).toBeGreaterThan(0);
    expect(stats.unverified).toBeGreaterThan(0);
    const unverified = await listRequests(org.t, { status: "unverified" });
    expect(unverified.rows.every((r) => r.status === "unverified")).toBe(true);
    const grievances = await listRequests(org.t, { status: "all", type: "grievance" });
    expect(grievances.rows.every((r) => r.type === "grievance")).toBe(true);
    const later = new Date(Date.now() + 120 * DAY_MS);
    const overdue = await listRequests(org.t, { status: "all", overdue: true }, later);
    expect(overdue.rows.length).toBeGreaterThan(0);
    expect(overdue.rows.every((r) => r.status !== "closed")).toBe(true);
    const one = overdue.rows[0];
    expect((await listRequests(org.t, { status: "all", ref: one.ref.toLowerCase() })).rows.map((r) => r.id)).toEqual([one.id]);
    expect((await listRequests(org.t, { status: "all", ref: "DROP TABLE" })).total).toBe(0);
  });
});

describe("Turnstile (configurable; off in dev and tests)", () => {
  const keys = { turnstile_site_key: "0x4AAAA", turnstile_secret_key: "0x4AAAA-secret" };

  it("is off without keys or with WPK_TURNSTILE=off", () => {
    expect(turnstileConfig({ turnstile_site_key: "", turnstile_secret_key: "" }, {})).toBeNull();
    expect(turnstileConfig(keys, { WPK_TURNSTILE: "off" })).toBeNull();
    expect(turnstileConfig(keys, {})).toEqual({ siteKey: "0x4AAAA", secretKey: "0x4AAAA-secret" });
  });

  it("verifies tokens server-side and fails closed", async () => {
    const config = turnstileConfig(keys, {})!;
    const ok = (async () => Response.json({ success: true })) as unknown as typeof fetch;
    const no = (async () => Response.json({ success: false, "error-codes": ["invalid-input-response"] })) as unknown as typeof fetch;
    const boom = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile(config, "token", "203.0.113.1", ok)).toBe(true);
    expect(await verifyTurnstile(config, "token", undefined, no)).toBe(false);
    expect(await verifyTurnstile(config, "token", undefined, boom)).toBe(false);
    expect(await verifyTurnstile(config, "", undefined, ok)).toBe(false);
  });
});

describe("hosted privacy pages (M6; R2-01, R4-01)", () => {
  const contacts = {
    dpo: null,
    grievance: { role: "grievance" as const, name: "Grievance Officer", designation: "Manager", email: "privacy@clinic.example.in", phone: "+91 98765 43210", address: "12 MG Road, Pune" },
  };
  const links = hostedLinks(BASE_URL, "sharma-physio");

  it("R2-01 the request form lists the identifiers configured in the questionnaire, every request type and the withdraw shortcut", () => {
    const html = renderRightsForm({ lang: "en", orgName: "Sharma <Physio>", links, responseDays: 30, identifiers: ["mobile", "customer_id"], contacts, turnstileSiteKey: null });
    expect(html).toContain("the mobile number you used with us");
    expect(html).toContain("your customer or patient ID");
    expect(html).toContain('name="id_mobile"');
    expect(html).toContain('name="id_customer_id"');
    expect(html).not.toContain('name="id_order_id"');
    for (const type of REQUEST_TYPES) expect(html).toContain(`value="${type}"`);
    expect(html).toContain(`${links.withdraw}?lang=en`);
    expect(html).toContain("We respond within 30 days");
    expect(html).toContain("About identity checks");
    expect(html).toContain('type="file"');
    expect(html).toContain("Sharma &lt;Physio&gt;");
    expect(html).not.toMatch(/<script/);
    expect(html).toContain("privacy@clinic.example.in");
    const hi = renderRightsForm({ lang: "hi", orgName: "Sharma", links, responseDays: 30, identifiers: ["mobile"], contacts, turnstileSiteKey: "0x4AAA" });
    expect(hi).toContain("मोबाइल");
    expect(hi).toContain('lang="hi"');
    expect(hi).toContain('class="cf-turnstile" data-sitekey="0x4AAA"');
    expect(hi).toContain("challenges.cloudflare.com/turnstile");
  });

  it("the hub shows the notice, rights, withdraw link, Rule 9 contact and the Board link marked unverified", () => {
    const html = renderHub({ lang: "en", orgName: "Sharma Physio", links, notice: { version: 3, publishedAt: "2026-11-19T10:00:00.000Z" }, contacts, responseDays: 21, identifiers: ["mobile"] });
    expect(html).toContain(`${links.notice}?lang=en`);
    expect(html).toContain(`${links.notice}?lang=hi`);
    expect(html).toContain("Current version 3, published 2026-11-19");
    expect(html).toContain(`${links.rights}?lang=en`);
    expect(html).toContain(`${links.withdraw}?lang=en`);
    expect(html).toContain("Grievance contact");
    expect(html).toContain("+91 98765 43210");
    expect(html).toContain("We respond within 21 days");
    expect(html).toContain("Data Protection Board of India");
    expect(html).toContain('data-board-unverified="1"');
    expect(html).toMatch(/not legal advice/i);
    expect(html).not.toMatch(/<script/);
    expect(html).not.toMatch(/Consent Manager/);
    const hi = renderHub({ lang: "hi", orgName: "Sharma Physio", links, notice: null, contacts: { dpo: null, grievance: null }, responseDays: 30, identifiers: [] });
    expect(hi).toContain("प्राइवेसी नोटिस अभी प्रकाशित नहीं हुआ है");
    expect(hi).toContain("संपर्क की जानकारी अभी जोड़ी नहीं गई है");
    expect(hi).toContain("भारतीय डेटा संरक्षण बोर्ड");
  });

  it("verify and done pages", () => {
    const v = renderVerify({ lang: "en", orgName: "Sharma", links, token: "abc.def", maskedEmail: "a***@example.in", error: "That code is not correct." });
    expect(v).toContain('name="r" value="abc.def"');
    expect(v).toContain("a***@example.in");
    expect(v).toContain('value="resend"');
    expect(v).toContain('role="alert"');
    const d = renderDone({ lang: "en", orgName: "Sharma", links, ref: "R-ABCD-EFGH", dueDate: "2026-12-19", responseDays: 30, withdrawn: null, already: false, mailSent: true });
    expect(d).toContain("R-ABCD-EFGH");
    expect(d).toContain("2026-12-19");
  });
});

describe("R1-03 description required for access/erasure when the organisation asks (P4 follow-up)", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let org: Awaited<ReturnType<typeof createReadyOrg>>;

  beforeAll(async () => {
    setMasterKeyForTests(Buffer.alloc(32, 6));
    setMailTransport(async () => undefined);
    db = await createTestDb();
    org = await createReadyOrg(db, "owner@details.test", "Details Clinic", "clinic");
  });
  afterAll(async () => {
    setMailTransport(null);
    setMasterKeyForTests(null);
    await db.destroy();
  });

  const bare = (type: string, ip: string) => submitRequest(org.t, { type, name: "Asha Verma", email: `asha.${ip.replace(/\./g, "")}@example.in`, details: "", identifiers: {}, lang: "en", ip }, { baseUrl: BASE_URL });

  it("optional by default; mandatory for the ticked types only; corrections and grievances always", async () => {
    expect((await bare("access", "198.51.100.201")).ok).toBe(true);
    expect((await bare("erasure", "198.51.100.202")).ok).toBe(true);
    expect(await bare("correction", "198.51.100.203")).toEqual({ ok: false, error: "details" });
    await updateOrgProfile(org.t, { details_required: ["erasure", "bogus"] });
    expect((await org.t.org())?.details_required).toBe('["erasure"]');
    expect(await bare("erasure", "198.51.100.204")).toEqual({ ok: false, error: "details" });
    expect((await bare("access", "198.51.100.205")).ok).toBe(true);
    const html = renderRightsForm({ lang: "en", orgName: "X", links: hostedLinks(BASE_URL, "x"), responseDays: 30, identifiers: [], contacts: { dpo: null, grievance: null }, turnstileSiteKey: null, detailsRequired: '["erasure"]' });
    expect(html).toMatch(/A description is required for: [^<]*Correct[^<]*Erase|A description is required for: [^<]*erase/i);
    await updateOrgProfile(org.t, { details_required: [] });
    expect((await bare("erasure", "198.51.100.206")).ok).toBe(true);
  });
});
