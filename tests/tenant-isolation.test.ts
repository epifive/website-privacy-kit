import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setMailTransport, type MailMessage } from "@/lib/mail";
import { listAttachments, readAttachment } from "@/lib/privacy/attachments";
import { listMailLog } from "@/lib/privacy/mailer";
import { addNote, assignRequest, buildReply, changeStatus, closeRequest, getDecrypted, getRequest, listNominations, listRequestEvents, listRequests, recordNomination, resendCode, revokeNomination, rightsStats, sendReply, submitRequest, verifyRequest } from "@/lib/privacy/rights";
import { runRightsReminders } from "@/lib/rights-jobs";
import { runBreachReminders } from "@/lib/breach-jobs";
import { createRequestErasureTasks, deleteSiteAfterRetention, ensureRuleTasks, erasureTasksCsv, getTask, listTasks, markPreNoticeSent, reopenTask, signOffTask, siteRetentionStatus, updateRetentionSettings } from "@/lib/privacy/retention";
import { addEvidenceNote, addRecipients, breachAlerts, breachRegisterCsv, breachTemplates, createBreach, emailIntimation, getBreach, listBreachEvents, listBreaches, listRecipients, markRecipientsManual, markStep, recipientsCsv, recordExtension, setBreachStatus, toggleChecklist, updateBreach } from "@/lib/privacy/breaches";
import { tenantDb, TENANT_TABLES, type TenantDb } from "@/lib/db/tenant";
import { getNoticeVersion, listNoticeVersions, previewNotice, publishNotice } from "@/lib/privacy/notices";
import { countOwnedOrgs, getMembershipRole, listUserOrgs, updateOrgProfile } from "@/lib/privacy/orgs";
import {
  createPurpose,
  createSite,
  deleteContact,
  deletePurpose,
  deleteRetentionRule,
  deleteSite,
  deleteVendor,
  getContacts,
  getPurpose,
  getRetentionRule,
  getSite,
  getVendor,
  listPurposes,
  listRetentionRules,
  listSites,
  listVendors,
  purposeKeyTaken,
  setSiteArchived,
  updatePurpose,
  updateRetentionRule,
  updateSite,
  updateVendor,
  upsertContact,
} from "@/lib/privacy/registers";
import { buildSiteConfig, consentLogCsv, getConsentState, listConsentEvents, recordConsent, verifySiteChain, withdrawAll } from "@/lib/privacy/consent";
import { getAnswers, saveAnswers } from "@/lib/privacy/setup";
import { identifierHmac, setMasterKeyForTests } from "@/lib/secrets";
import { createTestDb } from "./helpers/db";
import { BASE_URL, createReadyOrg } from "./helpers/fixtures";

/**
 * T-ISO: for every tenant query, organisation A can neither read nor change
 * organisation B's rows by id (plan §7.6, §10.4; §3.3 guardrail 2).
 */
