/**
 * Notice templates (English and Hindi).
 *
 * STATUS: DRAFT — PENDING LAWYER REVIEW. Not legal advice. These strings are
 * placeholders written against DPDP Act 2023 s.5, s.6 and DPDP Rules 2025
 * Rule 3 (see docs/REQUIREMENTS.md N1–N5). They must be replaced by the
 * lawyer-reviewed versions before the paid launch (plan §12 item 5, phase P9).
 *
 * Templates are data, not code: placeholders in {braces} are filled by the
 * renderer; everything else must be translated in both languages.
 */

export const TEMPLATE_STATUS = "draft-pending-lawyer-review" as const;
export const TEMPLATE_VERSION = "2026.11-draft.1";

export type Lang = "en" | "hi";
export const NOTICE_LANGS: readonly Lang[] = ["en", "hi"];

export interface NoticeTemplate {
  langName: string;
  title: string;
  draftBanner: string;
  intro: string;
  goodsServices: string;
  website: string;
  dataHeading: string;
  dataIntro: string;
  purposeUse: string;
  purposeItems: string;
  purposeBasis: string;
  purposeSharedWith: string;
  purposeKeptFor: string;
  purposeOptional: string;
  basis: Record<"consent" | "s7a_voluntary" | "s7_other" | "necessary", string>;
  vendorIndia: string;
  vendorAbroad: string;
  withdrawHeading: string;
  withdrawText: string;
  withdrawLink: string;
  withdrawEffect: string;
  rightsHeading: string;
  rightsList: string[];
  rightsHow: string;
  rightsLink: string;
  rightsIdentifiers: string;
  rightsPeriod: string;
  contactHeading: string;
  contactGrievance: string;
  contactDpo: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  boardHeading: string;
  boardText: string;
  boardLink: string;
  childrenHeading: string;
  childrenText: string;
  languagesHeading: string;
  languagesText: string;
  versionLine: string;
  footer: string;
  identifiers: Record<string, string>;
  period: { day: string; days: string; month: string; months: string; year: string; years: string; untilWithdrawn: string };
  // Short notice (banner / form) and legacy-customer message (s.5(2)).
  short: string;
  shortLinks: string;
  legacySubject: string;
  legacyBody: string;
  legacySms: string;
}

const EN: NoticeTemplate = {
  langName: "English",
  title: "Privacy notice — {org}",
  draftBanner: "Template status: draft — pending lawyer review. This notice was generated from a template and is not legal advice.",
  intro: "{legal} (\"we\") decides why and how the personal data described below is used. Under the Digital Personal Data Protection Act, 2023 we are the Data Fiduciary for this data. This notice explains it item by item so that you can read it on its own.",
  goodsServices: "What we offer: {text}",
  website: "Website or app: {url}",
  dataHeading: "Personal data we collect and why",
  dataIntro: "For each purpose below we list every item of personal data we collect for it.",
  purposeUse: "What we use it for: {text}",
  purposeItems: "Personal data:",
  purposeBasis: "Basis: {text}",
  purposeSharedWith: "Shared with: {text}",
  purposeKeptFor: "Kept for: {text}",
  purposeOptional: "This purpose is optional. Saying no does not stop you from using our other services.",
  basis: {
    consent: "your consent",
    s7a_voluntary: "you provide it voluntarily for this purpose (Section 7(a))",
    s7_other: "a legitimate use permitted by Section 7 of the Act",
    necessary: "needed to provide the service you asked for",
  },
  vendorIndia: "{name} ({service}, India)",
  vendorAbroad: "{name} ({service}, outside India)",
  withdrawHeading: "Withdrawing your consent",
  withdrawText: "Where we rely on your consent, you can withdraw it at any time. Withdrawing is as easy as giving consent.",
  withdrawLink: "Withdraw or change your consent: {url}",
  withdrawEffect: "After you withdraw, we and the companies that process data for us will stop using your personal data for that purpose within a reasonable time, unless a law requires us to keep it. Withdrawal does not affect what was done before it.",
  rightsHeading: "Your rights",
  rightsList: [
    "Get a summary of your personal data we process and of the processing, and the names of others we have shared it with.",
    "Ask us to correct, complete, update or erase your personal data.",
    "Raise a grievance with us.",
    "Nominate another person to exercise your rights if you die or become unable to do so.",
  ],
  rightsHow: "How to make a request:",
  rightsLink: "Use our request form: {url}",
  rightsIdentifiers: "To find your data we will ask for: {list}.",
  rightsPeriod: "We will respond within {days} days of receiving your request.",
  contactHeading: "Contact for questions and grievances",
  contactGrievance: "Grievance contact",
  contactDpo: "Data Protection Officer or authorised person",
  contactName: "Name: {text}",
  contactEmail: "Email: {text}",
  contactPhone: "Phone: {text}",
  contactAddress: "Address: {text}",
  boardHeading: "Complaining to the Data Protection Board of India",
  boardText: "If you are not satisfied with how we handle your grievance, you can complain to the Data Protection Board of India after using our grievance process.",
  boardLink: "Data Protection Board of India: {url}",
  childrenHeading: "Children",
  childrenText: "We do not process the personal data of anyone under 18 without the verifiable consent of a parent or lawful guardian. We do not track, monitor the behaviour of, or show targeted advertising to children.",
  languagesHeading: "Languages",
  languagesText: "This notice is available in English and Hindi: {url}",
  versionLine: "Notice version {version}, published {date}.",
  footer: "Generated with EpiFive Website Privacy Kit (template {template}). Not legal advice.",
  identifiers: {
    email: "the email address you used with us",
    mobile: "the mobile number you used with us",
    name: "your name",
    customer_id: "your customer or patient ID",
    order_id: "an order or invoice number",
    student_id: "the student's enrolment number",
  },
  period: { day: "{n} day", days: "{n} days", month: "{n} month", months: "{n} months", year: "{n} year", years: "{n} years", untilWithdrawn: "until you withdraw consent" },
  short: "{org} uses your data for: {purposes}. Read the full notice, change your choices or withdraw consent at any time.",
  shortLinks: "Notice: {notice} · Withdraw: {withdraw} · Your rights: {rights}",
  legacySubject: "How {org} uses your personal data",
  legacyBody: "Dear customer,\n\nYou shared personal data with {org} before the new data protection rules started. Our privacy notice explains what we hold, why, and how you can withdraw consent, use your rights or complain: {notice}\n\nTo withdraw consent: {withdraw}\nTo make a request: {rights}\n\n{org}",
  legacySms: "{org}: how we use your data, and how to withdraw consent or use your rights: {notice}",
};

