/**
 * Interface text for the public lead-magnet pages (readiness checker, free
 * notice generator, guides). These pages are bilingual by URL
 * (`/readiness` and `/hi/readiness`), independent of the site language pack,
 * so their strings live here instead of the admin-translatable MESSAGES.
 *
 * Wording rules (plan §3.2–3.3): "helps you meet DPDP requirements", never
 * "compliant", "certified" or "guaranteed"; never call EpiFive a Consent Manager
 * except to say it is not one. Prices are plus GST if applicable.
 */

import type { ReadinessLang } from "../readiness/model";

const EN = {
  "lang.switch": "हिंदी में देखें",
  "lang.name": "English",
  "common.notLegalAdvice": "Not legal advice.",
  "common.draft": "Draft — not legal advice",
  "common.gst": "+ GST if applicable",
  "common.disclaimer":
    "EpiFive Website Privacy Kit is software that helps you organise DPDP tasks. It is not legal advice, does not make you compliant on its own, and is not a substitute for a lawyer. You (the business) are the Data Fiduciary. EpiFive is not a Consent Manager registered with the Data Protection Board of India.",

  // Readiness checker
  "rc.metaTitle": "Free DPDP readiness check (3 minutes, Hindi or English)",
  "rc.metaDescription":
    "Answer 28 short questions and get a DPDP readiness score, your top gaps with the Act and Rule numbers, and a printable report. Free, no login, not legal advice.",
  "rc.eyebrow": "Free · 3 minutes · no login",
  "rc.title": "How ready is your business for DPDP?",
  "rc.intro":
    "Answer short questions about your website, forms and records. You get a score, your biggest gaps with the Act and Rule numbers, and a report you can print or download.",
  "rc.privacy": "Your answers stay in this browser tab. Nothing is sent or stored unless you choose to contact us.",
  "rc.start": "Start the check",
  "rc.introCard": "{n} short questions · about 3 minutes",
  "rc.next": "Next",
  "rc.aboutYou": "About your business",
  "rc.section.notice": "Privacy notice",
  "rc.section.language": "Language",
  "rc.section.consent": "Consent",
  "rc.section.withdrawal": "Withdrawing consent",
  "rc.section.processors": "Vendors and processors",
  "rc.section.records": "Consent records",
  "rc.section.legacy": "Existing customers",
  "rc.section.rights": "Rights requests",
  "rc.section.grievance": "Grievances",
  "rc.section.contact": "Contact person",
  "rc.section.security": "Security",
  "rc.section.breach": "Data breaches",
  "rc.section.retention": "Keeping and erasing data",
  "rc.section.children": "Children's data",
  "rc.progress": "Question {n} of {total}",
  "rc.progressLabel": "Progress",
  "rc.back": "Back",
  "rc.skip": "Skip this question",
  "rc.whyAsk": "Why we ask",
  "rc.seeResult": "See my result",
  "rc.resultTitle": "Your DPDP readiness report",
  "rc.scoreLabel": "Readiness score",
  "rc.outOf": "out of 100",
  "rc.answered": "{n} questions scored · {inPlace} in place · {gaps} gaps",
  "rc.notEnough": "You answered fewer than {n} questions, so this score is only a rough indication.",
  "rc.noScore": "Answer at least one scored question to see a score.",
  "rc.notes": "Notes for your situation",
  "rc.topGaps": "Your top gaps",
  "rc.allGaps": "All gaps ({n})",
  "rc.noGaps": "No gaps in your answers. Keep your records up to date and have a lawyer review your notice.",
  "rc.yourAnswer": "Your answer:",
  "rc.refs": "References:",
  "rc.ctaTitle": "Next steps",
  "rc.ctaKit": "Open the dashboard",
  "rc.ctaKitText": "Notice generator, consent banner, consent records, request inbox and breach register, on this installation.",
  "rc.ctaSetup": "Several websites or clients?",
  "rc.ctaSetupText": "EpiFive Website Privacy Kit Pro adds organisations, websites and team roles, white-label pages, the parental-consent flow, the evidence pack and an API.",
  "rc.ctaNotice": "Generate a free draft notice",
  "rc.ctaWhatsapp": "Get Pro",
  "rc.print": "Print or save as PDF",
  "rc.download": "Download report",
  "rc.restart": "Start again",
  "rc.reportFor": "Report generated on {date}. Question bank version {version}, last reviewed {reviewed}.",
  "rc.sources": "Official sources",
  "rc.reportFile": "dpdp-readiness-report",

  // Free notice generator
  "ng.metaTitle": "Free DPDP privacy notice generator (English + Hindi)",
  "ng.metaDescription":
    "Answer a short questionnaire and get a draft, itemised privacy notice in English and Hindi under the DPDP Act and Rules 2025. Free, no login, not legal advice.",
  "ng.eyebrow": "Free · English + हिंदी · no login",
  "ng.title": "Free DPDP privacy notice generator",
  "ng.intro":
    "Answer a few questions and get a draft notice that lists each data item and purpose, how to withdraw consent, how to use rights and how to complain to the Data Protection Board, in English and Hindi.",
  "ng.privacy": "Nothing you type here is saved. The draft is built when you press the button and shown only to you.",
  "ng.step1": "Your business",
  "ng.step2": "What you collect",
  "ng.step3": "Contact for privacy questions",
  "ng.orgName": "Business name (as customers know it)",
  "ng.legalName": "Legal name (optional)",
  "ng.legalNameHint": "For example the proprietor's firm or company name. Leave empty to use the business name.",
  "ng.sector": "Type of business",
  "ng.goodsEn": "What you offer (English)",
  "ng.goodsHi": "What you offer (Hindi, optional)",
  "ng.goodsHint": "Leave empty to use the sector's standard text.",
  "ng.website": "Website address",
  "ng.noticeUrl": "Where will this notice be published? (optional)",
  "ng.noticeUrlHint": "For example https://example.com/privacy. Leave empty to use the website address.",
  "ng.purposes": "Why do you collect personal data? Tick everything that applies.",
  "ng.purposeItems": "Data: {items}",
  "ng.children": "Some of the people whose data we collect may be under 18",
  "ng.contactName": "Name or role of the person who answers privacy questions",
  "ng.contactDesignation": "Designation (optional)",
  "ng.contactEmail": "Email",
  "ng.contactPhone": "Phone (optional)",
  "ng.contactAddress": "Postal address (optional)",
  "ng.responseDays": "We reply to requests within (days, at most 90)",
  "ng.identifiers": "To find a person's data we ask for",
  "ng.generate": "Create my draft notice",
  "ng.generating": "Creating…",
  "ng.previewTitle": "Your draft notice",
  "ng.banner":
    "Draft — not legal advice. This notice was generated from templates pending lawyer review. Check it with a lawyer before you publish it. You (the business) are responsible for its content.",
  "ng.linksNote":
    "In this free draft, withdrawal and rights requests go to your email address. With an account, you get hosted withdraw and request pages with email verification, due dates and records.",
  "ng.tabEn": "English",
  "ng.tabHi": "हिंदी",
  "ng.download": "Download {lang} (HTML)",
  "ng.print": "Print or save as PDF",
  "ng.edit": "Edit answers",
  "ng.upsellTitle": "Save, publish and keep this notice",
  "ng.upsellText":
    "Sign in to the dashboard to keep every version with its fingerprint, publish it on your privacy page with withdraw and request forms, and add the consent banner.",
  "ng.upsellCta": "Open the dashboard",
  "ng.err.orgName": "Please enter your business name.",
  "ng.err.goods": "Please describe what you offer.",
  "ng.err.website": "Please enter a full website address starting with https://.",
  "ng.err.noticeUrl": "Please enter a full address starting with https://, or leave it empty.",
  "ng.err.purposes": "Please tick at least one purpose.",
  "ng.err.contactName": "Please enter the contact person's name or role.",
  "ng.err.contactEmail": "Please enter a valid email address for privacy questions.",
  "ng.err.identifiers": "Please choose at least one detail you use to find a person's data.",
  "ng.err.rate": "Too many drafts in a short time. Please wait a minute and try again.",
  "ng.warnGoodsHi": "The Hindi notice repeats your English description of what you offer. Add a Hindi description for a complete Hindi notice.",
  "ng.notStored": "Not saved anywhere: close this page and the draft is gone. Download it first.",

  // Guides
  "g.indexTitle": "DPDP guides for small businesses",
  "g.indexDescription":
    "Plain-language guides to the DPDP Act, 2023 and DPDP Rules, 2025 for Indian websites, clinics, coaching centres and online stores. With official citations. Not legal advice.",
  "g.indexIntro": "Plain-language guides with links to the official texts. Each page says what the law says, what is our reading, and what to do next.",
  "g.home": "Home",
  "g.guides": "Guides",
  "g.onThisPage": "On this page",
  "g.reviewed": "Last reviewed {date}",
  "g.readHindi": "हिंदी में पढ़ें",
  "g.readEnglish": "Read in English",
  "g.ctaTitle": "Check where you stand in 3 minutes",
  "g.ctaText": "Free DPDP readiness score with your top gaps and the Rule numbers. Hindi or English, no login.",
  "g.ctaButton": "Start the readiness check",
  "g.ctaPricing": "Get Pro",
  "g.related": "More guides",
  "g.hindiGuides": "हिंदी गाइड",
  "g.englishGuides": "Guides in English",
} as const;