describe("T-ISO tenant isolation", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let a: Awaited<ReturnType<typeof createReadyOrg>>;
  let b: Awaited<ReturnType<typeof createReadyOrg>>;
  let bIds: { site: number; purpose: number; vendor: number; rule: number };

  const snapshot = async (t: TenantDb) => ({
    sites: await listSites(t),
    purposes: await listPurposes(t),
    vendors: await listVendors(t),
    rules: await listRetentionRules(t),
    contacts: await getContacts(t),
    org: await t.org(),
    notices: await listNoticeVersions(t),
    answers: await getAnswers(t),
  });

  beforeAll(async () => {
    db = await createTestDb();
    a = await createReadyOrg(db, "a@clinic.test", "Clinic A", "clinic");
    b = await createReadyOrg(db, "b@store.test", "Store B", "d2c");
    const site = await createSite(b.t, { name: "B shop", domain: "b.example.com", allowedOrigins: [], childrenMode: false });
    await publishNotice(b.t, { baseUrl: BASE_URL, userId: b.userId });
    await saveAnswers(b.t, { secret: "b-only" });
    const [purpose] = await listPurposes(b.t);
    const [vendor] = await listVendors(b.t);
    const [rule] = await listRetentionRules(b.t);
    bIds = { site, purpose: purpose.id, vendor: vendor.id, rule: rule.id };
  });
  afterAll(() => db.destroy());

  it("T-ISO-01 lists only the caller's rows", async () => {
    const [pa, pb] = await Promise.all([listPurposes(a.t), listPurposes(b.t)]);
    expect(pa.length).toBeGreaterThan(0);
    expect(pa.every((p) => p.org_id === a.orgId)).toBe(true);
    expect(pb.every((p) => p.org_id === b.orgId)).toBe(true);
    expect((await listVendors(a.t)).every((v) => v.org_id === a.orgId)).toBe(true);
    expect((await listRetentionRules(a.t)).every((r) => r.org_id === a.orgId)).toBe(true);
    expect(await listSites(a.t)).toEqual([]);
    expect(await listNoticeVersions(a.t)).toEqual([]);
    expect((await getAnswers(a.t)).answers).not.toHaveProperty("secret");
    expect((await getContacts(a.t)).grievance?.org_id).toBe(a.orgId);
  });

  it("T-ISO-02 get-by-id returns nothing for another organisation's ids", async () => {
    expect(await getSite(a.t, bIds.site)).toBeUndefined();
    expect(await getPurpose(a.t, bIds.purpose)).toBeUndefined();
    expect(await getVendor(a.t, bIds.vendor)).toBeUndefined();
    expect(await getRetentionRule(a.t, bIds.rule)).toBeUndefined();
    expect(await getNoticeVersion(a.t, "en")).toBeUndefined();
    expect(await purposeKeyTaken(a.t, "orders")).toBe(false);
  });

  it("T-ISO-03 updates and deletes on another organisation's ids change nothing", async () => {
    const before = await snapshot(b.t);
    expect(await updateSite(a.t, bIds.site, { name: "hacked", domain: "evil.test", allowedOrigins: [], childrenMode: true })).toBe(false);
    expect(await updateVendor(a.t, bIds.vendor, { name: "hacked", service: "", dataShared: [], location: "abroad", contractStatus: "signed", contractDate: null, securityClause: true, reviewAt: null, erasureContact: "" })).toBe(false);
    expect(await updateRetentionRule(a.t, bIds.rule, { category: "hacked", categoryHi: "", lawRef: "", periodDays: 400, trigger: "collection", action: "erase", preNoticeHours: null, isLogs: false })).toEqual({ ok: false });
    expect(
      await updatePurpose(a.t, bIds.purpose, { key: "x", nameEn: "hacked", nameHi: "", descEn: "", descHi: "", basis: "consent", items: [], vendorIds: [], retentionRuleId: null, siteId: null, isTracking: false, active: false }),
    ).toBe(false);
    expect(await deleteSite(a.t, bIds.site)).toBe(false);
    expect(await deletePurpose(a.t, bIds.purpose)).toBe(false);
    expect(await deleteVendor(a.t, bIds.vendor)).toBe(false);
    expect(await deleteRetentionRule(a.t, bIds.rule)).toBe(false);
    await upsertContact(a.t, "grievance", { name: "A officer", designation: "", email: "a@clinic.test", phone: "", address: "" });
    await deleteContact(a.t, "dpo_or_authorised");
    await updateOrgProfile(a.t, { name: "Clinic A renamed" });
    await saveAnswers(a.t, { secret: "a-wrote" });
    expect(await snapshot(b.t)).toEqual(before);
  });

  it("T-ISO-04 cross-references to another organisation's rows are dropped on save", async () => {
    const id = await createPurpose(a.t, {
      key: "cross_ref",
      nameEn: "Cross",
      nameHi: "क्रॉस",
      descEn: "d",
      descHi: "द",
      basis: "consent",
      items: [{ key: "name" }],
      vendorIds: [bIds.vendor],
      retentionRuleId: bIds.rule,
      siteId: bIds.site,
      isTracking: false,
      active: true,
    });
    const row = await getPurpose(a.t, id);
    expect(row?.vendor_ids).toBe("[]");
    expect(row?.retention_rule_id).toBeNull();
    expect(row?.site_id).toBeNull();
  });

  it("T-ISO-05 notice preview and publish only use the caller's registers", async () => {
    const preview = await previewNotice(a.t, BASE_URL);
    const allVendorNames = preview.input.purposes.flatMap((p) => p.vendors.map((v) => v.name));
    expect(allVendorNames).not.toContain("Shopify");
    expect(preview.input.org.slug).not.toBe((await b.t.org())?.slug);
    const result = await publishNotice(a.t, { baseUrl: BASE_URL, userId: a.userId });
    expect(result.ok).toBe(true);
    expect((await listNoticeVersions(b.t)).length).toBe(1);
    const aEn = await getNoticeVersion(a.t, "en");
    expect(aEn?.org_id).toBe(a.orgId);
    expect(aEn?.body_md).not.toContain("Store B");
  });

  it("T-ISO-06 memberships: users only see their own organisations", async () => {
    expect((await listUserOrgs(db, a.userId)).map((o) => o.id)).toEqual([a.orgId]);
    expect(await getMembershipRole(db, b.orgId, a.userId)).toBeNull();
    expect(await getMembershipRole(db, a.orgId, a.userId)).toBe("owner");
    expect(await countOwnedOrgs(db, a.userId)).toBe(1);
  });

  it("T-ISO-07 every tenant table query is scoped (generic helper check)", async () => {
    for (const table of TENANT_TABLES) {
      const rows = (await a.t.selectFrom(table).selectAll().execute()) as Array<{ org_id: number }>;
      expect(rows.every((r) => r.org_id === a.orgId)).toBe(true);
      const bRows = (await b.t.selectFrom(table).selectAll().execute()) as Array<{ org_id: number }>;
      expect(bRows.every((r) => r.org_id === b.orgId)).toBe(true);
    }
  });

  it("T-ISO-08 inserts cannot override org_id", async () => {
    const forged = { name: "forged", service: "", data_shared: "[]", location: "india" as const, contract_status: "none" as const, contract_date: null, security_clause: 0, review_at: null, erasure_contact: "", created_at: "x", updated_at: "x", org_id: b.orgId };
    await a.t.insertInto("vendors", forged as never);
    expect((await listVendors(b.t)).some((v) => v.name === "forged")).toBe(false);
    expect((await listVendors(a.t)).some((v) => v.name === "forged")).toBe(true);
  });

  it("T-ISO-10 consent records: another organisation's site, events, state and chain are invisible and unwritable", async () => {
    setMasterKeyForTests(Buffer.alloc(32, 9));
    const bSite = (await getSite(b.t, bIds.site))!;
    const sid = "isolation-subject-000001";
    const ok = await recordConsent(b.t, bSite, { subjectRef: sid, choices: { analytics: true }, lang: "en", channel: "banner", noticeVersion: 1 });
    expect(ok.ok).toBe(true);
    // A's TenantDb with B's site: refused outright.
    await expect(recordConsent(a.t, bSite, { subjectRef: sid, choices: { analytics: false }, lang: "en", channel: "banner", noticeVersion: 1 })).rejects.toThrow();
    await expect(withdrawAll(a.t, bSite, sid, { channel: "link", lang: "en" })).rejects.toThrow();
    await expect(buildSiteConfig(a.t, bSite, BASE_URL)).rejects.toThrow();
    // Reads by B's site id through A's TenantDb return nothing.
    expect((await listConsentEvents(a.t, bSite.id)).rows).toEqual([]);
    expect(await getConsentState(a.t, bSite.id, sid)).toEqual([]);
    expect((await verifySiteChain(a.t, bSite.id)).count).toBe(0);
    expect(await consentLogCsv(a.t, bSite.id)).not.toContain(sid);
    // B's own view is intact.
    expect((await listConsentEvents(b.t, bSite.id)).total).toBe(1);
    expect((await verifySiteChain(b.t, bSite.id)).ok).toBe(true);
    expect((await getConsentState(b.t, bSite.id, sid))[0].status).toBe("granted");
    setMasterKeyForTests(null);
  });

  it("T-ISO-09 rejects invalid organisation ids", () => {
    expect(() => tenantDb(db, 0)).toThrow();
    expect(() => tenantDb(db, Number.NaN)).toThrow();
  });
});

