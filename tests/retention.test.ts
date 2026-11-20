import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consentPurgeCutoff, DEFAULT_PRE_NOTICE_HOURS, ERASURE_CYCLE_DAYS, logFloorCutoff, planErasureTask, signOffBlock } from "@/core/retention";
import type { Site } from "@/lib/db/schema";
import { tenantDb } from "@/lib/db/tenant";
import { setMailTransport, type MailMessage } from "@/lib/mail";
import { buildSiteConfig, consentLogCsv, findSiteByPublicKey, recordConsent, verifySiteChain, withdrawAll } from "@/lib/privacy/consent";
import { listMailLog } from "@/lib/privacy/mailer";
import { publishNotice } from "@/lib/privacy/notices";
import { createRetentionRule, createSite, createVendor, getSite, listRetentionRules, setSiteArchived } from "@/lib/privacy/registers";
import {
  createRequestErasureTasks,
  deleteSiteAfterRetention,
  ensureRuleTasks,
  erasureTasksCsv,
  getTask,
  listTasks,
  markPreNoticeSent,
  purgeSiteConsent,
  retentionScheduleCsv,
  signOffTask,
  siteRetentionStatus,
  updateRetentionSettings,
} from "@/lib/privacy/retention";
import { submitRequest, verifyRequest } from "@/lib/privacy/rights";
import { runConsentPurge, runRetentionReminders } from "@/lib/retention-jobs";
import { setMasterKeyForTests } from "@/lib/secrets";
import { insertOldEvents } from "./helpers/consent-events";
import { createTestDb } from "./helpers/db";
import { BASE_URL, createReadyOrg } from "./helpers/fixtures";

const DAY = 86_400_000;
const H = 3_600_000;


describe("retention pure rules (E2-02, E3-02)", () => {
  const now = new Date("2026-11-19T10:00:00.000Z");

  it("periodic erasure runs: due every 30 days, cut-off = due − period; optional pre-notice defaults to 48 h", () => {
    const plan = planErasureTask({ periodDays: 365, action: "erase", trigger: "collection", preNoticeHours: null, createdAt: "2026-11-01T00:00:00.000Z", lastRunAt: null, preNoticeEnabled: false })!;
    expect(plan.dueAt).toBe(new Date(Date.parse("2026-11-01T00:00:00.000Z") + ERASURE_CYCLE_DAYS * DAY).toISOString());
    expect(plan.cutoffAt).toBe(new Date(Date.parse(plan.dueAt) - 365 * DAY).toISOString());
    expect(plan.preNoticeAt).toBeNull(); // off by default
    const withNotice = planErasureTask({ periodDays: 365, action: "erase", trigger: "collection", preNoticeHours: null, createdAt: "2026-11-01T00:00:00.000Z", lastRunAt: null, preNoticeEnabled: true })!;
    expect(DEFAULT_PRE_NOTICE_HOURS).toBe(48);
    expect(Date.parse(withNotice.dueAt) - Date.parse(withNotice.preNoticeAt!)).toBe(48 * H);
    expect(planErasureTask({ periodDays: 0, action: "erase", trigger: "withdrawal", preNoticeHours: null, createdAt: "2026-11-01T00:00:00.000Z", lastRunAt: null, preNoticeEnabled: false })).toBeNull();
  });

  it("E3-02 log erasure cannot be signed off before the one-year floor; pre-notice must be sent and its hours passed", () => {
    expect(logFloorCutoff(now).toISOString()).toBe("2025-11-19T10:00:00.000Z");
    const task = { is_logs: 1, cutoff_at: "2026-06-01T00:00:00.000Z", pre_notice_at: null, pre_notice_sent_at: null, pre_notice_hours: null };
    expect(signOffBlock(task, now)).toBe("log_floor");
    expect(signOffBlock({ ...task, cutoff_at: "2025-11-01T00:00:00.000Z" }, now)).toBeNull();
    const pre = { is_logs: 0, cutoff_at: "2025-01-01T00:00:00.000Z", pre_notice_at: "2026-11-17T10:00:00.000Z", pre_notice_sent_at: null, pre_notice_hours: 48 };
    expect(signOffBlock(pre, now)).toBe("pre_notice_not_sent");
    expect(signOffBlock({ ...pre, pre_notice_sent_at: "2026-11-18T10:00:00.000Z" }, now)).toBe("pre_notice_wait");
    expect(signOffBlock({ ...pre, pre_notice_sent_at: "2026-11-17T09:00:00.000Z" }, now)).toBeNull();
  });

  it("consent purge cut-off is never later than one year back, whatever the setting", () => {
    expect(consentPurgeCutoff(now, 30).toISOString()).toBe("2025-11-19T10:00:00.000Z");
    expect(consentPurgeCutoff(now, 1095).toISOString()).toBe(new Date(now.getTime() - 1095 * DAY).toISOString());
  });
});

