import type { Lang } from "../notice/templates";
import type { RequestType } from "./model";

/**
 * Texts for the hosted privacy hub (/p/{org}), the rights request form
 * (/p/{org}/rights) and the verification page. Template status: draft —
 * pending lawyer review. Not legal advice.
 */

export interface HostedTexts {
  langName: string;
  hubTitle: string;
  hubIntro: string;
  noticeHeading: string;
  noticeText: string;
  noticeRead: string;
  noticeOther: string;
  noticeMissing: string;
  rightsHeading: string;
  rightsButton: string;
  rightsPeriod: string;
  rightsIdentifiers: string;
  rightsFree: string;
  withdrawHeading: string;
  withdrawText: string;
  withdrawLink: string;
  contactHeading: string;
  contactDpo: string;
  contactGrievance: string;
  contactNone: string;
  email: string;
  phone: string;
  address: string;
  boardHeading: string;
  boardText: string;
  boardLink: string;
  boardUnverified: string;
  footer: string;
  draft: string;
  backToHub: string;
  formTitle: string;
  formIntro: string;
  withdrawShortcut: string;
  withdrawShortcutLink: string;
  typeLegend: string;
  types: Record<RequestType, { label: string; hint: string }>;
  nameLabel: string;
  emailLabel: string;
  emailHint: string;
  identifiersLegend: string;
  identifiersHint: string;
  detailsLabel: string;
  detailsHint: string;
  detailsRequiredFor: string;
  nomineeLegend: string;
  nomineeName: string;
  nomineeRelation: string;
  nomineeContact: string;
  attachLabel: string;
  attachHint: string;
  identityHeading: string;
  identityNote: string;
  privacyNote: string;
  submit: string;
  required: string;
  err: Record<"type" | "name" | "email" | "details" | "nominee" | "count" | "size" | "total" | "type_file" | "empty" | "captcha" | "rate" | "generic", string>;
  verifyTitle: string;
  verifyText: string;
  codeLabel: string;
  verifyButton: string;
  resendButton: string;
  resent: string;
  errCode: string;
  errExpired: string;
  errLocked: string;
  errResendWait: string;
  errResendMax: string;
  errInvalid: string;
  mailFailed: string;
  doneTitle: string;
  doneRef: string;
  doneDue: string;
  doneEmail: string;
  doneWithdraw: string;
  doneWithdrawNone: string;
  alreadyVerified: string;
}