/**
 * T-ISO-11: rights requests, their events, attachments, nominations and the
 * mail log are invisible and unwritable across organisations; the public
 * verification token of one organisation's request does nothing in another.
 */
describe("T-ISO-11 tenant isolation: rights requests", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let a: Awaited<ReturnType<typeof createReadyOrg>>;
  let b: Awaited<ReturnType<typeof createReadyOrg>>;
  let tmp: string;
  const outbox: MailMessage[] = [];
  const PDF = Buffer.from("%PDF-1.4\n%b-only\n");

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wpk-iso-"));
    process.env.STORAGE_DIR = tmp;
    setMasterKeyForTests(Buffer.alloc(32, 11));
    setMailTransport(async (m) => {
      outbox.push(m);
    });
    db = await createTestDb();
    a = await createReadyOrg(db, "a@clinic.test", "Clinic A", "clinic");
    b = await createReadyOrg(db, "b@store.test", "Store B", "d2c");
  });
  afterAll(async () => {
    setMailTransport(null);
    setMasterKeyForTests(null);
    delete process.env.STORAGE_DIR;
    await db.destroy();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("another organisation's request ids are never found, changed or verified", async () => {
    const s = await submitRequest(
      b.t,
      { type: "nomination", name: "Bina Rao", email: "bina@example.in", details: "", identifiers: {}, nominee: { name: "Kiran Rao", relation: "Sister", contact: "kiran@example.in" }, lang: "en", ip: "192.0.2.10", files: [{ name: "proof.pdf", size: PDF.length, bytes: PDF }] },
      { baseUrl: BASE_URL },
    );
    if (!s.ok) throw new Error(s.error);
    const code = outbox.find((m) => m.to === "bina@example.in")!.text.match(/is: (\d{6})/)![1];
    // A's TenantDb with B's id and the right code: not found, and B's request stays unverified.
    expect(await verifyRequest(a.t, s.requestId, code, { baseUrl: BASE_URL })).toEqual({ ok: false, error: "invalid" });
    expect(await resendCode(a.t, s.requestId, { baseUrl: BASE_URL })).toEqual({ ok: false, error: "invalid" });
    expect((await getRequest(b.t, s.requestId))!.status).toBe("unverified");
    expect((await verifyRequest(b.t, s.requestId, code, { baseUrl: BASE_URL })).ok).toBe(true);
    expect(await recordNomination(b.t, s.requestId, b.userId)).toEqual({ ok: true });
    const [attachment] = await listAttachments(b.t, s.requestId);
    const [nomination] = await listNominations(b.t);

    expect(await getRequest(a.t, s.requestId)).toBeUndefined();
    expect(await getDecrypted(a.t, s.requestId)).toBeNull();
    expect((await listRequests(a.t, { status: "all" })).total).toBe(0);
    expect(await rightsStats(a.t)).toEqual({ open: 0, overdue: 0, dueSoon: 0, unverified: 0 });
    expect(await listRequestEvents(a.t, s.requestId)).toEqual([]);
    expect(await listAttachments(a.t, s.requestId)).toEqual([]);
    expect(await readAttachment(a.t, attachment.id)).toBeNull();
    expect(await listNominations(a.t)).toEqual([]);
    expect(await listMailLog(a.t, { requestId: s.requestId })).toEqual([]);
    expect(await buildReply(a.t, s.requestId, "access", BASE_URL)).toBeNull();
    for (const r of [
      await changeStatus(a.t, s.requestId, "in_progress", a.userId),
      await assignRequest(a.t, s.requestId, a.userId, a.userId),
      await addNote(a.t, s.requestId, "note", "x", a.userId),
      await sendReply(a.t, s.requestId, { subject: "x", text: "y" }, a.userId),
      await closeRequest(a.t, s.requestId, { outcome: "completed", letter: null }, a.userId),
      await recordNomination(a.t, s.requestId, a.userId),
      await revokeNomination(a.t, nomination.id, a.userId),
    ])
      expect(r).toEqual({ ok: false, error: "not_found" });

    // B's view is intact.
    const row = (await getRequest(b.t, s.requestId))!;
    expect(row.status).toBe("new");
    expect(row.assignee_user_id).toBeNull();
    expect((await listNominations(b.t))[0].status).toBe("active");
    expect((await readAttachment(b.t, attachment.id))?.bytes.equals(PDF)).toBe(true);
    // The same email is a different lookup value in each organisation.
    expect(row.email_hmac).not.toBe(identifierHmac(a.orgId, "email", "bina@example.in"));
    // Members of A cannot be assigned in B.
    expect(await assignRequest(b.t, s.requestId, a.userId, b.userId)).toEqual({ ok: false, error: "assignee" });
  });

  it("every new tenant table is scoped by org_id (generic check) and the reminder job only mails each organisation's own people", async () => {
    for (const table of ["rights_requests", "request_events", "request_attachments", "nominations", "mail_log"] as const) {
      expect((await b.t.selectFrom(table).selectAll().execute()).length).toBeGreaterThan(0);
      expect(await a.t.selectFrom(table).selectAll().execute()).toEqual([]);
    }
    const before = outbox.length;
    const due = Date.parse((await listRequests(b.t, { status: "open" })).rows[0].due_at);
    const result = await runRightsReminders(db, { baseUrl: BASE_URL, now: new Date(due - 2 * 86_400_000) });
    expect(result).toEqual({ orgs: 1, sent: 1 });
    expect(outbox.slice(before).map((m) => m.to)).toEqual(["b@store.test"]);
  });
});

