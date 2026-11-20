import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boardDetailDueAt, breachRemindersDue, breachTimers, certinDueAt, istDateTime, istLocalToUtc, utcToIstLocal } from "@/core/breach/model";
import { boardDetailed, boardInitial, certinEmail, dpIntimation, EMPTY_DETAILS, type BreachTemplateContext } from "@/core/breach/templates";
import { setMailTransport, type MailMessage } from "@/lib/mail";
import { runBreachReminders } from "@/lib/breach-jobs";
import {
  addEvidenceNote,
  addRecipients,
  breachAlerts,
  breachRegisterCsv,
  breachTemplates,
  createBreach,
  emailIntimation,
  getBreach,
  listBreachEvents,
  listRecipients,
  markRecipientsManual,
  markStep,
  recipientsCsv,
  recordExtension,
  setBreachStatus,
  toggleChecklist,
} from "@/lib/privacy/breaches";
import { listMailLog } from "@/lib/privacy/mailer";
import { setMasterKeyForTests } from "@/lib/secrets";
import { createTestDb } from "./helpers/db";
import { BASE_URL, createReadyOrg } from "./helpers/fixtures";

const H = 3_600_000;

function ctx(overrides: Partial<BreachTemplateContext> = {}): BreachTemplateContext {
  return {
    lang: "en",
    business: "Sharma Physio Clinic LLP",
    address: "12 MG Road, Pune",
    contact: { nameOrTitle: "Grievance Officer", email: "privacy@clinic.example.in", phone: "+91 98765 43210" },
    ref: "B-TEST-0001",
    noticedAt: "2026-11-19T04:00:00.000Z",
    awareAt: "2026-11-19T06:30:00.000Z",
    affectedCount: 120,
    details: {
      ...EMPTY_DETAILS,
      nature: "A staff laptop with an appointment export was stolen",
      extent: "About 120 patients' appointment records",
      occurredWindow: "between 18 and 19 November 2026",
      location: "Pune branch office",
      categories: ["Name", "Mobile number", "Appointment date"],
      likelyImpact: "Risk of phishing calls",
      consequences: ["You may receive calls pretending to be us"],
      measuresTaken: ["Laptop remotely wiped"],
      measuresPlanned: ["Disk encryption on all laptops"],
      safetySteps: ["Do not share OTPs"],
      rootCause: "Unencrypted laptop",
      findingsPerson: "Unknown external actor; police complaint filed",
      remediation: ["Full-disk encryption policy"],
      certinIncidentType: "Data Breach",
    },
    boardInitialSentAt: "2026-11-19T08:00:00.000Z",
    certinSent: true,
    timeline: [{ at: "2026-11-19T04:00:00.000Z", event: "noticed" }],
    dp: { notified: 100, firstSentAt: "2026-11-19T10:00:00.000Z", lastSentAt: "2026-11-19T12:00:00.000Z" },
    requestedUntil: null,
    now: new Date("2026-11-20T06:30:00.000Z"),
    ...overrides,
  };
}

