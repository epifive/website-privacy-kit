import type { Lang } from "../notice/templates";
import { BOARD_URL, BOARD_URL_VERIFIED } from "../notice/templates";
import { istDateTime } from "./model";

/**
 * Breach intimation texts, from wpk-content/legal-templates/{en,hi}/
 * 07-breach-intimation-data-principal.md and 08-breach-board-report-outline.md.
 *
 * STATUS: DRAFT — PENDING LAWYER REVIEW. Not legal advice.
 *
 * - dpIntimation(): Rule 7(1)(a)–(e) message to each affected Data Principal (B1-01)
 * - boardInitial(): Rule 7(2)(a) "without delay" intimation incl. location (B2)
 * - boardDetailed(): Rule 7(2)(b)(i)–(vi) report within 72 hours (B2-02)
 * - boardExtension(): written request for more time (Rule 7(2)(b))
 * - certinEmail(): CERT-In Directions (ii) report, English (B4-02)
 *
 * UNVERIFIED (19 Nov 2026): the Board's filing channel and form are not yet
 * published. If the Board publishes a form, that form overrides these outlines.
 * Empty facts are shown as "[…]" so staff can see what is still missing.
 */

export const BREACH_TEMPLATE_STATUS = "draft-pending-lawyer-review" as const;
export const CERTIN_EMAIL = "incident@cert-in.org.in";

export interface BreachDetails {
  nature: string;
  extent: string;
  occurredWindow: string;
  location: string;
  categories: string[];
  affectedSystems: string;
  likelyImpact: string;
  consequences: string[];
  measuresTaken: string[];
  measuresPlanned: string[];
  safetySteps: string[];
  rootCause: string;
  findingsPerson: string;
  remediation: string[];
  certinIncidentType: string;
  extensionReason: string;
  signatoryTitle: string;
  processorName: string;
  processorRef: string;
  dpChannels: string;
  dpNotReached: string;
  logFrom: string;
}

export const EMPTY_DETAILS: BreachDetails = {
  nature: "",
  extent: "",
  occurredWindow: "",
  location: "",
  categories: [],
  affectedSystems: "",
  likelyImpact: "",
  consequences: [],
  measuresTaken: [],
  measuresPlanned: [],
  safetySteps: [],
  rootCause: "",
  findingsPerson: "",
  remediation: [],
  certinIncidentType: "",
  extensionReason: "",
  signatoryTitle: "",
  processorName: "",
  processorRef: "",
  dpChannels: "",
  dpNotReached: "",
  logFrom: "",
};

export interface BreachTemplateContext {
  lang: Lang;
  business: string;
  address: string;
  contact: { nameOrTitle: string; email: string; phone: string } | null;
  ref: string;
  noticedAt: string;
  awareAt: string;
  affectedCount: number;
  details: BreachDetails;
  boardInitialSentAt: string | null;
  certinSent: boolean;
  /** Timeline log (newest last) for report item (ii). */
  timeline: Array<{ at: string; event: string }>;
  /** Report item (vi): Data Principal intimations (notified = null when no recipient list was kept in the app). */
  dp: { notified: number | null; firstSentAt: string | null; lastSentAt: string | null };
  /** Board extension request: date asked for. */
  requestedUntil: string | null;
  /** Public page with the full message, for SMS/WhatsApp (optional). */
  noticeUrl?: string;
  now: Date;
}

export interface Email {
  subject: string;
  text: string;
}

const MISSING = "[…]";
const v = (s: string | null | undefined) => (s && s.trim() ? s.trim() : MISSING);
/** A fact followed by a full stop (unless it already ends a sentence). */
const sentence = (s: string | null | undefined, lang: Lang) => {
  const x = v(s);
  return /[.!?।]$/.test(x) ? x : `${x}${lang === "hi" ? "।" : "."}`;
};
const list = (items: string[], prefix = "- ") => (items.filter((i) => i.trim()).length ? items.filter((i) => i.trim()).map((i) => `${prefix}${i.trim()}`).join("\n") : `${prefix}${MISSING}`);
const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