const HI: NoticeTemplate = {
  langName: "हिंदी",
  title: "प्राइवेसी नोटिस — {org}",
  draftBanner: "टेम्पलेट की स्थिति: ड्राफ़्ट — वकील की समीक्षा बाकी। यह नोटिस एक टेम्पलेट से बनाया गया है और कानूनी सलाह नहीं है।",
  intro: "{legal} (\"हम\") तय करते हैं कि नीचे बताया गया व्यक्तिगत डेटा क्यों और कैसे इस्तेमाल होगा। डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम, 2023 के तहत इस डेटा के डेटा फ़िड्यूशियरी हम हैं। यह नोटिस हर जानकारी को अलग-अलग बताता है ताकि आप इसे अपने-आप में पढ़ और समझ सकें।",
  goodsServices: "हम क्या देते हैं: {text}",
  website: "वेबसाइट या ऐप: {url}",
  dataHeading: "हम कौन-सा व्यक्तिगत डेटा लेते हैं और क्यों",
  dataIntro: "नीचे हर उद्देश्य के लिए हम वह हर व्यक्तिगत जानकारी लिखते हैं जो उस उद्देश्य के लिए ली जाती है।",
  purposeUse: "हम इसका उपयोग किसलिए करते हैं: {text}",
  purposeItems: "व्यक्तिगत डेटा:",
  purposeBasis: "आधार: {text}",
  purposeSharedWith: "किसके साथ साझा होता है: {text}",
  purposeKeptFor: "कितने समय तक रखा जाता है: {text}",
  purposeOptional: "यह उद्देश्य वैकल्पिक है। मना करने पर भी आप हमारी बाकी सेवाएँ ले सकते हैं।",
  basis: {
    consent: "आपकी सहमति",
    s7a_voluntary: "आप इसे इस उद्देश्य के लिए स्वेच्छा से देते हैं (धारा 7(क))",
    s7_other: "अधिनियम की धारा 7 में अनुमत वैध उपयोग",
    necessary: "आपकी माँगी गई सेवा देने के लिए ज़रूरी",
  },
  vendorIndia: "{name} ({service}, भारत)",
  vendorAbroad: "{name} ({service}, भारत के बाहर)",
  withdrawHeading: "अपनी सहमति वापस लेना",
  withdrawText: "जहाँ हम आपकी सहमति पर निर्भर हैं, वहाँ आप कभी भी सहमति वापस ले सकते हैं। सहमति वापस लेना उतना ही आसान है जितना सहमति देना।",
  withdrawLink: "सहमति वापस लें या बदलें: {url}",
  withdrawEffect: "सहमति वापस लेने के बाद, हम और हमारे लिए डेटा प्रोसेस करने वाली कंपनियाँ उचित समय के भीतर उस उद्देश्य के लिए आपके व्यक्तिगत डेटा का उपयोग बंद कर देंगी, जब तक कि किसी कानून के तहत उसे रखना ज़रूरी न हो। सहमति वापस लेने से पहले हुए काम पर इसका असर नहीं पड़ता।",
  rightsHeading: "आपके अधिकार",
  rightsList: [
    "हमारे पास आपके किस व्यक्तिगत डेटा का उपयोग हो रहा है और कैसे, इसका सारांश पाना, और जिनके साथ इसे साझा किया गया है उनके नाम जानना।",
    "अपने व्यक्तिगत डेटा को सुधारने, पूरा करने, अपडेट करने या मिटाने के लिए कहना।",
    "हमारे पास शिकायत दर्ज करना।",
    "आपकी मृत्यु या असमर्थता की स्थिति में अपने अधिकारों का उपयोग करने के लिए किसी दूसरे व्यक्ति को नामित करना।",
  ],
  rightsHow: "अनुरोध कैसे करें:",
  rightsLink: "हमारा अनुरोध फ़ॉर्म भरें: {url}",
  rightsIdentifiers: "आपका डेटा ढूँढने के लिए हम ये जानकारी माँगेंगे: {list}।",
  rightsPeriod: "आपका अनुरोध मिलने के {days} दिनों के भीतर हम जवाब देंगे।",
  contactHeading: "सवालों और शिकायतों के लिए संपर्क",
  contactGrievance: "शिकायत संपर्क",
  contactDpo: "डेटा संरक्षण अधिकारी या अधिकृत व्यक्ति",
  contactName: "नाम: {text}",
  contactEmail: "ईमेल: {text}",
  contactPhone: "फ़ोन: {text}",
  contactAddress: "पता: {text}",
  boardHeading: "भारतीय डेटा संरक्षण बोर्ड में शिकायत",
  boardText: "अगर आप हमारे द्वारा शिकायत के निपटारे से संतुष्ट नहीं हैं, तो हमारी शिकायत प्रक्रिया का उपयोग करने के बाद आप भारतीय डेटा संरक्षण बोर्ड में शिकायत कर सकते हैं।",
  boardLink: "भारतीय डेटा संरक्षण बोर्ड: {url}",
  childrenHeading: "बच्चे",
  childrenText: "हम 18 साल से कम उम्र के किसी व्यक्ति का व्यक्तिगत डेटा माता-पिता या कानूनी अभिभावक की सत्यापन-योग्य सहमति के बिना प्रोसेस नहीं करते। हम बच्चों को ट्रैक नहीं करते, उनके व्यवहार की निगरानी नहीं करते और उन्हें लक्षित विज्ञापन नहीं दिखाते।",
  languagesHeading: "भाषाएँ",
  languagesText: "यह नोटिस अंग्रेज़ी और हिंदी में उपलब्ध है: {url}",
  versionLine: "नोटिस संस्करण {version}, प्रकाशित {date}।",
  footer: "EpiFive Website Privacy Kit से बनाया गया (टेम्पलेट {template})। यह कानूनी सलाह नहीं है।",
  identifiers: {
    email: "हमारे साथ इस्तेमाल किया गया आपका ईमेल पता",
    mobile: "हमारे साथ इस्तेमाल किया गया आपका मोबाइल नंबर",
    name: "आपका नाम",
    customer_id: "आपकी ग्राहक या मरीज़ आईडी",
    order_id: "ऑर्डर या इनवॉइस नंबर",
    student_id: "छात्र का नामांकन नंबर",
  },
  period: { day: "{n} दिन", days: "{n} दिन", month: "{n} महीना", months: "{n} महीने", year: "{n} साल", years: "{n} साल", untilWithdrawn: "जब तक आप सहमति वापस न लें" },
  short: "{org} आपके डेटा का उपयोग इनके लिए करता है: {purposes}। पूरा नोटिस पढ़ें, अपने विकल्प बदलें या कभी भी सहमति वापस लें।",
  shortLinks: "नोटिस: {notice} · सहमति वापसी: {withdraw} · आपके अधिकार: {rights}",
  legacySubject: "{org} आपके व्यक्तिगत डेटा का उपयोग कैसे करता है",
  legacyBody: "प्रिय ग्राहक,\n\nनए डेटा संरक्षण नियम शुरू होने से पहले आपने {org} के साथ अपना व्यक्तिगत डेटा साझा किया था। हमारा प्राइवेसी नोटिस बताता है कि हमारे पास क्या है, क्यों है, और आप कैसे सहमति वापस ले सकते हैं, अपने अधिकारों का उपयोग कर सकते हैं या शिकायत कर सकते हैं: {notice}\n\nसहमति वापस लेने के लिए: {withdraw}\nअनुरोध करने के लिए: {rights}\n\n{org}",
  legacySms: "{org}: हम आपके डेटा का उपयोग कैसे करते हैं, और सहमति वापस लेने या अधिकारों के उपयोग का तरीका: {notice}",
};

export const TEMPLATES: Record<Lang, NoticeTemplate> = { en: EN, hi: HI };

/** Identifier keys a business can ask for in rights requests (Rule 14(5)). */
export const IDENTIFIER_KEYS = Object.keys(EN.identifiers);

/**
 * Board link. [unverified] MeitY's DPB portal address must be confirmed before
 * launch (plan §15 item 6: the Board's filing channel is not yet known).
 */
export const BOARD_URL = "https://dpbi.gov.in";

/**
 * [unverified] marker for BOARD_URL: false until the Board's complaint channel
 * is confirmed from an official source. Hosted pages and emails then say
 * "address to be confirmed" next to the link.
 */
export const BOARD_URL_VERIFIED = false;
