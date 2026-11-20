import "server-only";
import { getPreset, type Sector } from "@/core/presets";
import type { TenantDb } from "../db/tenant";
import { createPurpose, createRetentionRule, createVendor, listPurposes, listRetentionRules, listVendors, purposeKey } from "./registers";
import { jsonArray, nowIso } from "./util";

/**
 * Questionnaire storage and sector presets (plan M1 "sector template").
 * Applying a preset only adds what is missing, so it is safe to run twice and
 * never overwrites a business's own edits.
 */

export type Answers = Record<string, unknown>;

export async function getAnswers(t: TenantDb): Promise<{ answers: Answers; completedAt: string | null }> {
  const row = await t.selectFrom("questionnaires").select(["answers", "completed_at"]).executeTakeFirst();
  let answers: Answers = {};
  try {
    answers = row ? (JSON.parse(row.answers) as Answers) : {};
  } catch {
    answers = {};
  }
  return { answers, completedAt: row?.completed_at ?? null };
}

export async function saveAnswers(t: TenantDb, patch: Answers, complete = false): Promise<void> {
  const { answers } = await getAnswers(t);
  const next = JSON.stringify({ ...answers, ...patch });
  const ts = nowIso();
  const values = { answers: next, updated_at: ts, ...(complete ? { completed_at: ts } : {}) };
  const r = await t.updateTable("questionnaires").set(values).executeTakeFirst();
  if (Number(r.numUpdatedRows) === 0) {
    const exists = await t.selectFrom("questionnaires").select("org_id").executeTakeFirst();
    if (!exists) await t.insertInto("questionnaires", { answers: next, updated_at: ts, completed_at: complete ? ts : null });
  }
}

export interface ApplyPresetResult {
  purposes: number;
  vendors: number;
  retention: number;
}

/** Add the sector's purposes (all, or `onlyKeys`), plus the vendors and retention rules they use. */
export async function applyPreset(t: TenantDb, sector: Sector, onlyKeys?: string[]): Promise<ApplyPresetResult> {
  const preset = getPreset(sector);
  const wanted = preset.purposes.filter((p) => !onlyKeys || onlyKeys.includes(p.key));
  return t.transaction(async (tx) => {
    const result: ApplyPresetResult = { purposes: 0, vendors: 0, retention: 0 };
    const vendors = new Map((await listVendors(tx)).map((v) => [v.name.toLowerCase(), v.id]));
    const rules = new Map((await listRetentionRules(tx)).map((r) => [r.category.toLowerCase(), r.id]));
    const existingKeys = new Set((await listPurposes(tx)).map((p) => p.purpose_key));

    const neededVendors = new Set(wanted.flatMap((p) => p.vendors ?? []));
    for (const v of preset.vendors) {
      if (!neededVendors.has(v.name) || vendors.has(v.name.toLowerCase())) continue;
      const id = await createVendor(tx, {
        name: v.name,
        service: v.service,
        dataShared: v.dataShared,
        location: v.location,
        contractStatus: "none",
        contractDate: null,
        securityClause: false,
        reviewAt: null,
        erasureContact: "",
      });
      vendors.set(v.name.toLowerCase(), id);
      result.vendors++;
    }

    const neededRules = new Set([...wanted.map((p) => p.retention).filter(Boolean), ...preset.retention.filter((r) => r.isLogs).map((r) => r.category)]);
    for (const r of preset.retention) {
      if (!neededRules.has(r.category) || rules.has(r.category.toLowerCase())) continue;
      const created = await createRetentionRule(tx, {
        category: r.category,
        categoryHi: r.categoryHi,
        lawRef: r.lawRef,
        periodDays: r.periodDays,
        trigger: r.trigger,
        action: r.action,
        preNoticeHours: null,
        isLogs: Boolean(r.isLogs),
      });
      if ("id" in created) {
        rules.set(r.category.toLowerCase(), created.id);
        result.retention++;
      }
    }

    let order = existingKeys.size;
    for (const p of wanted) {
      if (existingKeys.has(purposeKey(p.key))) continue;
      await createPurpose(tx, {
        key: p.key,
        nameEn: p.name.en,
        nameHi: p.name.hi,
        descEn: p.description.en,
        descHi: p.description.hi,
        basis: p.basis,
        items: p.items.map((key) => ({ key })),
        vendorIds: (p.vendors ?? []).map((n) => vendors.get(n.toLowerCase())).filter((id): id is number => Boolean(id)),
        retentionRuleId: p.retention ? (rules.get(p.retention.toLowerCase()) ?? null) : null,
        siteId: null,
        isTracking: Boolean(p.isTracking),
        active: true,
        sortOrder: ++order,
      });
      result.purposes++;
    }

    const org = await tx.org();
    if (org) {
      const patch: Parameters<TenantDb["updateOrg"]>[0] = { sector, updated_at: nowIso() };
      if (!org.goods_services_en.trim()) patch.goods_services_en = preset.goodsServices.en;
      if (!org.goods_services_hi.trim()) patch.goods_services_hi = preset.goodsServices.hi;
      if (!jsonArray(org.identifiers).length) patch.identifiers = JSON.stringify(preset.identifiers);
      await tx.updateOrg(patch);
    }
    return result;
  });
}