describe("T-ISO-12 tenant isolation: P5 breach register", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let a: Awaited<ReturnType<typeof createReadyOrg>>;
  let b: Awaited<ReturnType<typeof createReadyOrg>>;
  const outbox: MailMessage[] = [];

  beforeAll(async () => {
    setMasterKeyForTests(Buffer.alloc(32, 12));
    setMailTransport(async (m) => {
      outbox.push(m);
    });
    db = await createTestDb();
    a = await createReadyOrg(db, "a@clinic.test", "Clinic A", "clinic");
    b = await createReadyOrg(db, "b@store.test", "Store B", "d2c");
  });
  afterAll(async () => {
    setMailTransport(null);
    setMasterKeyForTests(null);
    await db.destroy();
  });

  it("another organisation's incidents, timeline and recipients are never found or changed", async () => {
    const H = 3_600_000;
    const r = await createBreach(b.t, { title: "B's incident", noticedAt: new Date(Date.now() - 2 * H).toISOString(), awareAt: new Date(Date.now() - 2 * H).toISOString(), affectedCount: 2, certinApplicable: true, details: { nature: "B only" } }, b.userId);
    if (!r.ok) throw new Error(r.error);
    await addRecipients(b.t, r.id, "victim@example.in");
    await addEvidenceNote(b.t, r.id, "B evidence", b.userId);
    expect(await getBreach(a.t, r.id)).toBeUndefined();
    expect(await listBreaches(a.t, { status: "all" })).toEqual([]);
    expect(await listBreachEvents(a.t, r.id)).toEqual([]);
    expect(await listRecipients(a.t, r.id)).toEqual([]);
    expect(await breachTemplates(a.t, r.id, "en")).toBeNull();
    expect(await recipientsCsv(a.t, r.id, { subject: "", text: "", sms: "" })).toBeNull();
    expect(await breachAlerts(a.t)).toEqual([]);
    expect(await breachRegisterCsv(a.t)).not.toContain(r.ref);
    for (const result of [
      await updateBreach(a.t, r.id, { title: "hijack", noticedAt: new Date().toISOString(), awareAt: new Date().toISOString(), affectedCount: 0, certinApplicable: false, details: {} }, a.userId),
      await markStep(a.t, r.id, "certin", new Date().toISOString(), a.userId),
      await setBreachStatus(a.t, r.id, "closed", a.userId),
      await toggleChecklist(a.t, r.id, "contain", true, a.userId),
      await addEvidenceNote(a.t, r.id, "x", a.userId),
      await addRecipients(a.t, r.id, "x@example.in"),
      await emailIntimation(a.t, r.id, { subject: "x", text: "x".repeat(40) }, a.userId),
      await markRecipientsManual(a.t, r.id, "sms", new Date().toISOString(), a.userId),
      await recordExtension(a.t, r.id, { requestedAt: null, until: null, reason: "" }, a.userId),
    ]) {
      expect(result).toEqual({ ok: false, error: "not_found" });
    }
    const row = (await getBreach(b.t, r.id))!;
    expect(row).toMatchObject({ title: "B's incident", status: "open", certin_sent_at: null });
    for (const table of ["breaches", "breach_events", "breach_recipients"] as const) {
      expect((await b.t.selectFrom(table).selectAll().execute()).length).toBeGreaterThan(0);
      expect(await a.t.selectFrom(table).selectAll().execute()).toEqual([]);
    }
    const before = outbox.length;
    await runBreachReminders(db, { baseUrl: BASE_URL });
    expect(outbox.slice(before).every((m) => m.to === "b@store.test")).toBe(true);
    expect(outbox.length).toBeGreaterThan(before);
  });
});

