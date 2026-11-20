/**
 * Children mode (plan M10; requirements K1–K3). Pure rules and texts.
 *
 * - s.2(f): a child is anyone under 18. s.9(1): verifiable consent of the
 *   parent BEFORE processing any personal data of a child.
 * - s.9(3): no tracking, behavioural monitoring or targeted advertising
 *   directed at children — tracking purposes can never be enabled for an
 *   under-18 visitor, not even with a parent's consent (K1-01).
 * - Rule 10(1): due diligence that the parent is an identifiable adult using
 *   (a) reliable identity and age details already held, or (b) details
 *   voluntarily provided, or a virtual token from an authorised entity
 *   (e.g. DigiLocker). The method, time and notice version are logged (K2-01).
 *
 * The Free edition implements the age gate and the s.9(3) block; the parental
 * consent flow (Rule 10) is in the Pro edition.
 * STATUS: DRAFT — PENDING LAWYER REVIEW. Not legal advice.
 */

export const CHILDREN_TEXT_STATUS = "draft-pending-lawyer-review" as const;

/** Words that mark a purpose as tracking, analytics or advertising when the is_tracking flag was not set. */
const TRACKING_WORDS = /analytic|statistic|track|advert|\bads?\b|_ads?\b|^ads?_|remarket|retarget|pixel|personali[sz]|behaviou?r|profil/i;

/** K1-01: purposes that can never be enabled for an under-18 visitor (s.9(3)). */
export function isChildBlockedPurpose(p: { is_tracking?: number | boolean; purpose_key?: string; key?: string; name_en?: string }): boolean {
  if (Number(p.is_tracking ?? 0) === 1 || p.is_tracking === true) return true;
  return TRACKING_WORDS.test(`${p.purpose_key ?? p.key ?? ""} ${p.name_en ?? ""}`);
}

/**
 * Rule 10(2)(a): an adult has completed 18 years. With only a year of birth
 * we accept someone born at least 19 calendar years ago (certainly 18+);
 * anyone else must use another method.
 */
export function adultByYearOfBirth(year: number, now: Date = new Date()): boolean {
  return Number.isInteger(year) && year >= 1900 && now.getUTCFullYear() - year >= 19;
}