const T = {
  en: {
    draft: "Template status: draft — pending lawyer review. Not legal advice.",
    dpSubject: "Important: a security incident involving your personal data at {business}",
    dear: "Dear customer,",
    dpIntro: "We are writing to tell you about a security incident that affects some of your personal data. We are sorry this happened.",
    a: "1. What happened",
    aText: "{nature}. It happened {window} and we became aware of it on {aware}. {extent}.",
    aItems: "The personal data involved:",
    b: "2. What this could mean for you",
    c: "3. What we have done and are doing",
    done: "Done: ",
    planned: "In progress: ",
    d: "4. What you can do to protect yourself",
    neverAsk: "We will never ask for your OTP, password or card PIN by phone, SMS or WhatsApp.",
    e: "5. Who to contact",
    email: "Email",
    phone: "Phone",
    reference: "Reference",
    informed: "We have also informed the Data Protection Board of India{certin}, as the law requires.",
    informedCertin: " and CERT-In",
    sms: "{business}: A security incident may affect your data. Details & steps to protect yourself: {url} Help: {phone}",
    whatsapp: "Important message from {business}: a security incident on {aware} may have affected your {items}. Please read what happened, what it means for you and what you can do: {url}\nWe will never ask for your OTP or password. Questions: {phone} / {email} (ref {ref})",
    initialSubject: "Personal data breach intimation (Rule 7(2)(a)) — {business} — ref {ref}",
    to: "To",
    board: "Data Protection Board of India",
    boardChannel: "filing channel to be confirmed",
    from: "From",
    df: "Data Fiduciary",
    contactLabel: "Contact",
    ourRef: "Our reference",
    sentAt: "Date and time of this intimation",
    i1: "1. Description of the breach — nature",
    i2: "2. Extent",
    i2Text: "approx. {count} Data Principals; data categories: {categories}; systems: {systems}",
    i3: "3. Timing",
    i3Text: "occurred {window}; noticed {noticed}; became aware {aware}",
    i4: "4. Location of occurrence",
    i5: "5. Likely impact",
    i6: "6. Further details will follow within 72 hours of {aware}.",
    detailSubject: "Detailed report on personal data breach (Rule 7(2)(b)) — {business} — ref {ref}",
    initialSent: "Initial intimation sent",
    thisReport: "This report",
    r1: "(i) Updated and detailed description",
    r1Text: "{nature} Extent: {count} persons; {categories}. Timing: occurred {window}; aware {aware}. Location: {location}. Likely impact: {impact}",
    r2: "(ii) Broad facts: events, circumstances and reasons leading to the breach",
    timeline: "Timeline:",
    rootCause: "Root cause (as known)",
    r3: "(iii) Measures implemented or proposed to mitigate risk",
    r4: "(iv) Findings regarding the person who caused the breach",
    r5: "(v) Remedial measures taken to prevent recurrence",
    r6: "(vi) Report on intimations given to affected Data Principals",
    r6Count: "Number notified: {n} of {count}",
    r6Channels: "Channels",
    r6Dates: "Dates: first sent {first}, last sent {last}",
    r6Copy: "Copy of the message: attached (Annex 1)",
    r6NotReached: "Persons not reached and why",
    annexes: "Annexes: 1. Data Principal intimation text · 2. Timeline log export · 3. CERT-In acknowledgement (if any) · 4. Processor's incident report (if a processor was involved)",
    processor: "Processor involved: {name} (their reference {ref})",
    signed: "Signed for {business} by {title}",
    extSubject: "Request for extension under Rule 7(2)(b) — ref {ref}",
    extText:
      "We became aware of the breach on {aware} and sent our initial intimation on {initial}. We request an extension until {until} to submit the detailed report because {reason}. We will share the information listed in Rule 7(2)(b)(i)-(vi) that is available now.",
    boardUnverified: "Check the Board's current filing channel before sending: {url} (not yet verified).",
  },
  hi: {
    draft: "टेम्पलेट की स्थिति: ड्राफ़्ट — वकील की समीक्षा बाकी है। यह कानूनी सलाह नहीं है।",
    dpSubject: "ज़रूरी सूचना: {business} में आपके व्यक्तिगत डेटा से जुड़ी एक सुरक्षा घटना",
    dear: "प्रिय ग्राहक,",
    dpIntro: "हम आपको एक सुरक्षा घटना के बारे में बता रहे हैं, जिसका असर आपके कुछ व्यक्तिगत डेटा पर पड़ा है। ऐसा होने का हमें खेद है।",
    a: "1. क्या हुआ",
    aText: "{nature}। यह {window} हुआ और हमें {aware} को इसकी जानकारी मिली। {extent}।",
    aItems: "इसमें शामिल व्यक्तिगत डेटा:",
    b: "2. इसका आप पर क्या असर हो सकता है",
    c: "3. हमने क्या किया है और क्या कर रहे हैं",
    done: "किया गया: ",
    planned: "चल रहा है: ",
    d: "4. अपनी सुरक्षा के लिए आप क्या कर सकते हैं",
    neverAsk: "हम फ़ोन, SMS या WhatsApp पर कभी भी आपका OTP, पासवर्ड या कार्ड PIN नहीं माँगेंगे।",
    e: "5. किससे संपर्क करें",
    email: "ईमेल",
    phone: "फ़ोन",
    reference: "संदर्भ",
    informed: "कानून के अनुसार हमने भारतीय डेटा संरक्षण बोर्ड{certin} को भी इसकी सूचना दी है।",
    informedCertin: " और CERT-In",
    sms: "{business}: एक सुरक्षा घटना से आपका डेटा प्रभावित हो सकता है। पूरी जानकारी और बचाव के उपाय: {url} मदद: {phone}",
    whatsapp: "{business} की ओर से ज़रूरी संदेश: {aware} को हुई एक सुरक्षा घटना से आपका {items} प्रभावित हो सकता है। क्या हुआ, आप पर क्या असर हो सकता है और आप क्या कर सकते हैं, यहाँ पढ़ें: {url}\nहम कभी भी आपका OTP या पासवर्ड नहीं माँगेंगे। सवाल: {phone} / {email} (संदर्भ {ref})",
    initialSubject: "व्यक्तिगत डेटा उल्लंघन की सूचना (नियम 7(2)(a)) — {business} — संदर्भ {ref}",
    to: "प्रति",
    board: "भारतीय डेटा संरक्षण बोर्ड",
    boardChannel: "भेजने का माध्यम अभी तय होना है",
    from: "प्रेषक",
    df: "डेटा फ़िड्यूशियरी",
    contactLabel: "संपर्क",
    ourRef: "हमारा संदर्भ",
    sentAt: "इस सूचना की तारीख और समय",
    i1: "1. उल्लंघन का विवरण — प्रकृति",
    i2: "2. दायरा",
    i2Text: "लगभग {count} डेटा प्रिंसिपल; डेटा की श्रेणियाँ: {categories}; सिस्टम: {systems}",
    i3: "3. समय",
    i3Text: "घटना {window}; नोटिस हुई {noticed}; जानकारी मिली {aware}",
    i4: "4. घटना का स्थान",
    i5: "5. संभावित असर",
    i6: "6. विस्तृत जानकारी {aware} से 72 घंटे के भीतर भेजी जाएगी।",
    detailSubject: "व्यक्तिगत डेटा उल्लंघन की विस्तृत रिपोर्ट (नियम 7(2)(b)) — {business} — संदर्भ {ref}",
    initialSent: "पहली सूचना भेजी",
    thisReport: "यह रिपोर्ट",
    r1: "(i) अपडेट किया हुआ विस्तृत विवरण",
    r1Text: "{nature} दायरा: {count} व्यक्ति; {categories}। समय: घटना {window}; जानकारी मिली {aware}। स्थान: {location}। संभावित असर: {impact}",
    r2: "(ii) उल्लंघन तक ले जाने वाली घटनाएँ, परिस्थितियाँ और कारण",
    timeline: "टाइमलाइन:",
    rootCause: "मूल कारण (अब तक की जानकारी)",
    r3: "(iii) जोखिम कम करने के लिए किए गए या प्रस्तावित उपाय",
    r4: "(iv) उल्लंघन करने वाले व्यक्ति के बारे में निष्कर्ष",
    r5: "(v) दोबारा ऐसा न हो, इसके लिए उठाए गए कदम",
    r6: "(vi) प्रभावित डेटा प्रिंसिपल को दी गई सूचनाओं की रिपोर्ट",
    r6Count: "सूचना दी गई: {count} में से {n}",
    r6Channels: "माध्यम",
    r6Dates: "तारीखें: पहली {first}, आखिरी {last}",
    r6Copy: "संदेश की कॉपी: संलग्न (अनुलग्नक 1)",
    r6NotReached: "जिन तक सूचना नहीं पहुँची और क्यों",
    annexes: "अनुलग्नक: 1. डेटा प्रिंसिपल को भेजा संदेश · 2. टाइमलाइन लॉग · 3. CERT-In पावती (अगर हो) · 4. प्रोसेसर की घटना रिपोर्ट (अगर कोई प्रोसेसर शामिल था)",
    processor: "शामिल प्रोसेसर: {name} (उनका संदर्भ {ref})",
    signed: "{business} की ओर से हस्ताक्षर: {title}",
    extSubject: "नियम 7(2)(b) के तहत समय बढ़ाने का अनुरोध — संदर्भ {ref}",
    extText:
      "हमें {aware} को उल्लंघन की जानकारी मिली और हमने {initial} को पहली सूचना भेजी। विस्तृत रिपोर्ट भेजने के लिए हम {until} तक का समय माँगते हैं, क्योंकि {reason}। नियम 7(2)(b)(i)-(vi) की जो जानकारी अभी उपलब्ध है, वह हम साथ में भेज रहे हैं।",
    boardUnverified: "भेजने से पहले बोर्ड का मौजूदा माध्यम जाँच लें: {url} (अभी पुष्टि नहीं हुई)।",
  },
} as const;

