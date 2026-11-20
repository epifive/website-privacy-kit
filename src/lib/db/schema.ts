import type { Generated, Insertable, Selectable, Updateable } from "kysely";

/**
 * Database schema shared by the MySQL and SQLite drivers.
 *
 * Portability rules used across the project:
 * - booleans are stored as 0 / 1 integers
 * - timestamps are ISO-8601 strings (see `now()` in ./index.ts)
 * - money is stored in the smallest currency unit (cents)
 */

export interface SettingsTable {
  key: string;
  value: string | null;
}

export interface UsersTable {
  id: Generated<number>;
  name: string;
  email: string;
  password_hash: string;
  role: "user" | "admin";
  status: "active" | "banned";
  /** TOTP secret (base32), encrypted with the platform key; null = 2FA off. */
  totp_secret_enc: Generated<string | null>;
  totp_enabled_at: Generated<string | null>;
  /** Last accepted TOTP time step (a code can't be used twice). */
  totp_last_step: Generated<number>;
  /** JSON array of keyed hashes of unused recovery codes. */
  recovery_codes: Generated<string | null>;
  failed_logins: Generated<number>;
  locked_until: Generated<string | null>;
  password_changed_at: Generated<string | null>;
  created_at: string;
  updated_at: string;
}

export interface SessionsTable {
  id: string;
  user_id: number;
  expires_at: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  /** Last request (idle timeout); updated at most every 5 minutes. */
  last_seen_at: Generated<string | null>;
  /** 1 when the session was created after a second factor. */
  mfa: Generated<number>;
}

export interface PasswordResetsTable {
  token_hash: string;
  user_id: number;
  expires_at: string;
  created_at: string;
}

export interface UsageCountersTable {
  org_id: number;
  /** "YYYY-MM" in IST. */
  period: string;
  consent_events: number;
  /** Grants refused because the monthly limit (plus grace) was used up. */
  refused_events: number;
  rights_requests: number;
  /** Highest usage alert already sent this month: 0, 80, 100 or 120 (percent). */
  alert_level: number;
}

export interface MailSuppressionsTable {
  email_hmac: string;
  email_masked: string;
  reason: "bounce" | "complaint" | "manual";
  detail: string;
  created_at: string;
}

export interface LanguagesTable {
  code: string;
  name: string;
  native_name: string;
  direction: "ltr" | "rtl";
  is_active: number;
  sort_order: number;
}

export interface TranslationsTable {
  lang: string;
  key: string;
  value: string;
}


// ── Privacy kit (tenant tables: every row carries org_id) ──

export type OrgRole = "owner" | "admin" | "viewer";
export type PurposeBasis = "consent" | "s7a_voluntary" | "s7_other" | "necessary";

export interface OrgsTable {
  id: Generated<number>;
  slug: string;
  name: string;
  legal_name: string;
  sector: string;
  goods_services_en: string;
  goods_services_hi: string;
  website_url: string;
  /** Days to respond to rights requests (default 30, max 90). */
  response_days: number;
  /** JSON array of identifier keys asked for in rights requests (Rule 14(5)). */
  identifiers: string;
  /** Optional shorter internal target for rights requests (0 = off; always below response_days). */
  internal_target_days: Generated<number>;
  /** How long consent records are kept after the event (default 1095, min 365 — Rule 8(3)); used by the purge job. */
  consent_retention_days: Generated<number>;
  /** Optional pre-erasure notice (Rule 8(2) for Third Schedule classes; good practice for others). Off by default. */
  pre_erasure_notice: Generated<number>;
  /** JSON array of request types ("access", "erasure") that must include a description. */
  details_required: Generated<string>;
  children_mode: number;
  third_schedule: string;
  status: "active" | "suspended";
  region: string;
  owner_user_id: number;
  created_at: string;
  updated_at: string;
  /** Last daily chain-head digest email (plan §7.4). */
  chain_digest_at: Generated<string | null>;
}

