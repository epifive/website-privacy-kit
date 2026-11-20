/**
 * Texts for the hosted withdraw page (/p/{org}/withdraw), from
 * wpk-content/legal-templates/{en,hi}/03-preference-centre.md and
 * 04-withdrawal-confirmation.md. Template status: draft — pending lawyer
 * review. Not legal advice. The banner's own strings live in
 * src/widget/runtime/i18n (EN inline, HI chunk).
 */
import type { Lang } from "../notice/templates";

export const CONSENT_TEXT_STATUS = "draft-pending-lawyer-review" as const;

export interface WithdrawTexts {
  title: string;
  intro: string;
  deviceNote: string;
  agreedTo: string;
  given: string;
  confirm: string;
  button: string;
  empty: string;
  doneTitle: string;
  doneList: string;
  doneCease: string;
  doneAgain: string;
  invalid: string;
  linkNotice: string;
  linkRights: string;
  linkRightsWithdraw: string;
  linkHub: string;
  linkBoard: string;
  contact: string;
  footer: string;
  draft: string;
  langName: string;
}

export const WITHDRAW_TEXTS: Record<Lang, WithdrawTexts> = {
  en: {
    title: "Privacy choices for {org}",
    intro: "Here you can see and change what you have agreed to. Switching something off is as quick as switching it on.",
    deviceNote:
      "Choices made with the banner are saved for that browser: open \"Privacy choices\" at the bottom of any page of the website and switch purposes off, or choose \"Withdraw all optional consents\". If you gave consent by email, phone or a form, use the link in our message or contact us so we can find your record.",
    agreedTo: "What you have agreed to",
    given: "You agreed on {date} (notice version {version})",
    confirm: "Withdraw all optional consents? We will stop using your data for these purposes. Things you already received are not affected.",
    button: "Withdraw all optional consents",
    empty: "You have not agreed to any optional purposes.",
    doneTitle: "Done. Your consent is withdrawn.",
    doneList: "You withdrew consent for: {purposes}.",
    doneCease: "We will stop using your data for these purposes within a reasonable time and tell our service providers to stop too.",
    doneAgain: "Changed your mind? You can switch them on again from \"Privacy choices\" on the website.",
    invalid: "This withdraw link is not valid. Please contact us and we will help.",
    linkNotice: "Read the full privacy notice",
    linkRights: "Ask for a copy, correction or erasure of your data",
    linkHub: "Privacy page: notice, rights and contacts",
    linkRightsWithdraw: "Gave consent with your email address? Withdraw it with a one-time code",
    linkBoard: "How to complain to the Data Protection Board of India",
    contact: "Questions: {contact}",
    footer: "Privacy choices are provided by {org} using EpiFive Website Privacy Kit.",
    draft: "Template status: draft — pending lawyer review. Not legal advice.",
    langName: "English",
  },
  hi: {
    title: "{org} के लिए प्राइवेसी विकल्प",
    intro: "यहाँ आप देख और बदल सकते हैं कि आपने किन बातों की सहमति दी है। किसी चीज़ को बंद करना उतना ही आसान है जितना चालू करना।",
    deviceNote:
      "बैनर से चुने गए विकल्प उसी ब्राउज़र के लिए सेव होते हैं: वेबसाइट के किसी भी पेज के नीचे \"प्राइवेसी विकल्प\" खोलें और काम बंद करें, या \"सभी वैकल्पिक सहमतियाँ वापस लें\" चुनें। अगर आपने ईमेल, फ़ोन या फ़ॉर्म से सहमति दी थी, तो हमारे मैसेज में दिया लिंक इस्तेमाल करें या हमसे संपर्क करें, ताकि हम आपका रिकॉर्ड ढूँढ सकें।",
    agreedTo: "आपने किन बातों की सहमति दी है",
    given: "आपने {date} को सहमति दी (सूचना संस्करण {version})",
    confirm: "सभी वैकल्पिक सहमतियाँ वापस लें? हम इन कामों के लिए आपका डेटा इस्तेमाल करना बंद कर देंगे। जो सेवाएँ आपको पहले मिल चुकी हैं, उन पर असर नहीं पड़ेगा।",
    button: "सभी वैकल्पिक सहमतियाँ वापस लें",
    empty: "आपने किसी वैकल्पिक काम की सहमति नहीं दी है।",
    doneTitle: "हो गया। आपकी सहमति वापस ले ली गई है।",
    doneList: "आपने इनके लिए सहमति वापस ली: {purposes}।",
    doneCease: "हम उचित समय में इन कामों के लिए आपका डेटा इस्तेमाल करना बंद कर देंगे और अपने सर्विस प्रोवाइडरों से भी बंद करवाएँगे।",
    doneAgain: "मन बदल गया? आप वेबसाइट पर \"प्राइवेसी विकल्प\" से इन्हें फिर से चालू कर सकते हैं।",
    invalid: "सहमति वापस लेने का यह लिंक मान्य नहीं है। कृपया हमसे संपर्क करें, हम मदद करेंगे।",
    linkNotice: "पूरी निजता सूचना पढ़ें",
    linkRights: "अपने डेटा की कॉपी, सुधार या उसे मिटाने का अनुरोध करें",
    linkHub: "प्राइवेसी पेज: नोटिस, अधिकार और संपर्क",
    linkRightsWithdraw: "अपने ईमेल पते से सहमति दी थी? एक बार इस्तेमाल होने वाले कोड से उसे वापस लें",
    linkBoard: "भारतीय डेटा संरक्षण बोर्ड में शिकायत कैसे करें",
    contact: "सवाल: {contact}",
    footer: "ये प्राइवेसी विकल्प {org} द्वारा EpiFive Website Privacy Kit के ज़रिए दिए गए हैं।",
    draft: "टेम्पलेट की स्थिति: ड्राफ़्ट — वकील की समीक्षा बाकी है। यह कानूनी सलाह नहीं है।",
    langName: "हिन्दी",
  },
};

export const fillText = (text: string, vars: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