describe("T-ISO-13 tenant isolation: P5 retention, erasure tasks and purge checkpoints", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let a: Awaited<ReturnType<typeof createReadyOrg>>;
  let b: Awaited<ReturnType<typeof createReadyOrg>>;

  beforeAll(async () => {
    setMasterKeyForTests(Buffer.alloc(32, 13));
    setMailTransport(async () => undefined);
    db = await createTestDb();
    a = await createReadyOrg(db, "a@clinic.test", "Clinic A", "clinic");
    b = await createReadyOrg(db, "b@store.test", "Store B", "d2c");
  });
  afterAll(async () => {
    setMailTransport(null);
    setMasterKeyForTests(null);
    await db.destroy();
  });

  it("another organisation's tasks, sites and settings are never found or changed", async () => {
    await ensureRuleTasks(b.t);
    const bTask = (await listTasks(b.t, { status: "open" }))[0];
    expect(bTask).toBeTruthy();
    expect(await getTask(a.t, bTask.id)).toBeUndefined();
    expect((await listTasks(a.t, { status: "all" })).some((x) => x.id === bTask.id)).toBe(false);
    expect(await signOffTask(a.t, bTask.id, { status: "skipped", note: "hijack" }, a.userId)).toEqual({ ok: false, error: "not_found" });
    expect(await markPreNoticeSent(a.t, bTask.id, new Date().toISOString(), a.userId)).toEqual({ ok: false, error: "not_found" });
    expect(await reopenTask(a.t, bTask.id, a.userId)).toBe(false);
    expect(await erasureTasksCsv(a.t)).not.toContain(bTask.title);
    const bSite = await createSite(b.t, { name: "B", domain: "b.example.in", allowedOrigins: [], childrenMode: false });
    expect(await setSiteArchived(a.t, bSite, true)).toBe(false);
    expect(await siteRetentionStatus(a.t, bSite)).toBeNull();
    expect(await deleteSiteAfterRetention(a.t, bSite, a.userId)).toEqual({ ok: false, error: "not_found" });
    expect((await getSite(b.t, bSite))?.archived_at).toBeNull();
    const bReq = await submitRequest(b.t, { type: "erasure", name: "Bina Rao", email: "bina@example.in", details: "erase", identifiers: {}, lang: "en", ip: "192.0.2.77" }, { baseUrl: BASE_URL });
    if (!bReq.ok) throw new Error(bReq.error);
    expect(await createRequestErasureTasks(a.t, bReq.requestId, a.userId)).toEqual({ ok: false, error: "not_found" });
    await updateRetentionSettings(a.t, { consentRetentionDays: 900, preErasureNotice: true });
    expect((await b.t.org())).toMatchObject({ consent_retention_days: 1095, pre_erasure_notice: 0 });
    expect((await getTask(b.t, bTask.id))?.status).toBe("open");
    for (const table of ["erasure_tasks", "consent_purge_checkpoints"] as const) {
      expect((await a.t.selectFrom(table).selectAll().execute()).every((r) => r.org_id === a.orgId)).toBe(true);
    }
  });
});

