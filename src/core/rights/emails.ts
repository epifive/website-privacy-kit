import type { Lang } from "../notice/templates";
import { BOARD_URL, BOARD_URL_VERIFIED } from "../notice/templates";
import type { Outcome, RequestType } from "./model";

/**
 * Emails to the Data Principal and internal reminders, from
 * wpk-content/legal-templates/{en,hi}/06-rights-request-emails.md.
 *
 * STATUS: DRAFT — PENDING LAWYER REVIEW. Not legal advice.
 *
 * Rule 9 / s.8(9): the contact block is appended to EVERY message sent to a
 * Data Principal in response to a rights request (R4-02). ensureContactBlock()
 * re-adds it when a reply was edited and the block was removed.
 */

export const RIGHTS_EMAIL_STATUS = "draft-pending-lawyer-review" as const;

export interface ContactInfo {
  /** "dpo" = Data Protection Officer or authorised person; "grievance" = grievance contact. */
  role: "dpo" | "grievance";
  name: string;
  designation?: string;
  email: string;
  phone: string;
  address: string;
}

export interface EmailContext {
  lang: Lang;
  business: string;
  ref: string;
  requesterName: string;
  type: RequestType;
  receivedDate: string;
  dueDate: string;
  responseDays: number;
  contact: ContactInfo | null;
  rightsUrl: string;
}