export type MarketingKey = keyof typeof EN;

const HI: Record<MarketingKey, string> = {
  "lang.switch": "Read in English",
  "lang.name": "हिंदी",
  "common.notLegalAdvice": "यह कानूनी सलाह नहीं है।",
  "common.draft": "ड्राफ़्ट — कानूनी सलाह नहीं",
  "common.gst": "+ लागू हो तो GST",
  "common.disclaimer":
    "EpiFive Website Privacy Kit एक सॉफ़्टवेयर है जो DPDP से जुड़े कामों को व्यवस्थित करने में मदद करता है। यह कानूनी सलाह नहीं है, अपने-आप आपको अनुपालक नहीं बनाता और वकील का विकल्प नहीं है। आप (व्यवसाय) डेटा फ़िड्यूशियरी हैं। EpiFive भारतीय डेटा संरक्षण बोर्ड में पंजीकृत कंसेंट मैनेजर नहीं है।",

  "rc.metaTitle": "मुफ़्त DPDP रेडीनेस चेक (3 मिनट, हिंदी या अंग्रेज़ी)",
  "rc.metaDescription":
    "28 छोटे सवालों के जवाब दें और पाएँ DPDP रेडीनेस स्कोर, एक्ट और नियम नंबर के साथ आपकी मुख्य कमियाँ, और प्रिंट करने लायक रिपोर्ट। मुफ़्त, बिना लॉगिन, कानूनी सलाह नहीं।",
  "rc.eyebrow": "मुफ़्त · 3 मिनट · बिना लॉगिन",
  "rc.title": "आपका व्यवसाय DPDP के लिए कितना तैयार है?",
  "rc.intro":
    "अपनी वेबसाइट, फ़ॉर्म और रिकॉर्ड के बारे में छोटे सवालों के जवाब दें। आपको मिलेगा एक स्कोर, एक्ट और नियम नंबर के साथ आपकी सबसे बड़ी कमियाँ, और एक रिपोर्ट जिसे आप प्रिंट या डाउनलोड कर सकते हैं।",
  "rc.privacy": "आपके जवाब इसी ब्राउज़र टैब में रहते हैं। जब तक आप ख़ुद हमसे संपर्क न करें, कुछ भी भेजा या सेव नहीं होता।",
  "rc.start": "चेक शुरू करें",
  "rc.introCard": "{n} छोटे सवाल · लगभग 3 मिनट",
  "rc.next": "आगे",
  "rc.aboutYou": "आपके व्यवसाय के बारे में",
  "rc.section.notice": "प्राइवेसी नोटिस",
  "rc.section.language": "भाषा",
  "rc.section.consent": "सहमति",
  "rc.section.withdrawal": "सहमति वापस लेना",
  "rc.section.processors": "वेंडर और प्रोसेसर",
  "rc.section.records": "सहमति का रिकॉर्ड",
  "rc.section.legacy": "पुराने ग्राहक",
  "rc.section.rights": "अधिकारों के अनुरोध",
  "rc.section.grievance": "शिकायतें",
  "rc.section.contact": "संपर्क व्यक्ति",
  "rc.section.security": "सुरक्षा",
  "rc.section.breach": "डेटा ब्रीच",
  "rc.section.retention": "डेटा रखना और मिटाना",
  "rc.section.children": "बच्चों का डेटा",
  "rc.progress": "सवाल {n} / {total}",
  "rc.progressLabel": "प्रगति",
  "rc.back": "पीछे",
  "rc.skip": "यह सवाल छोड़ें",
  "rc.whyAsk": "यह सवाल क्यों",
  "rc.seeResult": "मेरा नतीजा देखें",
  "rc.resultTitle": "आपकी DPDP रेडीनेस रिपोर्ट",
  "rc.scoreLabel": "रेडीनेस स्कोर",
  "rc.outOf": "100 में से",
  "rc.answered": "{n} सवालों पर स्कोर · {inPlace} तैयार · {gaps} कमियाँ",
  "rc.notEnough": "आपने {n} से कम सवालों के जवाब दिए, इसलिए यह स्कोर सिर्फ़ एक मोटा अंदाज़ा है।",
  "rc.noScore": "स्कोर देखने के लिए कम से कम एक स्कोर वाले सवाल का जवाब दें।",
  "rc.notes": "आपकी स्थिति के लिए नोट",
  "rc.topGaps": "आपकी मुख्य कमियाँ",
  "rc.allGaps": "सभी कमियाँ ({n})",
  "rc.noGaps": "आपके जवाबों में कोई कमी नहीं है। अपने रिकॉर्ड अपडेट रखें और अपना नोटिस वकील से जँचवाएँ।",
  "rc.yourAnswer": "आपका जवाब:",
  "rc.refs": "संदर्भ:",
  "rc.ctaTitle": "आगे क्या करें",
  "rc.ctaKit": "डैशबोर्ड खोलें",
  "rc.ctaKitText": "नोटिस जनरेटर, सहमति बैनर, सहमति रिकॉर्ड, अनुरोध इनबॉक्स और ब्रीच रजिस्टर, इसी इंस्टॉलेशन पर।",
  "rc.ctaSetup": "कई वेबसाइटें या क्लाइंट?",
  "rc.ctaSetupText": "EpiFive Website Privacy Kit Pro में संगठन, वेबसाइटें और टीम रोल, व्हाइट-लेबल पेज, अभिभावक-सहमति फ़्लो, एविडेंस पैक और API मिलते हैं।",
  "rc.ctaNotice": "मुफ़्त ड्राफ़्ट नोटिस बनाएँ",
  "rc.ctaWhatsapp": "Pro लें",
  "rc.print": "प्रिंट करें या PDF सेव करें",
  "rc.download": "रिपोर्ट डाउनलोड करें",
  "rc.restart": "फिर से शुरू करें",
  "rc.reportFor": "रिपोर्ट {date} को बनी। प्रश्न-सूची संस्करण {version}, आख़िरी समीक्षा {reviewed}।",
  "rc.sources": "आधिकारिक स्रोत",
  "rc.reportFile": "dpdp-readiness-report-hi",

  "ng.metaTitle": "मुफ़्त DPDP प्राइवेसी नोटिस जनरेटर (अंग्रेज़ी + हिंदी)",
  "ng.metaDescription":
    "एक छोटी प्रश्नावली भरें और DPDP एक्ट और नियम 2025 के तहत अंग्रेज़ी और हिंदी में हर डेटा की सूची वाला ड्राफ़्ट प्राइवेसी नोटिस पाएँ। मुफ़्त, बिना लॉगिन, कानूनी सलाह नहीं।",
  "ng.eyebrow": "मुफ़्त · English + हिंदी · बिना लॉगिन",
  "ng.title": "मुफ़्त DPDP प्राइवेसी नोटिस जनरेटर",
  "ng.intro":
    "कुछ सवालों के जवाब दें और अंग्रेज़ी व हिंदी में ड्राफ़्ट नोटिस पाएँ, जिसमें हर डेटा और उद्देश्य, सहमति वापस लेने, अधिकारों का उपयोग करने और डेटा संरक्षण बोर्ड में शिकायत का तरीका हो।",
  "ng.privacy": "आप यहाँ जो लिखते हैं वह सेव नहीं होता। बटन दबाने पर ड्राफ़्ट बनता है और सिर्फ़ आपको दिखता है।",
  "ng.step1": "आपका व्यवसाय",
  "ng.step2": "आप क्या डेटा लेते हैं",
  "ng.step3": "प्राइवेसी सवालों के लिए संपर्क",
  "ng.orgName": "व्यवसाय का नाम (जिस नाम से ग्राहक जानते हैं)",
  "ng.legalName": "कानूनी नाम (वैकल्पिक)",
  "ng.legalNameHint": "जैसे प्रोप्राइटर की फ़र्म या कंपनी का नाम। ख़ाली छोड़ें तो व्यवसाय का नाम इस्तेमाल होगा।",
  "ng.sector": "व्यवसाय का प्रकार",
  "ng.goodsEn": "आप क्या देते हैं (अंग्रेज़ी)",
  "ng.goodsHi": "आप क्या देते हैं (हिंदी, वैकल्पिक)",
  "ng.goodsHint": "ख़ाली छोड़ें तो उस सेक्टर का सामान्य टेक्स्ट इस्तेमाल होगा।",
  "ng.website": "वेबसाइट का पता",
  "ng.noticeUrl": "यह नोटिस कहाँ प्रकाशित होगा? (वैकल्पिक)",
  "ng.noticeUrlHint": "जैसे https://example.com/privacy। ख़ाली छोड़ें तो वेबसाइट का पता इस्तेमाल होगा।",
  "ng.purposes": "आप निजी डेटा क्यों लेते हैं? जो भी लागू हो, सब पर टिक करें।",
  "ng.purposeItems": "डेटा: {items}",
  "ng.children": "जिनका डेटा हम लेते हैं उनमें कुछ 18 साल से कम उम्र के हो सकते हैं",
  "ng.contactName": "प्राइवेसी सवालों का जवाब देने वाले व्यक्ति का नाम या पद",
  "ng.contactDesignation": "पदनाम (वैकल्पिक)",
  "ng.contactEmail": "ईमेल",
  "ng.contactPhone": "फ़ोन (वैकल्पिक)",
  "ng.contactAddress": "डाक पता (वैकल्पिक)",
  "ng.responseDays": "हम अनुरोधों का जवाब इतने दिनों में देते हैं (अधिकतम 90)",
  "ng.identifiers": "किसी व्यक्ति का डेटा ढूँढने के लिए हम पूछते हैं",
  "ng.generate": "मेरा ड्राफ़्ट नोटिस बनाएँ",
  "ng.generating": "बन रहा है…",
  "ng.previewTitle": "आपका ड्राफ़्ट नोटिस",
  "ng.banner":
    "ड्राफ़्ट — कानूनी सलाह नहीं। यह नोटिस उन टेम्पलेट से बना है जिनकी वकील द्वारा समीक्षा बाकी है। प्रकाशित करने से पहले इसे वकील से जँचवाएँ। इसकी सामग्री के लिए आप (व्यवसाय) ज़िम्मेदार हैं।",
  "ng.linksNote":
    "इस मुफ़्त ड्राफ़्ट में सहमति वापसी और अधिकारों के अनुरोध आपके ईमेल पर जाते हैं। अकाउंट के साथ आपको ईमेल वेरिफ़िकेशन, ड्यू डेट और रिकॉर्ड वाले होस्टेड वापसी और अनुरोध पेज मिलते हैं।",
  "ng.tabEn": "English",
  "ng.tabHi": "हिंदी",
  "ng.download": "{lang} डाउनलोड करें (HTML)",
  "ng.print": "प्रिंट करें या PDF सेव करें",
  "ng.edit": "जवाब बदलें",
  "ng.upsellTitle": "यह नोटिस सेव करें, प्रकाशित करें और रखें",
  "ng.upsellText":
    "डैशबोर्ड में साइन इन करें: हर वर्ज़न उसके फ़िंगरप्रिंट के साथ रखें, इसे वापसी और अनुरोध फ़ॉर्म के साथ अपने प्राइवेसी पेज पर प्रकाशित करें और सहमति बैनर जोड़ें।",
  "ng.upsellCta": "डैशबोर्ड खोलें",
  "ng.err.orgName": "कृपया अपने व्यवसाय का नाम लिखें।",
  "ng.err.goods": "कृपया बताएँ कि आप क्या देते हैं।",
  "ng.err.website": "कृपया https:// से शुरू होने वाला पूरा वेबसाइट पता लिखें।",
  "ng.err.noticeUrl": "कृपया https:// से शुरू होने वाला पूरा पता लिखें, या इसे ख़ाली छोड़ दें।",
  "ng.err.purposes": "कृपया कम से कम एक उद्देश्य पर टिक करें।",
  "ng.err.contactName": "कृपया संपर्क व्यक्ति का नाम या पद लिखें।",
  "ng.err.contactEmail": "कृपया प्राइवेसी सवालों के लिए सही ईमेल पता लिखें।",
  "ng.err.identifiers": "कृपया कम से कम एक जानकारी चुनें जिससे आप किसी व्यक्ति का डेटा ढूँढते हैं।",
  "ng.err.rate": "कम समय में बहुत ज़्यादा ड्राफ़्ट। कृपया एक मिनट रुककर फिर कोशिश करें।",
  "ng.warnGoodsHi": "हिंदी नोटिस में आपकी सेवाओं का अंग्रेज़ी विवरण ही दोहराया गया है। पूरे हिंदी नोटिस के लिए हिंदी विवरण जोड़ें।",
  "ng.notStored": "यह कहीं सेव नहीं है: पेज बंद करते ही ड्राफ़्ट चला जाएगा। पहले डाउनलोड कर लें।",

  "g.indexTitle": "छोटे व्यवसायों के लिए DPDP गाइड",
  "g.indexDescription":
    "भारतीय वेबसाइट, क्लिनिक, कोचिंग सेंटर और ऑनलाइन स्टोर के लिए DPDP एक्ट, 2023 और DPDP नियम, 2025 पर आसान भाषा में गाइड। आधिकारिक स्रोतों के साथ। कानूनी सलाह नहीं।",
  "g.indexIntro": "आधिकारिक टेक्स्ट के लिंक के साथ आसान भाषा में गाइड। हर पेज बताता है कि कानून क्या कहता है, हम उसे कैसे पढ़ते हैं, और आगे क्या करें।",
  "g.home": "होम",
  "g.guides": "गाइड",
  "g.onThisPage": "इस पेज पर",
  "g.reviewed": "आख़िरी समीक्षा {date}",
  "g.readHindi": "हिंदी में पढ़ें",
  "g.readEnglish": "Read in English",
  "g.ctaTitle": "3 मिनट में जानें आप कहाँ खड़े हैं",
  "g.ctaText": "मुफ़्त DPDP रेडीनेस स्कोर, आपकी मुख्य कमियों और नियम नंबर के साथ। हिंदी या अंग्रेज़ी, बिना लॉगिन।",
  "g.ctaButton": "रेडीनेस चेक शुरू करें",
  "g.ctaPricing": "Pro लें",
  "g.related": "और गाइड",
  "g.hindiGuides": "हिंदी गाइड",
  "g.englishGuides": "Guides in English",
};

export const MARKETING_TEXT: Record<ReadinessLang, Record<MarketingKey, string>> = { en: EN, hi: HI };

export type MarketingT = (key: MarketingKey, vars?: Record<string, string | number>) => string;

export function marketingT(lang: ReadinessLang): MarketingT {
  const dict = MARKETING_TEXT[lang];
  return (key, vars) => {
    const text = dict[key] ?? EN[key];
    return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
  };
}

/** Path of the same page in the other language: /readiness ↔ /hi/readiness. */
export function langPath(lang: ReadinessLang, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (lang === "hi") return clean === "/" ? "/hi" : `/hi${clean}`;
  return clean;
}