function contactLines(ctx: BreachTemplateContext): string {
  const t = T[ctx.lang];
  if (!ctx.contact) return `${MISSING}, ${ctx.business}`;
  return [`${v(ctx.contact.nameOrTitle)}, ${ctx.business}`, `${t.email}: ${v(ctx.contact.email)} · ${t.phone}: ${v(ctx.contact.phone)}`, `${t.reference}: ${ctx.ref}`].join("\n");
}

/** B1-01: message to each affected Data Principal with Rule 7(1)(a)–(e). */
export function dpIntimation(ctx: BreachTemplateContext): Email & { sections: Record<"a" | "b" | "c" | "d" | "e", string> } {
  const t = T[ctx.lang];
  const d = ctx.details;
  const sections = {
    a: [t.a, fill(t.aText, { nature: v(d.nature), window: v(d.occurredWindow), aware: istDateTime(ctx.awareAt), extent: v(d.extent) }), t.aItems, list(d.categories)].join("\n"),
    b: [t.b, list(d.consequences)].join("\n"),
    c: [t.c, [...d.measuresTaken.filter((m) => m.trim()).map((m) => `- ${t.done}${m.trim()}`), ...d.measuresPlanned.filter((m) => m.trim()).map((m) => `- ${t.planned}${m.trim()}`)].join("\n") || `- ${MISSING}`].join("\n"),
    d: [t.d, d.safetySteps.filter((s) => s.trim()).length ? list(d.safetySteps) : "", `- ${t.neverAsk}`].filter(Boolean).join("\n"),
    e: [t.e, contactLines(ctx)].join("\n"),
  };
  const text = [t.dear, t.dpIntro, sections.a, sections.b, sections.c, sections.d, sections.e, fill(t.informed, { certin: ctx.certinSent ? t.informedCertin : "" }), ctx.business, t.draft].join("\n\n");
  return { subject: fill(t.dpSubject, { business: ctx.business }), text, sections };
}