describe("retention schedule and erasure tasks (E1, E2)", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let org: Awaited<ReturnType<typeof createReadyOrg>>;
  const outbox: MailMessage[] = [];

  beforeAll(async () => {
    setMasterKeyForTests(Buffer.alloc(32, 21));
    setMailTransport(async (m) => {
      outbox.push(m);
    });
    db = await createTestDb();
    org = await createReadyOrg(db, "owner@clinic.test", "Sharma Physio", "clinic");
  });
  afterAll(async () => {
    setMailTransport(null);
    setMasterKeyForTests(null);
    await db.destroy();
  });

  it("E1-01 every rule with a fixed period gets one open periodic task; 'until withdrawal' rules get none", async () => {
    const created = await ensureRuleTasks(org.t);
    const rules = await listRetentionRules(org.t);
    const fixed = rules.filter((r) => r.period_days > 0 && r.trigger !== "withdrawal");
    expect(created).toBe(fixed.length);
    expect(await ensureRuleTasks(org.t)).toBe(0); // idempotent while open
    const tasks = await listTasks(org.t, { status: "open" });
    expect(tasks.every((x) => x.source === "rule" && x.cutoff_at && x.pre_notice_at === null)).toBe(true);
    const logs = tasks.find((x) => x.is_logs === 1);
    expect(logs).toBeTruthy();
    // E3-02: the log rule's cut-off is a year back, so signing it off is allowed only after the floor.
    const csv = await retentionScheduleCsv(org.t);
    expect(csv.split("\r\n")[0]).toBe("category,category_hi,purposes,period_days,trigger,action,law_ref,is_logs,pre_notice_hours");
  });

  it("E2-02 with the optional pre-notice on, new tasks carry a 48 h notice and sign-off waits for it", async () => {
    await updateRetentionSettings(org.t, { consentRetentionDays: 100, preErasureNotice: true });
    expect((await org.t.org())?.consent_retention_days).toBe(365); // clamped to the floor
    const r = await createRetentionRule(org.t, { category: "Old enquiries", categoryHi: "पुरानी पूछताछ", lawRef: "", periodDays: 180, trigger: "last_interaction", action: "erase", preNoticeHours: null, isLogs: false });
    if (!("id" in r)) throw new Error("rule");
    await ensureRuleTasks(org.t);
    const task = (await listTasks(org.t, { status: "open" })).find((x) => x.rule_id === r.id)!;
    expect(Date.parse(task.due_at) - Date.parse(task.pre_notice_at!)).toBe(48 * H);
    const late = new Date(Date.parse(task.due_at) + 3 * DAY);
    expect(await signOffTask(org.t, task.id, { status: "done", note: "" }, org.userId, late)).toEqual({ ok: false, error: "pre_notice_not_sent" });
    expect((await markPreNoticeSent(org.t, task.id, new Date(Date.parse(task.due_at) - 2 * H).toISOString(), org.userId)).ok).toBe(true);
    expect(await signOffTask(org.t, task.id, { status: "done", note: "" }, org.userId, new Date(Date.parse(task.due_at)))).toEqual({ ok: false, error: "pre_notice_wait" });
    expect(await signOffTask(org.t, task.id, { status: "done", note: "Deleted 41 enquiries" }, org.userId, late)).toEqual({ ok: true });
    expect((await getTask(org.t, task.id))).toMatchObject({ status: "done", signed_off_by: org.userId, sign_off_note: "Deleted 41 enquiries" });
    // The next run is planned from the sign-off.
    await ensureRuleTasks(org.t, late);
    expect((await listTasks(org.t, { status: "open" })).filter((x) => x.rule_id === r.id)).toHaveLength(1);
    expect(await signOffTask(org.t, task.id, { status: "done", note: "" }, org.userId)).toEqual({ ok: false, error: "closed" });
    await updateRetentionSettings(org.t, { consentRetentionDays: 365, preErasureNotice: false });
  });

  it("skipping needs a reason; audit log records sign-offs", async () => {
    const task = (await listTasks(org.t, { status: "open" }))[0];
    expect(await signOffTask(org.t, task.id, { status: "skipped", note: "" }, org.userId)).toEqual({ ok: false, error: "note" });
    expect(await signOffTask(org.t, task.id, { status: "skipped", note: "Legal hold: GST audit" }, org.userId)).toEqual({ ok: true });
    const audit = await org.t.selectFrom("audit_log").select("action").execute();
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["erasure.done", "erasure.skipped", "erasure.pre_notice"]));
    expect(await erasureTasksCsv(org.t)).toContain("Legal hold: GST audit");
  });

  it("E1-02 an erasure request creates a task for our own systems and one per processor", async () => {
    await createVendor(org.t, { name: "SMS gateway", service: "Reminders", dataShared: ["mobile"], location: "india", contractStatus: "signed", contractDate: "2026-01-01", securityClause: true, reviewAt: null, erasureContact: "dpo@sms.example" });
    const s = await submitRequest(org.t, { type: "erasure", name: "Asha Verma", email: "asha@example.in", details: "Please erase my data", identifiers: {}, lang: "en", ip: "198.51.100.9" }, { baseUrl: BASE_URL });
    if (!s.ok) throw new Error(s.error);
    const code = outbox.at(-1)!.text.match(/is: (\d{6})/)![1];
    expect((await verifyRequest(org.t, s.requestId, code, { baseUrl: BASE_URL })).ok).toBe(true);
    const r = await createRequestErasureTasks(org.t, s.requestId, org.userId);
    expect(r.ok).toBe(true);
    const tasks = await listTasks(org.t, { requestId: s.requestId });
    const vendors = await org.t.selectFrom("vendors").select("id").execute();
    expect(tasks.filter((x) => x.vendor_id === null)).toHaveLength(1);
    expect(tasks.filter((x) => x.vendor_id !== null).length).toBeGreaterThanOrEqual(1);
    expect(tasks.every((x) => x.vendor_id === null || vendors.some((v) => v.id === x.vendor_id))).toBe(true);
    expect(await createRequestErasureTasks(org.t, s.requestId, org.userId)).toEqual({ ok: true, created: 0 }); // idempotent
  });

  it("daily job: creates tasks and emails the owner once per reminder", async () => {
    const before = outbox.length;
    const far = new Date(Date.now() + 40 * DAY);
    const first = await runRetentionReminders(db, { baseUrl: BASE_URL, now: far });
    expect(first.sent).toBeGreaterThan(0);
    expect(outbox.slice(before).every((m) => m.to === "owner@clinic.test")).toBe(true);
    // A task may need two different reminders (pre-notice, then overdue); each kind is sent once.
    await runRetentionReminders(db, { baseUrl: BASE_URL, now: far });
    const third = await runRetentionReminders(db, { baseUrl: BASE_URL, now: far });
    expect(third.sent).toBe(0);
    expect((await listMailLog(org.t)).some((m) => m.kind.startsWith("erasure.reminder."))).toBe(true);
  });
});