describe("breach timers (B2-01, B2-03, B4-01)", () => {
  const base = {
    noticed_at: "2026-11-19T04:00:00.000Z",
    aware_at: "2026-11-19T06:30:00.000Z",
    certin_applicable: 1,
    certin_sent_at: null,
    board_initial_sent_at: null,
    board_detail_sent_at: null,
    dp_notice_sent_at: null,
    extension_until: null,
  };

  it("B4-01 CERT-In due = noticed_at + 6 h; B2-01 Board report due = aware_at + 72 h, both in UTC", () => {
    expect(certinDueAt(base.noticed_at)).toBe("2026-11-19T10:00:00.000Z");
    expect(boardDetailDueAt(base.aware_at)).toBe("2026-11-22T06:30:00.000Z");
    // An extension the Board allowed moves the due time; an earlier date never shortens the 72 h.
    expect(boardDetailDueAt(base.aware_at, "2026-11-25T06:30:00.000Z")).toBe("2026-11-25T06:30:00.000Z");
    expect(boardDetailDueAt(base.aware_at, "2026-11-20T00:00:00.000Z")).toBe("2026-11-22T06:30:00.000Z");
  });

  it("B2-01 times entered in IST are stored as UTC and shown back in IST", () => {
    // 19 Nov 2026 12:00 IST = 06:30 UTC.
    expect(istLocalToUtc("2026-11-19T12:00")).toBe("2026-11-19T06:30:00.000Z");
    expect(utcToIstLocal("2026-11-19T06:30:00.000Z")).toBe("2026-11-19T12:00");
    expect(istDateTime("2026-11-22T06:30:00.000Z")).toBe("22 Nov 2026, 12:00 IST");
    // Midnight crossing: 02:00 IST on 20 Nov is 20:30 UTC on 19 Nov.
    expect(istLocalToUtc("2026-11-20T02:00")).toBe("2026-11-19T20:30:00.000Z");
    expect(istLocalToUtc("not a date")).toBeNull();
    // The 72 h deadline is the same instant whichever zone the clock was read in.
    expect(boardDetailDueAt(istLocalToUtc("2026-11-19T12:00")!)).toBe(boardDetailDueAt("2026-11-19T06:30:00Z"));
  });

  it("states: running → due soon → overdue → done; B2-03 the 'without delay' clocks only count up", () => {
    const at = (h: number) => new Date(Date.parse(base.aware_at) + h * H);
    let [certin, initial, detail, dp] = breachTimers(base, at(0));
    expect(certin.state).toBe("running"); // 2.5 h since noticed, 3.5 h left
    expect(initial).toMatchObject({ kind: "elapsed", dueAt: null, state: "running" });
    expect(detail).toMatchObject({ kind: "deadline", state: "running", remainingMs: 72 * H });
    [certin, initial, detail, dp] = breachTimers(base, at(2));
    expect(certin.state).toBe("due_soon");
    expect(initial.state).toBe("due_soon");
    expect(initial.elapsedMs).toBe(2 * H);
    [certin, , detail, dp] = breachTimers(base, at(50));
    expect(certin.state).toBe("overdue");
    expect(detail.state).toBe("due_soon");
    expect(dp.state).toBe("overdue");
    [, , detail] = breachTimers(base, at(73));
    expect(detail.state).toBe("overdue");
    const done = breachTimers({ ...base, certin_sent_at: at(1).toISOString(), board_detail_sent_at: at(70).toISOString() }, at(80));
    expect(done[0]).toMatchObject({ state: "done", elapsedMs: 3.5 * H });
    expect(done[2].state).toBe("done");
    expect(breachTimers({ ...base, certin_applicable: 0 }, at(10))[0].state).toBe("not_applicable");
  });

  it("reminders are due once per kind and never for closed incidents", () => {
    const now = new Date(Date.parse(base.aware_at) + 2 * H);
    expect(breachRemindersDue({ ...base, status: "open" }, {}, now)).toEqual(["certin_soon", "board_initial"]);
    expect(breachRemindersDue({ ...base, status: "open" }, { certin_soon: "x", board_initial: "x" }, now)).toEqual([]);
    expect(breachRemindersDue({ ...base, status: "closed" }, {}, now)).toEqual([]);
  });
});

describe("breach templates (B1-01, B2-02, B4-02)", () => {
  it("B1-01 the Data Principal message has Rule 7(1)(a)–(e), in English and Hindi", () => {
    const en = dpIntimation(ctx());
    expect(en.sections.a).toContain("A staff laptop with an appointment export was stolen");
    expect(en.sections.a).toContain("between 18 and 19 November 2026"); // timing
    expect(en.sections.a).toContain("About 120 patients"); // extent
    expect(en.sections.a).toContain("- Mobile number"); // data items
    expect(en.sections.b).toContain("calls pretending to be us"); // (b) consequences
    expect(en.sections.c).toContain("Done: Laptop remotely wiped"); // (c) mitigation
    expect(en.sections.c).toContain("In progress: Disk encryption");
    expect(en.sections.d).toContain("Do not share OTPs"); // (d) safety steps
    expect(en.sections.e).toContain("privacy@clinic.example.in"); // (e) contact
    for (const s of Object.values(en.sections)) expect(en.text).toContain(s);
    expect(en.text).toMatch(/draft — pending lawyer review/);
    const hi = dpIntimation(ctx({ lang: "hi" }));
    expect(hi.text).toContain("क्या हुआ");
    expect(hi.text).toContain("किससे संपर्क करें");
    expect(hi.subject).toMatch(/[ऀ-ॿ]/);
    // Missing facts are flagged, never silently dropped.
    expect(dpIntimation(ctx({ details: EMPTY_DETAILS })).sections.b).toContain("[…]");
  });

  it("B2 the initial Board intimation has nature, extent, timing, location and likely impact", () => {
    const m = boardInitial(ctx());
    for (const s of ["nature", "Extent", "Timing", "Location of occurrence", "Pune branch office", "Likely impact", "Risk of phishing calls", "19 Nov 2026, 09:30 IST", "19 Nov 2026, 12:00 IST"]) expect(m.text).toContain(s);
  });

  it("B2-02 the detailed Board report has items (i)–(vi)", () => {
    const m = boardDetailed(ctx());
    for (const item of ["(i) Updated and detailed description", "(ii) Broad facts", "(iii) Measures", "(iv) Findings regarding the person", "(v) Remedial measures", "(vi) Report on intimations"]) expect(m.text).toContain(item);
    expect(m.text).toContain("Number notified: 100 of 120");
    expect(m.text).toContain("Unencrypted laptop");
    const hi = boardDetailed(ctx({ lang: "hi" }));
    for (const item of ["(i)", "(ii)", "(iii)", "(iv)", "(v)", "(vi)"]) expect(hi.text).toContain(item);
  });

  it("B4-02 the CERT-In email goes to incident@cert-in.org.in with type, noticed time, systems and logs", () => {
    const m = certinEmail(ctx());
    expect(m.to).toBe("incident@cert-in.org.in");
    expect(m.text).toContain("Incident type (Annexure I): Data Breach");
    expect(m.text).toContain("Noticed at: 19 Nov 2026, 09:30 IST");
    expect(m.text).toContain("180 days within India");
  });
});