export interface MembershipsTable {
  org_id: number;
  user_id: number;
  role: OrgRole;
  created_at: string;
}

export interface SitesTable {
  id: Generated<number>;
  org_id: number;
  name: string;
  domain: string;
  public_key: string;
  /** JSON array of extra allowed origins (https://host). */
  allowed_origins: string;
  children_mode: number;
  theme_json: string;
  /** Archived sites stop collecting consent; records stay until their retention ends. */
  archived_at: Generated<string | null>;
  created_at: string;
  updated_at: string;
}

export interface ContactsTable {
  id: Generated<number>;
  org_id: number;
  kind: "grievance" | "dpo_or_authorised";
  name: string;
  designation: string;
  email: string;
  phone: string;
  address: string;
  created_at: string;
  updated_at: string;
}

export interface PurposesTable {
  id: Generated<number>;
  org_id: number;
  /** Null = applies to every site of the organisation. */
  site_id: number | null;
  purpose_key: string;
  name_en: string;
  name_hi: string;
  desc_en: string;
  desc_hi: string;
  basis: PurposeBasis;
  /** JSON: DataItem[] (see src/core/data-items.ts). */
  data_items: string;
  /** JSON: vendor ids of the same organisation. */
  vendor_ids: string;
  retention_rule_id: number | null;
  is_tracking: number;
  active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface VendorsTable {
  id: Generated<number>;
  org_id: number;
  name: string;
  service: string;
  /** JSON array of data item keys or labels. */
  data_shared: string;
  location: "india" | "abroad";
  contract_status: "none" | "pending" | "signed";
  contract_date: string | null;
  security_clause: number;
  review_at: string | null;
  erasure_contact: string;
  created_at: string;
  updated_at: string;
}

export interface RetentionRulesTable {
  id: Generated<number>;
  org_id: number;
  category: string;
  category_hi: string;
  law_ref: string;
  /** 0 = until consent is withdrawn. */
  period_days: number;
  trigger: string;
  action: string;
  pre_notice_hours: number | null;
  is_logs: number;
  created_at: string;
  updated_at: string;
}

/** Immutable: a database trigger rejects UPDATE (see migration 000003). */
export interface NoticeVersionsTable {
  id: Generated<number>;
  org_id: number;
  site_id: number | null;
  version: number;
  lang: "en" | "hi";
  title: string;
  body_md: string;
  sha256: string;
  template_version: string;
  published_at: string;
  published_by: number | null;
}

export interface QuestionnairesTable {
  org_id: number;
  /** JSON of the raw wizard answers. */
  answers: string;
  completed_at: string | null;
  updated_at: string;
}

/** Insert-only. */
export interface AuditLogTable {
  id: Generated<number>;
  org_id: number;
  user_id: number | null;
  action: string;
  target: string;
  ip_trunc: Generated<string>;
  created_at: string;
}

/** Platform audit log: sign-in, 2FA, passwords, sessions, administrator actions. Insert-only. */
export interface SecurityEventsTable {
  id: Generated<number>;
  /** The account the event is about. */
  user_id: number | null;
  /** Who did it (an administrator acting on another account), when different. */
  actor_id: number | null;
  action: string;
  target: string;
  ip_trunc: string;
  ua_family: string;
  created_at: string;
}

export interface OrgKeysTable {
  /** 0 = platform root key. */
  org_id: number;
  version: number;
  wrapped_key: string;
  /** Fingerprint of the key-encryption key that wrapped it. */
  kek_id: string;
  created_at: string;
}

export type ConsentAction = "grant" | "deny" | "withdraw";
export type ConsentChannel = "banner" | "form" | "hosted_page" | "link" | "api" | "import";
export type SubjectKind = "browser" | "email" | "phone" | "external";

/** Insert-only (triggers reject UPDATE/DELETE); hash-chained per site (see src/core/consent/chain.ts). */
export interface ConsentEventsTable {
  id: Generated<number>;
  org_id: number;
  site_id: number;
  /** 1, 2, 3 … per site; no gaps. */
  seq: number;
  /** Random browser id (banner) or a pseudonymous id derived from the subject's identifier (form). */
  subject_ref: string;
  subject_kind: SubjectKind;
  /** HMAC-SHA256 of the normalised email/phone, for lookups; null for browser subjects. */
  subject_lookup_hmac: string | null;
  /** AES-256-GCM ciphertext of the email/phone; null for browser subjects. */
  subject_enc: string | null;
  purpose_key: string;
  action: ConsentAction;
  notice_version: number;
  notice_version_id: number | null;
  lang: "en" | "hi";
  channel: ConsentChannel;
  page_url: string;
  ip_trunc: string;
  ua_family: string;
  widget_ver: string;
  created_at: string;
  prev_hash: string;
  hash: string;
}

export interface ConsentStateTable {
  org_id: number;
  site_id: number;
  subject_ref: string;
  purpose_key: string;
  status: "granted" | "denied" | "withdrawn";
  notice_version: number;
  last_event_id: number;
  updated_at: string;
}

export interface ConsentChainHeadsTable {
  site_id: number;
  org_id: number;
  seq: number;
  hash: string;
  updated_at: string;
}

export type RightsRequestType = "access" | "correction" | "erasure" | "nomination" | "grievance" | "withdraw";
export type RightsRequestStatus = "unverified" | "new" | "in_progress" | "waiting" | "closed";

/** Data Principal requests (plan M7). Personal fields are AES-256-GCM ciphertext (per-org key). */
export interface RightsRequestsTable {
  id: Generated<number>;
  org_id: number;
  /** Public reference such as R-7KQ2-M9XP. */
  ref: string;
  type: RightsRequestType;
  status: RightsRequestStatus;
  outcome: string | null;
  lang: "en" | "hi";
  requester_name_enc: string;
  email_enc: string;
  /** HMAC-SHA256 of the normalised email (per organisation). */
  email_hmac: string;
  /** Encrypted JSON: { details, identifiers, nominee }. */
  payload_enc: string;
  /** HMAC of the one-time code; never the code itself. */
  otp_hash: string | null;
  otp_expires_at: string | null;
  otp_attempts: number;
  otp_sends: number;
  otp_last_sent_at: string | null;
  verified_at: string | null;
  received_at: string;
  /** received_at + response period (max 90 days). */
  due_at: string;
  target_at: string | null;
  closed_at: string | null;
  assignee_user_id: number | null;
  legal_hold_reason: string;
  reminded_t7_at: string | null;
  reminded_t1_at: string | null;
  reminded_overdue_at: string | null;
  ip_trunc: string;
  created_at: string;
  updated_at: string;
}

export interface RequestEventsTable {
  id: Generated<number>;
  org_id: number;
  request_id: number;
  kind: string;
  /** Non-personal detail, e.g. "new→in_progress". */
  meta: string;
  /** Encrypted note or reply text. */
  body_enc: string | null;
  by_user_id: number | null;
  created_at: string;
}

export interface RequestAttachmentsTable {
  id: Generated<number>;
  org_id: number;
  request_id: number;
  filename: string;
  mime: string;
  size: number;
  /** SHA-256 of the original file. */
  sha256: string;
  /** File name under storage/rights/{org_id}/ (encrypted bytes). */
  storage_key: string;
  created_at: string;
}

export interface NominationsTable {
  id: Generated<number>;
  org_id: number;
  request_id: number | null;
  principal_email_hmac: string;
  principal_name_enc: string;
  nominee_name_enc: string;
  nominee_relation: string;
  nominee_contact_enc: string;
  status: "active" | "revoked";
  recorded_at: string;
  recorded_by: number | null;
  revoked_at: string | null;
}

/** Every email sent for an organisation (no bodies; recipient masked + HMAC). */
export interface MailLogTable {
  id: Generated<number>;
  org_id: number;
  request_id: number | null;
  kind: string;
  to_masked: string;
  to_hmac: string;
  subject: string;
  status: "sent" | "failed" | "skipped";
  provider: string;
  error: string;
  created_at: string;
}

/** Personal data breach register (plan M8; B1–B4). Times are UTC ISO strings. */
export interface BreachesTable {
  id: Generated<number>;
  org_id: number;
  /** Public reference such as B-7KQ2-M9XP. */
  ref: string;
  title: string;
  status: "open" | "contained" | "closed";
  /** When the incident was noticed (CERT-In 6 h clock). */
  noticed_at: string;
  /** When the business became aware of the personal data breach (Board 72 h clock; "without delay" clocks). */
  aware_at: string;
  affected_count: number;
  /** JSON: BreachDetails (src/core/breach/templates.ts). */
  details: string;
  certin_applicable: number;
  certin_sent_at: string | null;
  board_initial_sent_at: string | null;
  board_detail_sent_at: string | null;
  /** First intimation to affected Data Principals. */
  dp_notice_sent_at: string | null;
  extension_requested_at: string | null;
  /** Longer period the Board allowed (Rule 7(2)(b)); null = 72 h. */
  extension_until: string | null;
  /** JSON: { checklistKey: doneAtIso }. */
  checklist: string;
  /** JSON: { reminderKind: sentAtIso } (each internal reminder is sent once). */
  reminders: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

/** Insert-only timeline and evidence notes. */
export interface BreachEventsTable {
  id: Generated<number>;
  org_id: number;
  breach_id: number;
  kind: string;
  meta: string;
  /** Encrypted note text (evidence notes may contain personal data). */
  body_enc: string | null;
  /** When it happened (may be earlier than created_at for back-dated steps). */
  at: string;
  by_user_id: number | null;
  created_at: string;
}

export interface BreachRecipientsTable {
  id: Generated<number>;
  org_id: number;
  breach_id: number;
  kind: "email" | "phone";
  contact_enc: string;
  contact_hmac: string;
  status: "pending" | "sent" | "failed" | "manual";
  channel: string;
  sent_at: string | null;
  created_at: string;
}

/** Erasure work items (plan M9; E1–E3): periodic runs per retention rule, and per erasure request (own systems + each processor). */
export interface ErasureTasksTable {
  id: Generated<number>;
  org_id: number;
  source: "rule" | "request";
  rule_id: number | null;
  request_id: number | null;
  vendor_id: number | null;
  title: string;
  is_logs: number;
  /** Erase records collected (or last used) before this time; null for request tasks. */
  cutoff_at: string | null;
  due_at: string;
  pre_notice_at: string | null;
  pre_notice_hours: number | null;
  pre_notice_sent_at: string | null;
  status: "open" | "done" | "skipped";
  signed_off_by: number | null;
  signed_off_at: string | null;
  sign_off_note: string;
  reminded_pre_notice_at: string | null;
  reminded_soon_at: string | null;
  reminded_overdue_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Insert-only tombstones of consent-record purges (see migration 000007). */
export interface ConsentPurgeCheckpointsTable {
  id: Generated<number>;
  org_id: number;
  site_id: number;
  from_seq: number;
  through_seq: number;
  /** Hash of event `through_seq`: verification continues from here. */
  through_hash: string;
  cutoff_at: string;
  purged_count: number;
  reason: "retention" | "site_delete";
  by_user_id: number | null;
  created_at: string;
}

/** Parental consent for an under-18 visitor (plan M10; K1–K2). */
export interface ParentalConsentsTable {
  id: Generated<number>;
  org_id: number;
  site_id: number;
  /** Public reference such as P-7KQ2-M9XP. */
  ref: string;
  /** The child's pseudonymous browser id (widget); no other child data before consent. */
  child_subject_ref: string;
  /** Optional first name or label typed by the child/parent (encrypted). */
  child_label_enc: string | null;
  parent_contact_enc: string;
  parent_contact_hmac: string;
  parent_name_enc: string | null;
  method: "existing_details" | "voluntary_details" | "token" | "offline" | null;
  declared_parent: number;
  declared_adult: number;
  status: "pending" | "pending_review" | "verified" | "declined" | "expired" | "revoked";
  /** JSON array of purpose keys the parent agreed to (never tracking purposes). */
  purposes: string;
  notice_version: number | null;
  notice_version_id: number | null;
  lang: "en" | "hi";
  /** How adulthood was checked (no ID copies), e.g. "year of birth 1984". */
  evidence_note: string;
  /** SHA-256 of the one-time link token; null once used. */
  token_hash: string | null;
  link_expires_at: string | null;
  ip_trunc: string;
  requested_at: string;
  responded_at: string | null;
  verified_at: string | null;
  verified_by: number | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Database {
  settings: SettingsTable;
  users: UsersTable;
  sessions: SessionsTable;
  password_resets: PasswordResetsTable;
  languages: LanguagesTable;
  translations: TranslationsTable;
  usage_counters: UsageCountersTable;
  mail_suppressions: MailSuppressionsTable;
  security_events: SecurityEventsTable;
  org_keys: OrgKeysTable;
  orgs: OrgsTable;
  memberships: MembershipsTable;
  sites: SitesTable;
  contacts: ContactsTable;
  purposes: PurposesTable;
  vendors: VendorsTable;
  retention_rules: RetentionRulesTable;
  notice_versions: NoticeVersionsTable;
  questionnaires: QuestionnairesTable;
  audit_log: AuditLogTable;
  consent_events: ConsentEventsTable;
  consent_state: ConsentStateTable;
  consent_chain_heads: ConsentChainHeadsTable;
  rights_requests: RightsRequestsTable;
  request_events: RequestEventsTable;
  request_attachments: RequestAttachmentsTable;
  nominations: NominationsTable;
  mail_log: MailLogTable;
  breaches: BreachesTable;
  breach_events: BreachEventsTable;
  breach_recipients: BreachRecipientsTable;
  erasure_tasks: ErasureTasksTable;
  consent_purge_checkpoints: ConsentPurgeCheckpointsTable;
  parental_consents: ParentalConsentsTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
export type UsageRow = Selectable<UsageCountersTable>;
export type Language = Selectable<LanguagesTable>;
export type Org = Selectable<OrgsTable>;
export type Site = Selectable<SitesTable>;
export type ContactRow = Selectable<ContactsTable>;
export type PurposeRow = Selectable<PurposesTable>;
export type VendorRow = Selectable<VendorsTable>;
export type RetentionRuleRow = Selectable<RetentionRulesTable>;
export type NoticeVersionRow = Selectable<NoticeVersionsTable>;
export type ConsentEventRow = Selectable<ConsentEventsTable>;
export type ConsentStateRow = Selectable<ConsentStateTable>;
export type RightsRequestRow = Selectable<RightsRequestsTable>;
export type RequestEventRow = Selectable<RequestEventsTable>;
export type RequestAttachmentRow = Selectable<RequestAttachmentsTable>;
export type NominationRow = Selectable<NominationsTable>;
export type MailLogRow = Selectable<MailLogTable>;
export type BreachRow = Selectable<BreachesTable>;
export type BreachEventRow = Selectable<BreachEventsTable>;
export type BreachRecipientRow = Selectable<BreachRecipientsTable>;
export type ErasureTaskRow = Selectable<ErasureTasksTable>;
export type PurgeCheckpointRow = Selectable<ConsentPurgeCheckpointsTable>;
export type ParentalConsentRow = Selectable<ParentalConsentsTable>;