/** Short SMS / WhatsApp versions; they must point to the full message (SMS alone cannot carry (a)–(e)). */
export function dpShortMessages(ctx: BreachTemplateContext): { sms: string; whatsapp: string } {
  const t = T[ctx.lang];
  const url = ctx.noticeUrl || MISSING;
  const phone = ctx.contact?.phone || MISSING;
  return {
    sms: fill(t.sms, { business: ctx.business, url, phone }),
    whatsapp: fill(t.whatsapp, { business: ctx.business, aware: istDateTime(ctx.awareAt).replace(/,.*$/, ""), items: ctx.details.categories.join(", ") || MISSING, url, phone, email: ctx.contact?.email || MISSING, ref: ctx.ref }),
  };
}

function header(ctx: BreachTemplateContext, extra: string[]): string {
  const t = T[ctx.lang];
  return [
    `${t.to}: ${t.board} — ${t.boardChannel}`,
    `${t.from}: ${ctx.business} (${t.df}), ${v(ctx.address)}`,
    `${t.contactLabel}: ${ctx.contact ? `${v(ctx.contact.nameOrTitle)}, ${v(ctx.contact.email)}, ${v(ctx.contact.phone)}` : MISSING}`,
    ...extra,
  ].join("\n");
}

const boardCheck = (lang: Lang) => (BOARD_URL_VERIFIED ? "" : fill(T[lang].boardUnverified, { url: BOARD_URL }));