export interface Email {
  subject: string;
  text: string;
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** Labels used inside sentences ("your … request"). */
export const TYPE_LABELS: Record<Lang, Record<RequestType, string>> = {
  en: {
    access: "summary of your personal data",
    correction: "correction / update",
    erasure: "erasure",
    nomination: "nomination",
    grievance: "grievance",
    withdraw: "consent withdrawal",
  },
  hi: {
    access: "आपके व्यक्तिगत डेटा का सारांश",
    correction: "सुधार / अपडेट",
    erasure: "डेटा मिटाना",
    nomination: "नॉमिनेशन",
    grievance: "शिकायत",
    withdraw: "सहमति वापस लेना",
  },
};

const T = {
  en: {
    contactHeading: "Questions about your personal data",
    roleDpo: "Data Protection Officer or authorised person",
    roleGrievance: "Grievance contact",
    email: "Email",
    phone: "Phone",
    address: "Address",
    dear: "Dear {name},",
    draft: "Template status: draft — pending lawyer review. Not legal advice.",
    otpSubject: "Your verification code — {business}",
    otpBody:
      "Your code to confirm your {label} request to {business} is: {code}\n\nIt is valid for 15 minutes. If you did not make this request, ignore this email; nothing will happen without the code.",
    ackSubject: "We have received your request — ref {ref}",
    ackBody:
      "Thank you. We received your {label} request on {received}.\n\nReference number: {ref}\nWe will respond by: {due} (within {days} days)\n\nWe confirmed your email address with a one-time code. We will only use the details you sent to find and verify your records. You do not have to pay anything for this request.",
    infoSubject: "We need a little more information — ref {ref}",
    infoBody:
      "We could not yet match your request {ref} to our records. Please send us {missing}. We need this only to find your data and make sure we do not give it to someone else.\n\nWe will still reply by {due}. If we cannot identify you by then, we will tell you what we tried.",
    accessSubject: "Your personal data summary — ref {ref}",
    accessIntro: "As requested on {received}, here is a summary of the personal data {business} processes about you.",
    accessA: "A. Personal data we hold and what we do with it",
    accessB: "B. Who we have shared it with",
    accessNone: "We have not shared your personal data with any other organisation or service provider.",
    accessProcessor: "Data Processor",
    accessIndia: "in India",
    accessAbroad: "outside India",
    accessUsedFor: "used for",
    accessFix: "If anything is wrong or missing, you can ask us to correct or complete it: {url}",
    correctionSubject: "Your data has been updated — ref {ref}",
    correctionBody: "We have acted on your request of {received}:\n\n[Describe each change, e.g. Mobile number: changed from \"98xxxxx210\" to \"97xxxxx555\".]\n\n[If something could not be changed: We could not change … because … .]\n\nIf you are not satisfied, reply to this email to raise a grievance.",
    erasureSubject: "Your erasure request — ref {ref}",
    erasureBody:
      "We have acted on your erasure request of {received}.\n\nErased: [list what was erased]\n\nKept for now: [item] — until [date], because [law or reason]. After that date it will be erased without you needing to ask again.\n\nWe have also instructed our service providers ({processors}) to erase the copies they hold for us.",
    erasureRefusedSubject: "Your erasure request — ref {ref}",
    erasureRefusedBody:
      "We are not able to erase [items] at this time because [law or reason]. We will erase it on or after [date]. Until then we will use it only for [restricted purpose].\n\nIf you disagree, you can raise a grievance by replying to this email. If our grievance reply does not resolve it, you may complain to the Data Protection Board of India.",
    nominationSubject: "Your nominee is recorded — ref {ref}",
    nominationBody:
      "We have recorded {nominee} ({relation}) as your nominee on {recorded}.\n\nIf you die, or become unable to exercise your rights because of unsoundness of mind or infirmity of body, your nominee can exercise your rights over your personal data with {business}. They will need to show [proof, e.g. a death or medical certificate and their own ID].\n\nYou can change or cancel this nomination at any time: {url}",
    grievanceSubject: "Our reply to your grievance — ref {ref}",
    grievanceBody:
      "You raised a grievance on {received} about: {summary}.\n\nOutcome: {outcome}\nWhat we found: [findings]\nWhat we have done: [actions taken]",
    boardText:
      "If you are not satisfied with this reply, you may complain to the Data Protection Board of India. You can quote reference {ref} and attach this letter.",
    boardUnverified: "The Board's online complaint process will be published on its official website ({url}, address to be confirmed); ask us and we will share the link.",
    boardVerified: "Complaints can be filed online at {url}.",
    closureSubject: "Your request is closed — ref {ref}",
    closureBody: "We have closed your {label} request of {received}.\n\nOutcome: {outcome}\n\n[Add a short explanation.]\n\nIf you are not satisfied, reply to this email to raise a grievance.",
    withdrawSubject: "Your consent is withdrawn — ref {ref}",
    withdrawDone: "We received your request of {received} to withdraw consent. We have withdrawn your consent for: {purposes}.\n\nWe will stop using your data for these purposes within a reasonable time and tell our service providers to stop too. Withdrawal does not affect what was done before it.",
    withdrawNone:
      "We received your request of {received} to withdraw consent. We found no optional consent linked to this email address. Choices made with the website banner are saved in your browser: open \"Privacy choices\" on the website to change them. If you gave consent another way, reply to this email and we will help.",
    dueSoonSubject: "Request {ref} is due on {due}",
    dueSoonBody: "Request {ref} ({label}) from {requester} is due on {due} — {left} day(s) left.\n\nOpen: {url}",
    overdueSubject: "Overdue: request {ref}",
    overdueBody: "Request {ref} ({label}) is overdue (due {due}). Reply today and record the reason for the delay.\n\nOpen: {url}",
    outcomes: {
      completed: "completed",
      partly_completed: "partly completed",
      refused: "refused (with reasons below)",
      not_verified: "closed because we could not verify the request",
      nothing_found: "no matching records found",
      withdrawn_by_requester: "withdrawn by you",
      resolved: "resolved",
      partly_resolved: "partly resolved",
      not_upheld: "not upheld (with reasons below)",
    } satisfies Record<Outcome, string>,
  },
  hi: {
    contactHeading: "आपके व्यक्तिगत डेटा से जुड़े सवालों के लिए",
    roleDpo: "डेटा संरक्षण अधिकारी या अधिकृत व्यक्ति",
    roleGrievance: "शिकायत अधिकारी",
    email: "ईमेल",
    phone: "फ़ोन",
    address: "पता",
    dear: "प्रिय {name},",
    draft: "टेम्पलेट की स्थिति: ड्राफ़्ट — वकील की समीक्षा बाकी है। यह कानूनी सलाह नहीं है।",
    otpSubject: "आपका सत्यापन कोड — {business}",
    otpBody:
      "{business} को भेजे गए आपके {label} के अनुरोध की पुष्टि का कोड है: {code}\n\nयह 15 मिनट तक मान्य है। अगर यह अनुरोध आपने नहीं भेजा, तो इस ईमेल को अनदेखा करें; कोड के बिना कुछ नहीं होगा।",
    ackSubject: "हमें आपका अनुरोध मिल गया है — संदर्भ {ref}",
    ackBody:
      "धन्यवाद। हमें {received} को आपका {label} का अनुरोध मिला।\n\nसंदर्भ संख्या: {ref}\nहम जवाब देंगे: {due} तक ({days} दिन के भीतर)\n\nहमने एक बार इस्तेमाल होने वाले कोड से आपका ईमेल पता पक्का कर लिया है। आपकी भेजी जानकारी का इस्तेमाल हम सिर्फ़ आपका रिकॉर्ड ढूँढने और पहचान पक्की करने के लिए करेंगे। इस अनुरोध के लिए आपको कोई शुल्क नहीं देना है।",
    infoSubject: "हमें थोड़ी और जानकारी चाहिए — संदर्भ {ref}",
    infoBody:
      "हम आपके अनुरोध {ref} को अभी अपने रिकॉर्ड से मिला नहीं पाए हैं। कृपया हमें {missing} भेजें। यह सिर्फ़ आपका डेटा ढूँढने के लिए और यह पक्का करने के लिए चाहिए कि हम वह किसी और को न दे दें।\n\nहम फिर भी {due} तक जवाब देंगे। अगर तब तक आपकी पहचान नहीं हो पाई, तो हम बताएँगे कि हमने क्या-क्या कोशिश की।",
    accessSubject: "आपके व्यक्तिगत डेटा का सारांश — संदर्भ {ref}",
    accessIntro: "{received} के आपके अनुरोध के अनुसार, {business} आपका जो व्यक्तिगत डेटा प्रोसेस करता है, उसका सारांश यह है।",
    accessA: "क. हमारे पास कौन-सा डेटा है और हम उससे क्या करते हैं",
    accessB: "ख. हमने यह डेटा किसके साथ साझा किया है",
    accessNone: "हमने आपका व्यक्तिगत डेटा किसी दूसरी संस्था या सर्विस प्रोवाइडर के साथ साझा नहीं किया है।",
    accessProcessor: "डेटा प्रोसेसर",
    accessIndia: "भारत में",
    accessAbroad: "भारत के बाहर",
    accessUsedFor: "इस्तेमाल",
    accessFix: "अगर कुछ गलत है या छूट गया है, तो आप उसे सुधारने या पूरा करने का अनुरोध कर सकते हैं: {url}",
    correctionSubject: "आपका डेटा अपडेट कर दिया गया है — संदर्भ {ref}",
    correctionBody: "{received} के आपके अनुरोध पर हमने यह किया है:\n\n[हर बदलाव लिखें, जैसे मोबाइल नंबर: \"98xxxxx210\" से बदलकर \"97xxxxx555\"।]\n\n[अगर कुछ नहीं बदला जा सका: हम … नहीं बदल पाए, क्योंकि … ।]\n\nअगर आप संतुष्ट नहीं हैं, तो शिकायत दर्ज करने के लिए इस ईमेल का जवाब दें।",
    erasureSubject: "डेटा मिटाने का आपका अनुरोध — संदर्भ {ref}",
    erasureBody:
      "{received} के आपके डेटा मिटाने के अनुरोध पर हमने कार्रवाई की है।\n\nमिटा दिया गया: [जो मिटाया गया]\n\nअभी रखा गया है: [डेटा] — [तारीख] तक, क्योंकि [कानून या कारण]। उस तारीख के बाद यह बिना दोबारा कहे मिटा दिया जाएगा।\n\nहमने अपने सर्विस प्रोवाइडरों ({processors}) को भी कहा है कि वे हमारी ओर से रखी कॉपी मिटा दें।",
    erasureRefusedSubject: "डेटा मिटाने का आपका अनुरोध — संदर्भ {ref}",
    erasureRefusedBody:
      "हम अभी [डेटा] नहीं मिटा सकते, क्योंकि [कानून या कारण]। हम इसे [तारीख] को या उसके बाद मिटा देंगे। तब तक हम इसे सिर्फ़ [सीमित काम] के लिए इस्तेमाल करेंगे।\n\nअगर आप असहमत हैं, तो इस ईमेल का जवाब देकर शिकायत दर्ज कर सकते हैं। अगर हमारे जवाब से शिकायत हल नहीं होती, तो आप भारतीय डेटा संरक्षण बोर्ड में शिकायत कर सकते हैं।",
    nominationSubject: "आपका नॉमिनी दर्ज कर लिया गया है — संदर्भ {ref}",
    nominationBody:
      "हमने {recorded} को {nominee} ({relation}) को आपके नॉमिनी के रूप में दर्ज किया है।\n\nआपकी मृत्यु होने पर, या मानसिक अस्वस्थता या शारीरिक अशक्तता के कारण आपके खुद अधिकारों का इस्तेमाल न कर पाने की स्थिति में, आपका नॉमिनी {business} के पास मौजूद आपके व्यक्तिगत डेटा से जुड़े आपके अधिकारों का इस्तेमाल कर सकेगा। इसके लिए उन्हें [प्रमाण, जैसे मृत्यु या मेडिकल प्रमाणपत्र और अपना पहचान पत्र] दिखाना होगा।\n\nआप यह नॉमिनेशन कभी भी बदल या रद्द कर सकते हैं: {url}",
    grievanceSubject: "आपकी शिकायत पर हमारा जवाब — संदर्भ {ref}",
    grievanceBody: "आपने {received} को इस बारे में शिकायत की थी: {summary}।\n\nनतीजा: {outcome}\nहमने क्या पाया: [जाँच का नतीजा]\nहमने क्या किया: [की गई कार्रवाई]",
    boardText: "अगर आप इस जवाब से संतुष्ट नहीं हैं, तो आप भारतीय डेटा संरक्षण बोर्ड में शिकायत कर सकते हैं। आप संदर्भ संख्या {ref} बता सकते हैं और यह पत्र साथ लगा सकते हैं।",
    boardUnverified: "बोर्ड की ऑनलाइन शिकायत प्रक्रिया उसकी आधिकारिक वेबसाइट ({url}, पता पक्का होना बाकी है) पर प्रकाशित होगी; हमसे पूछें, हम लिंक भेज देंगे।",
    boardVerified: "शिकायत ऑनलाइन यहाँ दर्ज की जा सकती है: {url}।",
    closureSubject: "आपका अनुरोध बंद कर दिया गया है — संदर्भ {ref}",
    closureBody: "हमने {received} का आपका {label} का अनुरोध बंद कर दिया है।\n\nनतीजा: {outcome}\n\n[एक छोटा स्पष्टीकरण जोड़ें।]\n\nअगर आप संतुष्ट नहीं हैं, तो शिकायत दर्ज करने के लिए इस ईमेल का जवाब दें।",
    withdrawSubject: "आपकी सहमति वापस ले ली गई है — संदर्भ {ref}",
    withdrawDone:
      "हमें {received} को सहमति वापस लेने का आपका अनुरोध मिला। हमने इनके लिए आपकी सहमति वापस ले ली है: {purposes}।\n\nहम उचित समय में इन कामों के लिए आपका डेटा इस्तेमाल करना बंद कर देंगे और अपने सर्विस प्रोवाइडरों से भी बंद करवाएँगे। पहले हो चुके काम पर इसका असर नहीं पड़ता।",
    withdrawNone:
      "हमें {received} को सहमति वापस लेने का आपका अनुरोध मिला। इस ईमेल पते से जुड़ी कोई वैकल्पिक सहमति हमें नहीं मिली। वेबसाइट के बैनर से चुने गए विकल्प आपके ब्राउज़र में सेव होते हैं: उन्हें बदलने के लिए वेबसाइट पर \"प्राइवेसी विकल्प\" खोलें। अगर आपने किसी और तरीके से सहमति दी थी, तो इस ईमेल का जवाब दें, हम मदद करेंगे।",
    dueSoonSubject: "अनुरोध {ref} की समय-सीमा {due} है",
    dueSoonBody: "अनुरोध {ref} ({label}), {requester} से, {due} को देय है — {left} दिन बाकी।\n\nखोलें: {url}",
    overdueSubject: "समय-सीमा निकल गई: अनुरोध {ref}",
    overdueBody: "अनुरोध {ref} ({label}) की समय-सीमा निकल चुकी है (देय {due})। आज ही जवाब दें और देरी का कारण दर्ज करें।\n\nखोलें: {url}",
    outcomes: {
      completed: "पूरा किया गया",
      partly_completed: "आंशिक रूप से पूरा किया गया",
      refused: "अस्वीकार (कारण नीचे)",
      not_verified: "बंद, क्योंकि हम अनुरोध की पुष्टि नहीं कर सके",
      nothing_found: "कोई मिलता-जुलता रिकॉर्ड नहीं मिला",
      withdrawn_by_requester: "आपने वापस ले लिया",
      resolved: "हल हो गई",
      partly_resolved: "आंशिक रूप से हल हुई",
      not_upheld: "शिकायत सही नहीं पाई गई (कारण नीचे)",
    } satisfies Record<Outcome, string>,
  },
} as const;

export function outcomeLabel(lang: Lang, outcome: Outcome): string {
  return T[lang].outcomes[outcome];
}

/** Rule 9 contact block (CONTACT-BLOCK in 06-rights-request-emails.md). */
export function contactBlock(lang: Lang, business: string, contact: ContactInfo | null): string {
  const t = T[lang];
  if (!contact) return `---\n${t.contactHeading}\n${business}`;
  const who = contact.designation ? `${contact.name}, ${contact.designation}` : contact.name;
  const lines = [
    "---",
    t.contactHeading,
    `${contact.role === "dpo" ? t.roleDpo : t.roleGrievance}: ${who}, ${business}`,
    [contact.email ? `${t.email}: ${contact.email}` : "", contact.phone ? `${t.phone}: ${contact.phone}` : ""].filter(Boolean).join(" · "),
    contact.address ? `${t.address}: ${contact.address}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** True when the Rule 9 block (heading and the contact's email or phone) is in the text. */
export function hasContactBlock(text: string, block: string): boolean {
  return text.includes(block.trim());
}

/** Append the contact block when an edited reply no longer contains it (R4-02). */
export function ensureContactBlock(text: string, block: string): string {
  const body = text.replace(/\s+$/, "");
  return hasContactBlock(body, block) ? body : `${body}\n\n${block}`;
}

function letter(ctx: EmailContext, subject: string, body: string, vars: Record<string, string | number> = {}): Email {
  const t = T[ctx.lang];
  const all = {
    business: ctx.business,
    ref: ctx.ref,
    received: ctx.receivedDate,
    due: ctx.dueDate,
    days: ctx.responseDays,
    label: TYPE_LABELS[ctx.lang][ctx.type],
    url: ctx.rightsUrl,
    ...vars,
  };
  const text = [fill(t.dear, { name: ctx.requesterName }), fill(body, all), contactBlock(ctx.lang, ctx.business, ctx.contact), t.draft].join("\n\n");
  return { subject: fill(subject, all), text };
}

/** OTP email: not a response to the request yet, but it still carries the contact block. */
export function otpEmail(ctx: EmailContext, code: string): Email {
  const t = T[ctx.lang];
  return letter(ctx, t.otpSubject, t.otpBody, { code });
}

/** ACK (all request types): reference number and due date (Rule 14(3)). */
export function ackEmail(ctx: EmailContext): Email {
  const t = T[ctx.lang];
  return letter(ctx, t.ackSubject, t.ackBody);
}

export interface AccessSummary {
  purposes: Array<{ name: string; items: string[]; use: string }>;
  vendors: Array<{ name: string; service: string; dataShared: string[]; location: "india" | "abroad" }>;
}

/** s.11(1)(a) summary of data and processing + s.11(1)(b) processors from the vendor register (R1-02). */
export function accessText(lang: Lang, ctx: Pick<EmailContext, "business" | "receivedDate" | "rightsUrl">, summary: AccessSummary): string {
  const t = T[lang];
  const a = summary.purposes.map((p) => `- ${p.name}: ${p.items.join(", ")}${p.use ? ` — ${t.accessUsedFor}: ${p.use}` : ""}`);
  const b = summary.vendors.map(
    (v) => `- ${v.name} (${t.accessProcessor}${v.service ? `: ${v.service}` : ""}; ${v.location === "abroad" ? t.accessAbroad : t.accessIndia})${v.dataShared.length ? ` — ${v.dataShared.join(", ")}` : ""}`,
  );
  return [
    fill(t.accessIntro, { received: ctx.receivedDate, business: ctx.business }),
    `${t.accessA}\n${a.join("\n")}`,
    `${t.accessB}\n${b.length ? b.join("\n") : t.accessNone}`,
    fill(t.accessFix, { url: ctx.rightsUrl }),
  ].join("\n\n");
}

export type ReplyTemplate = "info" | "access" | "correction" | "erasure" | "erasure_refused" | "nomination" | "grievance" | "closure";

export const REPLY_TEMPLATES: readonly ReplyTemplate[] = ["info", "access", "correction", "erasure", "erasure_refused", "nomination", "grievance", "closure"];

/** Template suggested first for each request type. */
export function defaultTemplate(type: RequestType): ReplyTemplate {
  if (type === "access" || type === "correction" || type === "erasure" || type === "nomination" || type === "grievance") return type;
  return "closure";
}

export interface ReplyVars {
  access?: AccessSummary;
  processors?: string[];
  nominee?: { name: string; relation: string; recordedDate: string };
  summary?: string;
  missing?: string;
  outcome?: Outcome;
}

/** Board paragraph for grievance replies and erasure refusals (s.13(3): the DF's route comes first). */
export function boardParagraph(lang: Lang, ref: string): string {
  const t = T[lang];
  return `${fill(t.boardText, { ref })} ${fill(BOARD_URL_VERIFIED ? t.boardVerified : t.boardUnverified, { url: BOARD_URL })}`;
}

/** A reply draft with the Rule 9 contact block already inserted (R4-02). Staff edit the [bracketed] parts. */
export function replyDraft(template: ReplyTemplate, ctx: EmailContext, vars: ReplyVars = {}): Email {
  const t = T[ctx.lang];
  const outcome = vars.outcome ? outcomeLabel(ctx.lang, vars.outcome) : "[outcome]";
  switch (template) {
    case "info":
      return letter(ctx, t.infoSubject, t.infoBody, { missing: vars.missing || "[details needed]" });
    case "access":
      return letter(ctx, t.accessSubject, accessText(ctx.lang, ctx, vars.access ?? { purposes: [], vendors: [] }));
    case "correction":
      return letter(ctx, t.correctionSubject, t.correctionBody);
    case "erasure":
      return letter(ctx, t.erasureSubject, t.erasureBody, { processors: vars.processors?.length ? vars.processors.join(", ") : "—" });
    case "erasure_refused":
      return letter(ctx, t.erasureRefusedSubject, `${t.erasureRefusedBody}\n\n${boardParagraph(ctx.lang, ctx.ref)}`);
    case "nomination":
      return letter(ctx, t.nominationSubject, t.nominationBody, {
        nominee: vars.nominee?.name || "[nominee]",
        relation: vars.nominee?.relation || "[relation]",
        recorded: vars.nominee?.recordedDate || ctx.receivedDate,
      });
    case "grievance":
      return letter(ctx, t.grievanceSubject, `${t.grievanceBody}\n\n${boardParagraph(ctx.lang, ctx.ref)}`, { summary: vars.summary || "[summary]", outcome });
    case "closure":
      return letter(ctx, t.closureSubject, t.closureBody, { outcome });
  }
}

/** Confirmation for the consent-withdrawal shortcut. */
export function withdrawEmail(ctx: EmailContext, purposes: string[]): Email {
  const t = T[ctx.lang];
  return letter(ctx, t.withdrawSubject, purposes.length ? t.withdrawDone : t.withdrawNone, { purposes: purposes.join(", ") });
}

/** Internal reminder to the business (T−7, T−1, overdue). Not sent to the Data Principal. */
export function reminderEmail(lang: Lang, kind: "t7" | "t1" | "overdue", vars: { ref: string; type: RequestType; requester: string; due: string; left: number; url: string }): Email {
  const t = T[lang];
  const all = { ...vars, label: TYPE_LABELS[lang][vars.type] };
  return kind === "overdue" ? { subject: fill(t.overdueSubject, all), text: fill(t.overdueBody, all) } : { subject: fill(t.dueSoonSubject, all), text: fill(t.dueSoonBody, all) };
}
