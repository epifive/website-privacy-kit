import { describe, expect, it } from "vitest";
import { seedDemoData } from "@/lib/db/demo-seed";
import { tenantDb } from "@/lib/db/tenant";
import { verifySiteChain } from "@/lib/privacy/consent";
import { listNoticeVersions } from "@/lib/privacy/notices";
import { createTestDb } from "./helpers/db";

describe("DEMO_SEED", () => {
  it("seeds a demo clinic with a published EN + HI notice, once", async () => {
    const db = await createTestDb();
    const ts = new Date().toISOString();
    await db.insertInto("users").values({ name: "Admin", email: "admin@demo.test", password_hash: "x", role: "admin", status: "active", created_at: ts, updated_at: ts }).execute();
    await seedDemoData(db);
    await seedDemoData(db);
    const orgs = await db.selectFrom("orgs").selectAll().orderBy("id").execute();
    expect(orgs.map((o) => o.name)).toEqual(["Sharma Physio Clinic"]);
    expect(await db.selectFrom("sites").select("id").execute()).toHaveLength(1);
    const versions = await listNoticeVersions(tenantDb(db, orgs[0].id));
    expect(versions).toHaveLength(1);
    expect(versions[0].langs.map((l) => l.lang).sort()).toEqual(["en", "hi"]);
    // P5: the demo inbox and breach register are not empty.
    const t = tenantDb(db, orgs[0].id);
    const requests = await t.selectFrom("rights_requests").select(["type", "status"]).execute();
    expect(requests.map((r) => r.type).sort()).toEqual(["access", "correction", "erasure", "grievance"]);
    expect(requests.every((r) => r.status !== "unverified")).toBe(true);
    const breaches = await t.selectFrom("breaches").selectAll().execute();
    expect(breaches).toHaveLength(1);
    expect(breaches[0]).toMatchObject({ status: "contained", certin_applicable: 0 });
    expect(breaches[0].board_initial_sent_at).toBeTruthy();
    expect((await t.selectFrom("erasure_tasks").select("id").execute()).length).toBeGreaterThan(0);
    // Weeks of consent history on the website (banner EN/HI, form, withdrawals).
    for (const org of orgs) {
      const tt = tenantDb(db, org.id);
      const site = (await tt.selectFrom("sites").selectAll().executeTakeFirstOrThrow());
      const events = await tt.selectFrom("consent_events").select(["action", "channel", "lang", "created_at"]).execute();
      expect(events.length, org.name).toBeGreaterThan(200);
      expect(new Set(events.map((e) => e.action))).toEqual(new Set(["grant", "deny", "withdraw"]));
      expect(new Set(events.map((e) => e.channel))).toEqual(new Set(["banner", "form"]));
      expect(new Set(events.map((e) => e.lang))).toEqual(new Set(["en", "hi"]));
      expect(events.some((e) => e.created_at < new Date(Date.now() - 30 * 86_400_000).toISOString())).toBe(true);
      expect((await verifySiteChain(tt, site.id)).ok).toBe(true);
      expect((await listNoticeVersions(tt))[0].langs).toHaveLength(2);
      expect((await tt.selectFrom("rights_requests").select("id").execute()).length).toBe(4);
    }
    await db.destroy();
  }, 300_000); // MySQL over the network: ~2,000 consent events through recordConsent
});