export const HOSTED_TEXTS: Record<Lang, HostedTexts> = {
  en: {
    langName: "English",
    hubTitle: "Privacy at {org}",
    hubIntro: "Everything about how {org} handles your personal data in one place: the privacy notice, your rights, how to withdraw consent and whom to contact.",
    noticeHeading: "Privacy notice",
    noticeText: "Current version {version}, published {date}.",
    noticeRead: "Read the privacy notice",
    noticeOther: "हिन्दी में पढ़ें",
    noticeMissing: "The privacy notice has not been published yet. Please contact us below.",
    rightsHeading: "Your rights",
    rightsButton: "Make a request",
    rightsPeriod: "We respond within {days} days of receiving your request.",
    rightsIdentifiers: "To find your data we will ask for: {list}.",
    rightsFree: "Making a request is free.",
    withdrawHeading: "Withdraw consent",
    withdrawText: "Where we rely on your consent, you can withdraw it at any time, as easily as you gave it.",
    withdrawLink: "Withdraw or change your consent",
    contactHeading: "Contact for questions and grievances",
    contactDpo: "Data Protection Officer or authorised person",
    contactGrievance: "Grievance contact",
    contactNone: "Contact details have not been added yet.",
    email: "Email",
    phone: "Phone",
    address: "Address",
    boardHeading: "Complaining to the Data Protection Board of India",
    boardText: "If you are not satisfied with our reply to your grievance, you can complain to the Data Protection Board of India after using our grievance process.",
    boardLink: "Data Protection Board of India",
    boardUnverified: "Address to be confirmed: the Board's online complaint channel has not yet been confirmed from an official source.",
    footer: "This privacy page is provided by {org} using EpiFive Website Privacy Kit.",
    draft: "Template status: draft — pending lawyer review. Not legal advice.",
    backToHub: "Back to the privacy page",
    formTitle: "Make a privacy request to {org}",
    formIntro: "Use this form to exercise your rights under the Digital Personal Data Protection Act, 2023. We will confirm your email address with a one-time code and send you a reference number.",
    withdrawShortcut: "Only want to withdraw consent? You can do it straight away on the withdraw page, or choose \"Withdraw consent\" below if you gave consent with your email address.",
    withdrawShortcutLink: "Go to the withdraw page",
    typeLegend: "What would you like to do?",
    types: {
      access: { label: "Get a summary of my personal data", hint: "What data you hold about me, what you do with it, and who you shared it with." },
      correction: { label: "Correct, complete or update my data", hint: "Tell us what is wrong or missing and what it should be." },
      erasure: { label: "Erase my data", hint: "We erase it unless a law requires us to keep it, and tell you what was kept and why." },
      nomination: { label: "Nominate someone", hint: "A person who can use these rights for you if you die or cannot do so because of illness or disability." },
      grievance: { label: "Raise a grievance", hint: "A complaint to us about how your personal data was handled." },
      withdraw: { label: "Withdraw consent", hint: "Withdraw every optional consent you gave with this email address." },
    },
    nameLabel: "Your name",
    emailLabel: "Your email address",
    emailHint: "We send a one-time code here to confirm it is yours, and we reply to this address.",
    identifiersLegend: "Details that help us find your records",
    identifiersHint: "Fill in what you have. We only use these to find your records.",
    detailsLabel: "Details of your request",
    detailsHint: "For a correction, say what is wrong and what it should be. For a grievance, tell us what happened.",
    detailsRequiredFor: "A description is required for: {list}.",
    nomineeLegend: "Only for a nomination",
    nomineeName: "Nominee's name",
    nomineeRelation: "Relationship to you",
    nomineeContact: "Nominee's email or mobile number",
    attachLabel: "Attachments (optional)",
    attachHint: "Up to 3 files (PDF, JPG or PNG), 2 MB each. Do not send copies of identity documents unless we ask for them.",
    identityHeading: "About identity checks",
    identityNote:
      "We only ask for what we need to find your records and to make sure we give your data to you and nobody else. If we cannot match your request, we will tell you what else we need. A nominee may need to show proof such as a death or medical certificate.",
    privacyNote: "We use the details in this form only to handle your request and keep them as a record of it.",
    submit: "Send request",
    required: "required",
    err: {
      type: "Choose what you would like to do.",
      name: "Enter your name.",
      email: "Enter a valid email address.",
      details: "Tell us a little more about your request.",
      nominee: "Enter the nominee's name, your relationship and their email or mobile number.",
      count: "Attach at most 3 files.",
      size: "Each file can be at most 2 MB.",
      total: "The files together can be at most 5 MB.",
      type_file: "Attach only PDF, JPG or PNG files.",
      empty: "This form was empty. Please try again.",
      captcha: "Please complete the security check and try again.",
      rate: "Too many requests. Please try again in an hour or contact us.",
      generic: "Something went wrong. Please try again or contact us.",
    },
    verifyTitle: "Check your email",
    verifyText: "We sent a 6-digit code to {email}. Enter it below to confirm your request. The code is valid for 15 minutes.",
    codeLabel: "Code",
    verifyButton: "Confirm request",
    resendButton: "Send a new code",
    resent: "We sent a new code.",
    errCode: "That code is not correct. Attempts left: {left}.",
    errExpired: "This code has expired. Send a new code.",
    errLocked: "Too many wrong codes. Please send the form again or contact us.",
    errResendWait: "Please wait a minute before asking for a new code.",
    errResendMax: "No more codes can be sent for this request. Please send the form again or contact us.",
    errInvalid: "This link is not valid. Please send the form again or contact us.",
    mailFailed: "We could not send the email right now. Please try again in a few minutes or contact us.",
    doneTitle: "Request received",
    doneRef: "Your reference number is {ref}.",
    doneDue: "We will respond by {due} (within {days} days).",
    doneEmail: "We have sent a confirmation to your email address.",
    doneWithdraw: "Consent withdrawn for: {purposes}.",
    doneWithdrawNone: "We found no optional consent linked to this email address. Choices made with the website banner are saved in your browser: open \"Privacy choices\" on the website to change them.",
    alreadyVerified: "This request is already confirmed. Reference {ref}.",
  },
  hi: {
    langName: "हिन्दी",
    hubTitle: "{org} में प्राइवेसी",
    hubIntro: "{org} आपके व्यक्तिगत डेटा को कैसे संभालता है, इससे जुड़ी हर बात एक जगह: प्राइवेसी नोटिस, आपके अधिकार, सहमति वापस लेने का तरीका और किससे संपर्क करें।",
    noticeHeading: "प्राइवेसी नोटिस",
    noticeText: "मौजूदा संस्करण {version}, {date} को प्रकाशित।",
    noticeRead: "प्राइवेसी नोटिस पढ़ें",
    noticeOther: "Read in English",
    noticeMissing: "प्राइवेसी नोटिस अभी प्रकाशित नहीं हुआ है। कृपया नीचे दिए संपर्क पर हमसे बात करें।",
    rightsHeading: "आपके अधिकार",
    rightsButton: "अनुरोध करें",
    rightsPeriod: "आपका अनुरोध मिलने के {days} दिनों के भीतर हम जवाब देंगे।",
    rightsIdentifiers: "आपका डेटा ढूँढने के लिए हम ये जानकारी माँगेंगे: {list}।",
    rightsFree: "अनुरोध करना मुफ़्त है।",
    withdrawHeading: "सहमति वापस लें",
    withdrawText: "जहाँ हम आपकी सहमति पर निर्भर हैं, वहाँ आप कभी भी सहमति वापस ले सकते हैं, उतनी ही आसानी से जितनी आसानी से आपने दी थी।",
    withdrawLink: "अपनी सहमति वापस लें या बदलें",
    contactHeading: "सवालों और शिकायतों के लिए संपर्क",
    contactDpo: "डेटा संरक्षण अधिकारी या अधिकृत व्यक्ति",
    contactGrievance: "शिकायत अधिकारी",
    contactNone: "संपर्क की जानकारी अभी जोड़ी नहीं गई है।",
    email: "ईमेल",
    phone: "फ़ोन",
    address: "पता",
    boardHeading: "भारतीय डेटा संरक्षण बोर्ड में शिकायत",
    boardText: "अगर आप अपनी शिकायत पर हमारे जवाब से संतुष्ट नहीं हैं, तो हमारी शिकायत प्रक्रिया का इस्तेमाल करने के बाद आप भारतीय डेटा संरक्षण बोर्ड में शिकायत कर सकते हैं।",
    boardLink: "भारतीय डेटा संरक्षण बोर्ड",
    boardUnverified: "पता पक्का होना बाकी है: बोर्ड का ऑनलाइन शिकायत चैनल अभी किसी आधिकारिक स्रोत से पक्का नहीं हुआ है।",
    footer: "यह प्राइवेसी पेज {org} द्वारा EpiFive Website Privacy Kit के ज़रिए दिया गया है।",
    draft: "टेम्पलेट की स्थिति: ड्राफ़्ट — वकील की समीक्षा बाकी है। यह कानूनी सलाह नहीं है।",
    backToHub: "प्राइवेसी पेज पर वापस जाएँ",
    formTitle: "{org} को प्राइवेसी से जुड़ा अनुरोध भेजें",
    formIntro: "डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम, 2023 के तहत अपने अधिकारों का इस्तेमाल करने के लिए यह फ़ॉर्म भरें। हम एक बार इस्तेमाल होने वाले कोड से आपका ईमेल पता पक्का करेंगे और आपको एक संदर्भ संख्या भेजेंगे।",
    withdrawShortcut: "सिर्फ़ सहमति वापस लेनी है? आप यह सीधे सहमति वापसी वाले पेज पर कर सकते हैं, या अगर आपने अपने ईमेल पते से सहमति दी थी तो नीचे \"सहमति वापस लें\" चुनें।",
    withdrawShortcutLink: "सहमति वापसी वाले पेज पर जाएँ",
    typeLegend: "आप क्या करना चाहते हैं?",
    types: {
      access: { label: "मेरे व्यक्तिगत डेटा का सारांश चाहिए", hint: "आपके पास मेरा कौन-सा डेटा है, आप उससे क्या करते हैं और किसके साथ साझा किया है।" },
      correction: { label: "मेरे डेटा में सुधार करें, उसे पूरा या अपडेट करें", hint: "बताएँ कि क्या गलत है या छूट गया है और सही क्या होना चाहिए।" },
      erasure: { label: "मेरा डेटा मिटाएँ", hint: "जब तक किसी कानून के तहत रखना ज़रूरी न हो, हम डेटा मिटा देंगे, और बताएँगे कि क्या रखा गया और क्यों।" },
      nomination: { label: "नॉमिनी तय करें", hint: "ऐसा व्यक्ति जो आपकी मृत्यु होने पर, या बीमारी या अशक्तता के कारण आपके खुद न कर पाने पर, आपके लिए इन अधिकारों का इस्तेमाल कर सके।" },
      grievance: { label: "शिकायत दर्ज करें", hint: "आपके व्यक्तिगत डेटा को संभालने के तरीके के बारे में हमसे शिकायत।" },
      withdraw: { label: "सहमति वापस लें", hint: "इस ईमेल पते से दी गई सभी वैकल्पिक सहमतियाँ वापस लें।" },
    },
    nameLabel: "आपका नाम",
    emailLabel: "आपका ईमेल पता",
    emailHint: "यह पक्का करने के लिए कि पता आपका है, हम यहाँ एक बार इस्तेमाल होने वाला कोड भेजेंगे, और जवाब भी इसी पते पर देंगे।",
    identifiersLegend: "ऐसी जानकारी जिससे हमें आपका रिकॉर्ड ढूँढने में मदद मिले",
    identifiersHint: "जो आपके पास है वह भरें। हम इसका इस्तेमाल सिर्फ़ आपका रिकॉर्ड ढूँढने के लिए करेंगे।",
    detailsLabel: "आपके अनुरोध का विवरण",
    detailsHint: "सुधार के लिए बताएँ कि क्या गलत है और सही क्या होना चाहिए। शिकायत के लिए बताएँ कि क्या हुआ।",
    detailsRequiredFor: "इनके लिए विवरण देना ज़रूरी है: {list}।",
    nomineeLegend: "सिर्फ़ नॉमिनेशन के लिए",
    nomineeName: "नॉमिनी का नाम",
    nomineeRelation: "आपसे संबंध",
    nomineeContact: "नॉमिनी का ईमेल या मोबाइल नंबर",
    attachLabel: "अटैचमेंट (वैकल्पिक)",
    attachHint: "ज़्यादा से ज़्यादा 3 फ़ाइलें (PDF, JPG या PNG), हर एक 2 MB तक। जब तक हम न माँगें, पहचान दस्तावेज़ों की कॉपी न भेजें।",
    identityHeading: "पहचान की जाँच के बारे में",
    identityNote:
      "हम सिर्फ़ उतनी ही जानकारी माँगते हैं जितनी आपका रिकॉर्ड ढूँढने और यह पक्का करने के लिए ज़रूरी है कि आपका डेटा आपको ही मिले, किसी और को नहीं। अगर हम आपका अनुरोध मिला नहीं पाए, तो बताएँगे कि और क्या चाहिए। नॉमिनी को मृत्यु या मेडिकल प्रमाणपत्र जैसा प्रमाण दिखाना पड़ सकता है।",
    privacyNote: "इस फ़ॉर्म की जानकारी का इस्तेमाल हम सिर्फ़ आपके अनुरोध पर कार्रवाई के लिए करते हैं और उसे अनुरोध के रिकॉर्ड के रूप में रखते हैं।",
    submit: "अनुरोध भेजें",
    required: "ज़रूरी",
    err: {
      type: "चुनें कि आप क्या करना चाहते हैं।",
      name: "अपना नाम लिखें।",
      email: "सही ईमेल पता लिखें।",
      details: "अपने अनुरोध के बारे में थोड़ा और बताएँ।",
      nominee: "नॉमिनी का नाम, आपसे संबंध और उनका ईमेल या मोबाइल नंबर लिखें।",
      count: "ज़्यादा से ज़्यादा 3 फ़ाइलें लगाएँ।",
      size: "हर फ़ाइल ज़्यादा से ज़्यादा 2 MB की हो सकती है।",
      total: "सभी फ़ाइलें मिलाकर ज़्यादा से ज़्यादा 5 MB की हो सकती हैं।",
      type_file: "सिर्फ़ PDF, JPG या PNG फ़ाइलें लगाएँ।",
      empty: "फ़ॉर्म खाली था। कृपया फिर से कोशिश करें।",
      captcha: "कृपया सुरक्षा जाँच पूरी करें और फिर से कोशिश करें।",
      rate: "बहुत ज़्यादा अनुरोध। कृपया एक घंटे बाद कोशिश करें या हमसे संपर्क करें।",
      generic: "कुछ गड़बड़ हो गई। कृपया फिर से कोशिश करें या हमसे संपर्क करें।",
    },
    verifyTitle: "अपना ईमेल देखें",
    verifyText: "हमने {email} पर 6 अंकों का कोड भेजा है। अपने अनुरोध की पुष्टि के लिए उसे नीचे डालें। कोड 15 मिनट तक मान्य है।",
    codeLabel: "कोड",
    verifyButton: "अनुरोध की पुष्टि करें",
    resendButton: "नया कोड भेजें",
    resent: "हमने नया कोड भेज दिया है।",
    errCode: "यह कोड सही नहीं है। बची हुई कोशिशें: {left}।",
    errExpired: "इस कोड की समय-सीमा खत्म हो गई है। नया कोड मँगाएँ।",
    errLocked: "बहुत बार गलत कोड डाला गया। कृपया फ़ॉर्म फिर से भेजें या हमसे संपर्क करें।",
    errResendWait: "नया कोड माँगने से पहले कृपया एक मिनट रुकें।",
    errResendMax: "इस अनुरोध के लिए और कोड नहीं भेजे जा सकते। कृपया फ़ॉर्म फिर से भेजें या हमसे संपर्क करें।",
    errInvalid: "यह लिंक मान्य नहीं है। कृपया फ़ॉर्म फिर से भेजें या हमसे संपर्क करें।",
    mailFailed: "हम अभी ईमेल नहीं भेज पाए। कृपया कुछ मिनट बाद फिर से कोशिश करें या हमसे संपर्क करें।",
    doneTitle: "अनुरोध मिल गया",
    doneRef: "आपकी संदर्भ संख्या {ref} है।",
    doneDue: "हम {due} तक ({days} दिन के भीतर) जवाब देंगे।",
    doneEmail: "हमने आपके ईमेल पते पर पुष्टि भेज दी है।",
    doneWithdraw: "इनके लिए सहमति वापस ले ली गई: {purposes}।",
    doneWithdrawNone: "इस ईमेल पते से जुड़ी कोई वैकल्पिक सहमति हमें नहीं मिली। वेबसाइट के बैनर से चुने गए विकल्प आपके ब्राउज़र में सेव होते हैं: उन्हें बदलने के लिए वेबसाइट पर \"प्राइवेसी विकल्प\" खोलें।",
    alreadyVerified: "इस अनुरोध की पुष्टि पहले ही हो चुकी है। संदर्भ {ref}।",
  },
};
