import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setMailTransport } from "@/lib/mail";
import { createBreach } from "@/lib/privacy/breaches";
import { consentLogCsv, recordConsent } from "@/lib/privacy/consent";
import { buildProofJson, purposesCsv, requestsRegisterCsv, vendorsCsv } from "@/lib/privacy/exports";
import { publishNotice } from "@/lib/privacy/notices";
import { createSite, createVendor, getSite } from "@/lib/privacy/registers";
import { ensureRuleTasks } from "@/lib/privacy/retention";
import { submitRequest } from "@/lib/privacy/rights";
import { setMasterKeyForTests } from "@/lib/secrets";
import { createTestDb } from "./helpers/db";
import { BASE_URL, createReadyOrg } from "./helpers/fixtures";

/** M13 exports (C3-04): register CSVs, consent log CSV with the chain head, JSON proof (notice hashes + chain report). */
describe("exports: registers and proof JSON", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let a: Awaited<ReturnType<typeof createReadyOrg>>;
  let b: Awaited<ReturnType<typeof createReadyOrg>>;
  let bRef = "";

  beforeAll(async () => {
    setMasterKeyForTests(Buffer.alloc(32, 41));
    setMailTransport(async () => undefined);
    db = await createTestDb();
    a = await createReadyOrg(db, "a@clinic.test", "Clinic A", "clinic");
    b = await createReadyOrg(db, "b@store.test", "Store B", "d2c");
    for (const o of [a, b]) expect((await publishNotice(o.t, { baseUrl: BASE_URL, userId: o.userId })).ok).toBe(true);
    const site = (await getSite(a.t, await createSite(a.t, { name: "Clinic", domain: "clinic-a.example.in", allowedOrigins: [], childrenMode: false })))!;
    await recordConsent(a.t, site, { subjectRef: "visitor-000000000001", choices: { analytics: true, marketing_whatsapp: false }, lang: "hi", channel: "banner", noticeVersion: 1 });
    await createVendor(a.t, { name: "Clinic software", service: "Records", dataShared: ["name"], location: "india", contractStatus: "signed", contractDate: "2026-01-01", securityClause: true, reviewAt: null, erasureContact: "" });
    await submitRequest(a.t, { type: "access", name: "Asha Verma", email: "asha@example.in", details: "copy please", identifiers: {}, lang: "en", ip: "198.51.100.1" }, { baseUrl: BASE_URL });
    await createBreach(a.t, { title: "Lost laptop", noticedAt: new Date(Date.now() - 3_600_000).toISOString(), awareAt: new Date(Date.now() - 3_600_000).toISOString(), affectedCount: 4, certinApplicable: true, details: { nature: "Lost laptop" } }, a.userId);
    await ensureRuleTasks(a.t);
    await createSite(b.t, { name: "B", domain: "store-b.example.in", allowedOrigins: [], childrenMode: false });
    const br = await createBreach(b.t, { title: "B secret incident", noticedAt: new Date().toISOString(), awareAt: new Date().toISOString(), affectedCount: 1, certinApplicable: false, details: {} }, b.userId);
    if (br.ok) bRef = br.ref;
  });
  afterAll(async () => {
    setMailTransport(null);
    setMasterKeyForTests(null);
    await db.destroy();
  });

  it("C3-04 the proof JSON holds every notice version with a verified hash and each site's chain report; the consent CSV carries the chain head", async () => {
    const proof = JSON.parse(await buildProofJson(a.t));
    expect(proof.note).toMatch(/Not legal advice/);
    expect(proof.notices.map((n: { lang: string }) => n.lang).sort()).toEqual(["en", "hi"]);
    for (const n of proof.notices) expect(n).toMatchObject({ version: 1, sha256_matches_body: true, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(proof.consent_chains.sites[0]).toMatchObject({ ok: true, events_verified: 2, domain: "clinic-a.example.in" });
    const site = await a.t.selectFrom("sites").select("id").executeTakeFirstOrThrow();
    expect(await consentLogCsv(a.t, site.id)).toContain("# chain_ok,true");
    expect((await vendorsCsv(a.t)).split("\r\n")[1]).toContain("Clinic software");
    expect(await purposesCsv(a.t)).toContain("analytics");
  });

  it("registers mask contacts; exports never contain another organisation's data", async () => {
    const csv = await requestsRegisterCsv(a.t);
    expect(csv).not.toContain("asha@example.in");
    expect(csv).toMatch(/a\*+@example\.in|as\*+/);
    const all = [csv, await vendorsCsv(a.t), await purposesCsv(a.t), await buildProofJson(a.t)].join("\n");
    expect(all).not.toContain("store-b.example.in");
    expect(all).not.toContain("B secret incident");
    expect(bRef).not.toBe("");
    expect(all).not.toContain(bRef);
  });
});