describe("consent-record purge (E3-02; checkpoint keeps the chain verifiable)", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let org: Awaited<ReturnType<typeof createReadyOrg>>;
  let site: Site;
  const old = new Date(Date.now() - 400 * DAY).toISOString();
  const recentish = new Date(Date.now() - 200 * DAY).toISOString();

  beforeAll(async () => {
    setMasterKeyForTests(Buffer.alloc(32, 22));
    db = await createTestDb();
    org = await createReadyOrg(db, "owner@clinic.test", "Sharma Physio", "clinic");
    expect((await org.t.org())?.consent_retention_days).toBe(1095); // default: 3 years
    await updateRetentionSettings(org.t, { consentRetentionDays: 365, preErasureNotice: false }); // the Rule 8(3) minimum
    expect((await publishNotice(org.t, { baseUrl: BASE_URL, userId: org.userId })).ok).toBe(true);
    site = (await getSite(org.t, await createSite(org.t, { name: "Clinic", domain: "sharmaphysio.in", allowedOrigins: [], childrenMode: false })))!;
    await insertOldEvents(db, org.t, site, 5, old); // seq 1–5: expired
    await insertOldEvents(db, org.t, site, 1, old, { subject: "live-visitor-00000001", grantedState: true }); // seq 6: expired but still the proof of a live consent
    await insertOldEvents(db, org.t, site, 2, old); // seq 7–8: expired, after the live one
    await insertOldEvents(db, org.t, site, 3, recentish); // seq 9–11: younger than one year
    const r = await recordConsent(org.t, site, { subjectRef: "fresh-visitor-0000001", choices: { analytics: true }, lang: "en", channel: "banner", noticeVersion: 1 }); // seq 12: now
    expect(r.ok).toBe(true);
    expect((await verifySiteChain(org.t, site.id)).ok).toBe(true);
  });
  afterAll(async () => {
    setMasterKeyForTests(null);
    await db.destroy();
  });

  it("the database refuses deletes without a checkpoint and checkpoints younger than one year", async () => {
    await expect(db.deleteFrom("consent_events").where("seq", "=", 1).execute()).rejects.toThrow(/insert-only/);
    await expect(db.updateTable("consent_events").set({ page_url: "x" }).where("seq", "=", 1).execute()).rejects.toThrow(/insert-only/);
    const tooRecent = { org_id: org.orgId, site_id: site.id, from_seq: 1, through_seq: 11, through_hash: "x".repeat(64), cutoff_at: new Date(Date.now() - 30 * DAY).toISOString(), purged_count: 11, reason: "retention" as const, by_user_id: null, created_at: new Date().toISOString() };
    await expect(db.insertInto("consent_purge_checkpoints").values(tooRecent).execute()).rejects.toThrow(/at least one year/);
  });

  it("dry run changes nothing; the purge removes only expired rows before the first live proof, audited, chain still verifies", async () => {
    const dry = await purgeSiteConsent(org.t, site, { dryRun: true });
    expect(dry).toMatchObject({ status: "dry_run", fromSeq: 1, throughSeq: 5, count: 5 });
    expect(await org.t.selectFrom("consent_events").select("id").execute()).toHaveLength(12);

    const run = await runConsentPurge(db, { dryRun: false });
    expect(run.purged).toBe(5);
    expect(run.sites[0]).toMatchObject({ orgId: org.orgId, status: "purged", fromSeq: 1, throughSeq: 5, count: 5 });
    const seqs = (await org.t.selectFrom("consent_events").select("seq").orderBy("seq").execute()).map((r) => Number(r.seq));
    expect(seqs).toEqual([6, 7, 8, 9, 10, 11, 12]);
    const report = await verifySiteChain(org.t, site.id);
    expect(report.ok).toBe(true);
    expect(report.checkpoint).toMatchObject({ throughSeq: 5, purgedTotal: 5 });
    expect(report.count).toBe(7);
    const csv = await consentLogCsv(org.t, site.id);
    expect(csv).toContain("# chain_ok,true");
    expect(csv).toContain("# purged_through_seq,5");
    const audit = await org.t.selectFrom("audit_log").select(["action", "target"]).where("action", "=", "consent.purge").execute();
    expect(audit).toHaveLength(1);
    expect(audit[0].target).toContain("seq 1-5 (5)");
    // Checkpoints are tombstones: they cannot be changed or removed.
    await expect(db.updateTable("consent_purge_checkpoints").set({ purged_count: 0 }).execute()).rejects.toThrow(/insert-only/);
    await expect(db.deleteFrom("consent_purge_checkpoints").execute()).rejects.toThrow(/insert-only/);
    // Tampering with a remaining row is still detected after the checkpoint.
    await expect(db.deleteFrom("consent_events").where("seq", "=", 9).execute()).rejects.toThrow(/insert-only/);
    expect(await purgeSiteConsent(org.t, site)).toMatchObject({ status: "nothing" });
  });

  it("once the live consent is withdrawn, its old proof and the rest of the expired prefix can go", async () => {
    await withdrawAll(org.t, site, "live-visitor-00000001", { channel: "link", lang: "en" }); // seq 13 (now)
    const r = await purgeSiteConsent(org.t, site);
    expect(r).toMatchObject({ status: "purged", fromSeq: 6, throughSeq: 8, count: 3 });
    expect((await verifySiteChain(org.t, site.id))).toMatchObject({ ok: true, checkpoint: { throughSeq: 8, purgedTotal: 8 } });
  });

  it("archiving stops new consent; a site can be deleted only after its records' retention has ended", async () => {
    const other = (await getSite(org.t, await createSite(org.t, { name: "Old campaign site", domain: "campaign.example.in", allowedOrigins: [], childrenMode: false })))!;
    await insertOldEvents(db, org.t, other, 4, old, { subject: "old-visitor-camp0001", grantedState: true });
    expect(await deleteSiteAfterRetention(org.t, other.id, org.userId)).toEqual({ ok: false, error: "not_archived" });
    expect(await setSiteArchived(org.t, other.id, true)).toBe(true);
    expect(await findSiteByPublicKey(db, other.public_key)).toBeNull();
    const archived = (await getSite(org.t, other.id))!;
    expect(await recordConsent(org.t, archived, { subjectRef: "x".repeat(20), choices: { analytics: true }, lang: "en", channel: "banner", noticeVersion: 1 })).toEqual({ ok: false, error: "purposes" });
    expect((await siteRetentionStatus(org.t, other.id))?.canDelete).toBe(true);
    // The main site still has young records: not deletable even when archived.
    await setSiteArchived(org.t, site.id, true);
    expect(await deleteSiteAfterRetention(org.t, site.id, org.userId)).toEqual({ ok: false, error: "not_expired" });
    await setSiteArchived(org.t, site.id, false);
    expect(await deleteSiteAfterRetention(org.t, other.id, org.userId)).toEqual({ ok: true, purged: 4 });
    expect(await getSite(org.t, other.id)).toBeUndefined();
    const tomb = await org.t.selectFrom("consent_purge_checkpoints").selectAll().where("site_id", "=", other.id).execute();
    expect(tomb).toMatchObject([{ reason: "site_delete", purged_count: 4, by_user_id: org.userId }]);
    expect((await buildSiteConfig(org.t, site, BASE_URL)).notice).not.toBeNull();
  });

  it("tenant scope: another organisation's purge never touches this one", async () => {
    const b = await createReadyOrg(db, "b@store.test", "Store B", "d2c");
    const bSite = (await getSite(b.t, await createSite(b.t, { name: "B", domain: "b.example.in", allowedOrigins: [], childrenMode: false })))!;
    await insertOldEvents(db, b.t, bSite, 2, old);
    // With the default 3-year retention, B's 400-day-old records are kept.
    expect(await purgeSiteConsent(b.t, bSite, { dryRun: true })).toMatchObject({ status: "nothing" });
    await expect(purgeSiteConsent(org.t, bSite)).rejects.toThrow(/does not belong/);
    expect(await siteRetentionStatus(org.t, bSite.id)).toBeNull();
    expect(await deleteSiteAfterRetention(org.t, bSite.id, org.userId)).toEqual({ ok: false, error: "not_found" });
    expect(await tenantDb(db, b.orgId).selectFrom("consent_events").select("id").execute()).toHaveLength(2);
  });
});
