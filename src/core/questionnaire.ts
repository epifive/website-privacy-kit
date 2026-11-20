import { z } from "zod";
import { clampResponseDays } from "./notice/render";
import { IDENTIFIER_KEYS } from "./notice/templates";
import { SECTORS } from "./presets";

/**
 * Notice questionnaire (plan M1). Each step is validated on its own so the
 * wizard can save progress; `deriveFlags` turns answers into product flags.
 */

/** Third Schedule classes (Rule 8(1)): fixed erasure periods apply only to these. */
export const THIRD_SCHEDULE = ["none", "ecommerce_2cr", "gaming_50l", "social_2cr"] as const;
export type ThirdScheduleClass = (typeof THIRD_SCHEDULE)[number];

const text = (max: number) => z.string().trim().max(max);

export const businessStep = z.object({
  name: text(120).min(1),
  legal_name: text(160).min(1),
  sector: z.enum(SECTORS),
  goods_services_en: text(400).min(1),
  goods_services_hi: text(400).min(1),
  website_url: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https?:\/\/[^\s]+$/i.test(v), "url"),
  third_schedule: z.enum(THIRD_SCHEDULE),
  is_sdf: z.boolean(),
});

const contactShape = z.object({
  name: text(120),
  designation: text(120),
  email: z.union([z.literal(""), z.string().trim().email().max(190)]),
  phone: text(40),
  address: text(400),
});

export const contactStep = z
  .object({ grievance: contactShape, dpo_same: z.boolean(), dpo: contactShape })
  .refine((v) => v.grievance.name && (v.grievance.email || v.grievance.phone), { message: "grievance", path: ["grievance"] });

export const rightsStep = z.object({
  response_days: z.preprocess((v) => clampResponseDays(v), z.number().int().min(1).max(90)),
  identifiers: z.array(z.string()).transform((ids) => ids.filter((id) => IDENTIFIER_KEYS.includes(id))).pipe(z.array(z.string()).min(1)),
  children_mode: z.boolean(),
});

export type BusinessAnswers = z.infer<typeof businessStep>;
export type ContactAnswers = z.infer<typeof contactStep>;
export type RightsAnswers = z.infer<typeof rightsStep>;

export interface QuestionnaireFlags {
  /** Rule 8(1)–(2): fixed erasure periods and the 48 h notice are mandatory. */
  thirdSchedule: boolean;
  /** SDF duties are out of scope (plan X1): show a "talk to your lawyer" notice. */
  sdfOutOfScope: boolean;
}

export function deriveFlags(b: Pick<BusinessAnswers, "third_schedule" | "is_sdf">): QuestionnaireFlags {
  return { thirdSchedule: b.third_schedule !== "none", sdfOutOfScope: b.is_sdf };
}