describe("breach register service (B1-02, B3-01, timeline, reminders)", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let org: Awaited<ReturnType<typeof createReadyOrg>>;
  const outbox: MailMessage[] = [];

  beforeAll(async () => {
    setMasterKeyForTests(Buffer.alloc(32, 9));
    setMailTransport(async (m) => {
      outbox.push(m);
    });
    db = await createTestDb();
    // The owner has no plan at all (Trial): B3-01 the register works on every plan.
    org = await createReadyOrg(db, "owner@clinic.test", "Sharma Physio", "clinic");
  });
  afterAll(async () => {
    setMailTransport(null);
    setMasterKeyForTests(null);
    await db.destroy();
  });

  it("B3-01 records an incident on any plan, with validation and a timeline", async () => {
    expect(await createBreach(org.t, { title: "x", noticedAt: new Date().toISOString(), awareAt: new Date().toISOString(), affectedCount: 1, certinApplicable: true, details: {} }, org.userId)).toEqual({ ok: false, error: "title" });
    const future = new Date(Date.now() + 3 * H).toISOString();
    expect(await createBreach(org.t, { title: "Future", noticedAt: future, awareAt: future, affectedCount: 1, certinApplicable: true, details: {} }, org.userId)).toEqual({ ok: false, error: "future" });
    const r = await createBreach(org.t, { title: "Laptop stolen", noticedAt: new Date(Date.now() - 3 * H).toISOString(), awareAt: new Date(Date.now() - 2 * H).toISOString(), affectedCount: 120, certinApplicable: true, details: { nature: "Laptop stolen", categories: ["Name", "Mobile"] } }, org.userId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ref).toMatch(/^B-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect((await listBreachEvents(org.t, r.id)).map((e) => e.kind)).toEqual(["noticed", "aware", "created"]);
    expect((await toggleChecklist(org.t, r.id, "contain", true, org.userId)).ok).toBe(true);
    expect((await addEvidenceNote(org.t, r.id, "Police complaint no. 123/2026", org.userId)).ok).toBe(true);
    const events = await listBreachEvents(org.t, r.id);
    expect(events.find((e) => e.kind === "evidence")?.body).toBe("Police complaint no. 123/2026");
    // Evidence is encrypted at rest.
    const raw = await org.t.selectFrom("breach_events").select("body_enc").where("kind", "=", "evidence").executeTakeFirstOrThrow();
    expect(raw.body_enc).not.toContain("Police");
    // The timeline is insert-only.
    await expect(db.updateTable("breach_events").set({ meta: "x" }).execute()).rejects.toThrow(/insert-only/);
    await expect(db.deleteFrom("breach_events").execute()).rejects.toThrow(/insert-only/);
  });

  it("B1-02 recipients: de-duplicated, encrypted, emailed with a mail_log row each, exported as CSV", async () => {
    const r = await createBreach(org.t, { title: "Mailing list leak", noticedAt: new Date(Date.now() - H).toISOString(), awareAt: new Date(Date.now() - H).toISOString(), affectedCount: 3, certinApplicable: false, details: { nature: "Mailing list exposed" } }, org.userId);
    if (!r.ok) throw new Error(r.error);
    const added = await addRecipients(org.t, r.id, "a@example.in\nA@Example.in\n9876543210\nnot-valid\nb@example.in");
    expect(added).toEqual({ ok: true, added: 3, invalid: 1 });
    const stored = await org.t.selectFrom("breach_recipients").select("contact_enc").execute();
    expect(stored.every((s) => !s.contact_enc.includes("example.in"))).toBe(true);
    const tpl = await breachTemplates(org.t, r.id, "en");
    const before = outbox.length;
    const sent = await emailIntimation(org.t, r.id, tpl!.dp, org.userId);
    expect(sent).toEqual({ ok: true, sent: 2, failed: 0 });
    expect(outbox.slice(before).map((m) => m.to).sort()).toEqual(["a@example.in", "b@example.in"]);
    expect((await listMailLog(org.t)).filter((m) => m.kind === "breach.dp_intimation")).toHaveLength(2);
    expect((await getBreach(org.t, r.id))?.dp_notice_sent_at).toBeTruthy();
    // The phone recipient was told by SMS outside the app.
    expect(await markRecipientsManual(org.t, r.id, "sms", new Date().toISOString(), org.userId)).toEqual({ ok: true, marked: 1 });
    const list = await listRecipients(org.t, r.id);
    expect(list.map((x) => [x.kind, x.status, x.channel])).toEqual([
      ["email", "sent", "email"],
      ["phone", "manual", "sms"],
      ["email", "sent", "email"],
    ]);
    const csv = (await recipientsCsv(org.t, r.id, { subject: tpl!.dp.subject, text: tpl!.dp.text, sms: tpl!.short.sms }))!;
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("breach_ref,kind,contact,status,channel,sent_at,subject,message,sms");
    expect(csv).toContain("a@example.in");
    expect(csv).toContain("919876543210");
    // The (vi) report counts every person told.
    const after = await breachTemplates(org.t, r.id, "en");
    expect(after!.boardDetailed.text).toContain("Number notified: 3 of 3");
  });

  it("steps, extension, closing; alerts; register CSV", async () => {
    const r = await createBreach(org.t, { title: "Ransomware on billing PC", noticedAt: new Date(Date.now() - 5.5 * H).toISOString(), awareAt: new Date(Date.now() - 5 * H).toISOString(), affectedCount: 40, certinApplicable: true, details: { nature: "Ransomware" } }, org.userId);
    if (!r.ok) throw new Error(r.error);
    const alerts = await breachAlerts(org.t);
    const mine = alerts.find((a) => a.id === r.id)!;
    expect(mine.timer?.key).toBe("certin"); // due within 30 minutes: the most urgent
    expect(mine.worst).toBe("due_soon");
    expect((await markStep(org.t, r.id, "certin", new Date().toISOString(), org.userId)).ok).toBe(true);
    expect((await markStep(org.t, r.id, "board_initial", new Date().toISOString(), org.userId)).ok).toBe(true);
    expect(await recordExtension(org.t, r.id, { requestedAt: new Date().toISOString(), until: new Date(Date.now() - 10 * H).toISOString(), reason: "x" }, org.userId)).toEqual({ ok: false, error: "extension" });
    const until = new Date(Date.now() + 7 * 24 * H).toISOString();
    expect((await recordExtension(org.t, r.id, { requestedAt: new Date().toISOString(), until, reason: "Forensics still running" }, org.userId)).ok).toBe(true);
    const row = (await getBreach(org.t, r.id))!;
    expect(breachTimers(row)[2].dueAt).toBe(until);
    expect((await setBreachStatus(org.t, r.id, "closed", org.userId)).ok).toBe(true);
    expect((await breachAlerts(org.t)).some((a) => a.id === r.id)).toBe(false);
    const csv = await breachRegisterCsv(org.t);
    expect(csv.split("\r\n")[0]).toContain("certin_due_at");
    expect(csv).toContain(row.ref);
  });

  it("reminder job: once per kind, only the organisation's owner and admins", async () => {
    const other = await createReadyOrg(db, "other@shop.test", "Other Shop", "d2c");
    const r = await createBreach(other.t, { title: "Shop DB exposed", noticedAt: new Date(Date.now() - 5 * H).toISOString(), awareAt: new Date(Date.now() - 4 * H).toISOString(), affectedCount: 10, certinApplicable: true, details: {} }, other.userId);
    if (!r.ok) throw new Error(r.error);
    const before = outbox.length;
    const first = await runBreachReminders(db, { baseUrl: BASE_URL });
    expect(first.sent).toBeGreaterThan(0);
    const mails = outbox.slice(before);
    expect(new Set(mails.map((m) => m.to))).toEqual(new Set(["owner@clinic.test", "other@shop.test"]));
    expect(mails.filter((m) => m.to === "other@shop.test").every((m) => m.subject.includes(r.ref))).toBe(true);
    const again = await runBreachReminders(db, { baseUrl: BASE_URL });
    expect(again.sent).toBe(0);
  });
});