/** Rule 7(2)(a): initial intimation "without delay": nature, extent, timing, location, likely impact. */
export function boardInitial(ctx: BreachTemplateContext): Email {
  const t = T[ctx.lang];
  const d = ctx.details;
  const text = [
    header(ctx, [`${t.ourRef}: ${ctx.ref} · ${t.sentAt}: ${istDateTime(ctx.now.toISOString())}`]),
    `${t.i1}: ${v(d.nature)}`,
    `${t.i2}: ${fill(t.i2Text, { count: ctx.affectedCount || MISSING, categories: d.categories.join(", ") || MISSING, systems: v(d.affectedSystems) })}`,
    `${t.i3}: ${fill(t.i3Text, { window: v(d.occurredWindow), noticed: istDateTime(ctx.noticedAt), aware: istDateTime(ctx.awareAt) })}`,
    `${t.i4}: ${v(d.location)}`,
    `${t.i5}: ${v(d.likelyImpact)}`,
    fill(t.i6, { aware: istDateTime(ctx.awareAt) }),
    d.processorName.trim() ? fill(t.processor, { name: d.processorName.trim(), ref: v(d.processorRef) }) : "",
    boardCheck(ctx.lang),
    t.draft,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { subject: fill(t.initialSubject, { business: ctx.business, ref: ctx.ref }), text };
}

/** B2-02: Rule 7(2)(b) detailed report with items (i)–(vi). */
export function boardDetailed(ctx: BreachTemplateContext): Email {
  const t = T[ctx.lang];
  const d = ctx.details;
  const timeline = ctx.timeline.length ? ctx.timeline.map((e) => `- ${istDateTime(e.at)} — ${e.event}`).join("\n") : `- ${MISSING}`;
  const text = [
    header(ctx, [`${t.ourRef}: ${ctx.ref} · ${t.initialSent}: ${istDateTime(ctx.boardInitialSentAt)} · ${t.thisReport}: ${istDateTime(ctx.now.toISOString())}`]),
    `${t.r1}\n${fill(t.r1Text, { nature: sentence(d.nature, ctx.lang), count: ctx.affectedCount || MISSING, categories: d.categories.join(", ") || MISSING, window: v(d.occurredWindow), aware: istDateTime(ctx.awareAt), location: v(d.location), impact: sentence(d.likelyImpact, ctx.lang) })}`,
    `${t.r2}\n${t.timeline}\n${timeline}\n${t.rootCause}: ${v(d.rootCause)}`,
    `${t.r3}\n${list([...d.measuresTaken, ...d.measuresPlanned])}`,
    `${t.r4}\n${v(d.findingsPerson)}`,
    `${t.r5}\n${list(d.remediation)}`,
    [
      t.r6,
      `- ${fill(t.r6Count, { n: ctx.dp.notified ?? MISSING, count: ctx.affectedCount || MISSING })}`,
      `- ${t.r6Channels}: ${v(d.dpChannels)}`,
      `- ${fill(t.r6Dates, { first: istDateTime(ctx.dp.firstSentAt), last: istDateTime(ctx.dp.lastSentAt) })}`,
      `- ${t.r6Copy}`,
      `- ${t.r6NotReached}: ${v(d.dpNotReached)}`,
    ].join("\n"),
    t.annexes,
    d.processorName.trim() ? fill(t.processor, { name: d.processorName.trim(), ref: v(d.processorRef) }) : "",
    fill(t.signed, { business: ctx.business, title: v(d.signatoryTitle) }),
    boardCheck(ctx.lang),
    t.draft,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { subject: fill(t.detailSubject, { business: ctx.business, ref: ctx.ref }), text };
}

/** Rule 7(2)(b): written request for more time — send before the 72 hours expire. */
export function boardExtension(ctx: BreachTemplateContext): Email {
  const t = T[ctx.lang];
  const text = [
    header(ctx, [`${t.ourRef}: ${ctx.ref}`]),
    fill(t.extText, { aware: istDateTime(ctx.awareAt), initial: istDateTime(ctx.boardInitialSentAt), until: ctx.requestedUntil ? istDateTime(ctx.requestedUntil) : MISSING, reason: v(ctx.details.extensionReason) }),
    fill(t.signed, { business: ctx.business, title: v(ctx.details.signatoryTitle) }),
    boardCheck(ctx.lang),
    t.draft,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { subject: fill(t.extSubject, { ref: ctx.ref }), text };
}

/** B4-02: CERT-In incident report email (English; CERT-In's own format overrides it when available). */
export function certinEmail(ctx: BreachTemplateContext): Email & { to: string } {
  const d = ctx.details;
  const text = [
    `To: ${CERTIN_EMAIL}`,
    `Organisation: ${ctx.business}, ${v(ctx.address)}`,
    `Point of contact: ${ctx.contact ? `${v(ctx.contact.nameOrTitle)}, ${v(ctx.contact.email)}, ${v(ctx.contact.phone)}` : MISSING}`,
    `Incident type (Annexure I): ${v(d.certinIncidentType)}`,
    `Noticed at: ${istDateTime(ctx.noticedAt)}`,
    `Systems affected: ${v(d.affectedSystems)}`,
    `Brief description: ${v(d.nature)}`,
    `Actions taken so far: ${d.measuresTaken.filter((m) => m.trim()).join("; ") || MISSING}`,
    `Logs preserved: yes, from ${v(d.logFrom)} (ICT logs kept for 180 days within India)`,
    `Our reference: ${ctx.ref}`,
    "Use CERT-In's current reporting format from www.cert-in.org.in if available; this email is a fallback. Phone 1800-11-4949, fax 1800-11-6969.",
    T.en.draft,
  ].join("\n");
  return { to: CERTIN_EMAIL, subject: `Cyber security incident report — ${ctx.business} — ${v(d.certinIncidentType)}`, text };
}

/** Normalise stored JSON into BreachDetails (unknown keys dropped, lists trimmed). */
export function parseDetails(json: string | null | undefined): BreachDetails {
  let raw: Record<string, unknown> = {};
  try {
    const p = JSON.parse(json || "{}");
    if (p && typeof p === "object" && !Array.isArray(p)) raw = p;
  } catch {
    // keep empty
  }
  const out = { ...EMPTY_DETAILS };
  for (const key of Object.keys(EMPTY_DETAILS) as Array<keyof BreachDetails>) {
    const val = raw[key];
    if (Array.isArray(EMPTY_DETAILS[key])) {
      (out[key] as string[]) = Array.isArray(val) ? val.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 400)).slice(0, 30) : [];
    } else {
      (out[key] as string) = typeof val === "string" ? val.slice(0, 4000) : "";
    }
  }
  return out;
}
