import type { Basis, Bilingual } from "./notice/render";

/**
 * Sector presets (plan §4, §9 P2): starting purposes, vendors and retention
 * rules for common small-business types. DRAFT — pending lawyer review; law
 * references marked [verify] must be checked before launch. Businesses edit
 * everything after applying a preset.
 */

export const SECTORS = ["clinic", "coaching", "d2c", "agent", "ca_firm", "other"] as const;
export type Sector = (typeof SECTORS)[number];

export interface PresetPurpose {
  key: string;
  name: Bilingual;
  description: Bilingual;
  basis: Basis;
  items: string[];
  isTracking?: boolean;
  /** Names of preset vendors this purpose shares data with. */
  vendors?: string[];
  /** Category of the preset retention rule that applies. */
  retention?: string;
}

export interface PresetVendor {
  name: string;
  service: string;
  dataShared: string[];
  location: "india" | "abroad";
}

export interface PresetRetention {
  category: string;
  categoryHi: string;
  lawRef: string;
  periodDays: number;
  trigger: "last_interaction" | "purpose_complete" | "withdrawal" | "account_closure" | "collection";
  action: "erase" | "anonymise" | "review";
  isLogs?: boolean;
}

export interface SectorPreset {
  sector: Sector;
  label: Bilingual;
  goodsServices: Bilingual;
  childrenMode: boolean;
  identifiers: string[];
  purposes: PresetPurpose[];
  vendors: PresetVendor[];
  retention: PresetRetention[];
  /** Shown in the questionnaire (Fourth Schedule, Rule 12): information only, never a legal conclusion. */
  exemptionNote?: Bilingual;
}

const P = {
  website: {
    key: "website_security",
    name: { en: "Run our website securely", hi: "हमारी वेबसाइट को सुरक्षित रूप से चलाना" },
    description: { en: "Keep the website working, prevent misuse and remember your privacy choices.", hi: "वेबसाइट चालू रखना, दुरुपयोग रोकना और आपकी प्राइवेसी पसंद याद रखना।" },
    basis: "necessary",
    items: ["cookie_id", "ip_address", "device_info"],
    vendors: ["Website hosting"],
    retention: "Server and access logs",
  },
  analytics: {
    key: "analytics",
    name: { en: "Understand how our website is used", hi: "समझना कि हमारी वेबसाइट का उपयोग कैसे होता है" },
    description: { en: "Count visits and see which pages are useful so we can improve them.", hi: "विज़िट गिनना और देखना कि कौन-से पेज उपयोगी हैं, ताकि हम उन्हें बेहतर बना सकें।" },
    basis: "consent",
    items: ["cookie_id", "pages_visited", "device_info"],
    isTracking: true,
    vendors: ["Google Analytics"],
    retention: "Analytics data",
  },
  whatsappOffers: {
    key: "marketing_whatsapp",
    name: { en: "Send offers and updates on WhatsApp", hi: "WhatsApp पर ऑफ़र और अपडेट भेजना" },
    description: { en: "Send you news, offers and festival greetings. You can stop these at any time.", hi: "आपको खबरें, ऑफ़र और त्योहार की शुभकामनाएँ भेजना। आप इन्हें कभी भी बंद कर सकते हैं।" },
    basis: "consent",
    items: ["name", "whatsapp"],
    vendors: ["WhatsApp Business API provider"],
    retention: "Marketing contact list",
  },
} satisfies Record<string, PresetPurpose>;

const V: Record<string, PresetVendor> = {
  hosting: { name: "Website hosting", service: "Website and database hosting", dataShared: ["cookie_id", "ip_address", "device_info"], location: "india" },
  workspace: { name: "Google Workspace", service: "Email and documents", dataShared: ["name", "email", "messages"], location: "abroad" },
  whatsapp: { name: "WhatsApp Business API provider", service: "WhatsApp messages", dataShared: ["name", "whatsapp"], location: "abroad" },
  sms: { name: "SMS gateway", service: "SMS reminders", dataShared: ["name", "mobile"], location: "india" },
  razorpay: { name: "Razorpay", service: "Online payments", dataShared: ["name", "mobile", "email", "payment_ref"], location: "india" },
  analytics: { name: "Google Analytics", service: "Website statistics", dataShared: ["cookie_id", "pages_visited", "device_info"], location: "abroad" },
  shopify: { name: "Shopify", service: "Online store platform", dataShared: ["name", "mobile", "email", "delivery_address", "order_details"], location: "abroad" },
  courier: { name: "Courier partner", service: "Delivery", dataShared: ["name", "mobile", "delivery_address"], location: "india" },
  tally: { name: "Accounting software", service: "Invoices and accounts", dataShared: ["name", "gstin", "payment_ref"], location: "india" },
};

const R: Record<string, PresetRetention> = {
  logs: { category: "Server and access logs", categoryHi: "सर्वर और एक्सेस लॉग", lawRef: "DPDP Rules 2025, Rule 8(3): at least one year", periodDays: 365, trigger: "collection", action: "erase", isLogs: true },
  analytics: { category: "Analytics data", categoryHi: "एनालिटिक्स डेटा", lawRef: "Business choice", periodDays: 395, trigger: "collection", action: "erase" },
  marketing: { category: "Marketing contact list", categoryHi: "मार्केटिंग संपर्क सूची", lawRef: "Until consent is withdrawn", periodDays: 0, trigger: "withdrawal", action: "erase" },
  invoices: { category: "Tax invoices and accounts", categoryHi: "टैक्स इनवॉइस और खाते", lawRef: "CGST Act s.36: 72 months from the annual return due date [verify]", periodDays: 2920, trigger: "collection", action: "erase" },
  enquiries: { category: "Enquiries and leads", categoryHi: "पूछताछ और लीड", lawRef: "Business choice", periodDays: 365, trigger: "last_interaction", action: "erase" },
  consentProof: { category: "Consent records", categoryHi: "सहमति रिकॉर्ड", lawRef: "Proof of consent, Act s.6(10); EpiFive default, lawyer to confirm", periodDays: 1095, trigger: "withdrawal", action: "erase", isLogs: true },
};

const common = { website: P.website, analytics: P.analytics, whatsappOffers: P.whatsappOffers };

export const SECTOR_PRESETS: Record<Sector, SectorPreset> = {
  clinic: {
    sector: "clinic",
    label: { en: "Clinic, lab or physiotherapy", hi: "क्लिनिक, लैब या फ़िज़ियोथेरेपी" },
    goodsServices: { en: "Medical consultation, diagnosis and treatment.", hi: "चिकित्सा परामर्श, जाँच और इलाज।" },
    childrenMode: true,
    identifiers: ["mobile", "customer_id"],
    exemptionNote: {
      en: "The Fourth Schedule (Rule 12) has conditional exemptions for clinical establishments and healthcare professionals. Whether and how far they apply to you is for your lawyer to decide.",
      hi: "चौथी अनुसूची (नियम 12) में क्लिनिकल प्रतिष्ठानों और स्वास्थ्य पेशेवरों के लिए शर्तों के साथ छूट है। यह आप पर लागू होती है या नहीं, और कितनी, यह आपका वकील तय करेगा।",
    },
    purposes: [
      {
        key: "appointments",
        name: { en: "Book and manage appointments", hi: "अपॉइंटमेंट बुक और प्रबंधित करना" },
        description: { en: "Confirm, reschedule and remind you about your appointment.", hi: "आपके अपॉइंटमेंट की पुष्टि करना, समय बदलना और याद दिलाना।" },
        basis: "s7a_voluntary",
        items: ["name", "mobile", "appointment"],
        vendors: ["SMS gateway"],
        retention: "Enquiries and leads",
      },
      {
        key: "treatment",
        name: { en: "Provide consultation and treatment", hi: "परामर्श और इलाज देना" },
        description: { en: "Examine you, keep your medical record and give treatment.", hi: "आपकी जाँच करना, आपका मेडिकल रिकॉर्ड रखना और इलाज देना।" },
        basis: "s7a_voluntary",
        items: ["name", "dob", "gender", "mobile", "address", "health_history", "prescriptions"],
        retention: "Patient medical records",
      },
      {
        key: "billing",
        name: { en: "Billing and payments", hi: "बिलिंग और भुगतान" },
        description: { en: "Issue bills and receipts and keep tax records.", hi: "बिल और रसीद देना और टैक्स रिकॉर्ड रखना।" },
        basis: "s7a_voluntary",
        items: ["name", "mobile", "payment_ref"],
        vendors: ["Razorpay"],
        retention: "Tax invoices and accounts",
      },
      common.whatsappOffers,
      common.website,
      common.analytics,
    ],
    vendors: [V.hosting, V.sms, V.razorpay, V.whatsapp, V.analytics, V.workspace],
    retention: [
      { category: "Patient medical records", categoryHi: "मरीज़ों के मेडिकल रिकॉर्ड", lawRef: "IMC (Professional Conduct) Regulations 2002, reg. 1.3.1: 3 years [verify]", periodDays: 1095, trigger: "last_interaction", action: "review" },
      R.invoices,
      R.enquiries,
      R.marketing,
      R.logs,
      R.analytics,
      R.consentProof,
    ],
  },

  coaching: {
    sector: "coaching",
    label: { en: "Coaching centre or tuition", hi: "कोचिंग सेंटर या ट्यूशन" },
    goodsServices: { en: "Coaching classes, study material and tests.", hi: "कोचिंग क्लास, अध्ययन सामग्री और टेस्ट।" },
    childrenMode: true,
    identifiers: ["mobile", "student_id"],
    exemptionNote: {
      en: "The Fourth Schedule (Rule 12) exempts some tracking by educational institutions for educational activities or safety. Whether a coaching centre counts, and how far, is for your lawyer to decide.",
      hi: "चौथी अनुसूची (नियम 12) शैक्षणिक संस्थानों को शैक्षणिक गतिविधियों या सुरक्षा के लिए कुछ ट्रैकिंग की छूट देती है। कोचिंग सेंटर इसमें आता है या नहीं, और कितना, यह आपका वकील तय करेगा।",
    },
    purposes: [
      {
        key: "admission_enquiry",
        name: { en: "Answer admission enquiries", hi: "एडमिशन की पूछताछ का जवाब देना" },
        description: { en: "Call or message you about courses, batches and fees you asked about.", hi: "आपके पूछे गए कोर्स, बैच और फ़ीस के बारे में कॉल या संदेश करना।" },
        basis: "s7a_voluntary",
        items: ["student_name", "student_class", "parent_name", "parent_mobile"],
        retention: "Enquiries and leads",
      },
      {
        key: "classes",
        name: { en: "Run classes and tests", hi: "क्लास और टेस्ट चलाना" },
        description: { en: "Enrol the student, track attendance and test results and collect fees.", hi: "छात्र का नामांकन करना, उपस्थिति और टेस्ट के परिणाम रखना और फ़ीस लेना।" },
        basis: "s7a_voluntary",
        items: ["student_name", "student_class", "parent_name", "parent_mobile", "attendance_scores", "payment_ref"],
        vendors: ["Razorpay"],
        retention: "Student records",
      },
      {
        key: "parent_updates",
        name: { en: "Send progress updates to parents", hi: "माता-पिता को प्रगति की जानकारी भेजना" },
        description: { en: "Share attendance and test results with the parent or guardian on WhatsApp or SMS.", hi: "WhatsApp या SMS पर माता-पिता या अभिभावक को उपस्थिति और टेस्ट के परिणाम भेजना।" },
        basis: "consent",
        items: ["parent_name", "parent_mobile", "attendance_scores"],
        vendors: ["WhatsApp Business API provider"],
        retention: "Student records",
      },
      common.whatsappOffers,
      common.website,
    ],
    vendors: [V.hosting, V.razorpay, V.whatsapp, V.sms],
    retention: [
      { category: "Student records", categoryHi: "छात्रों के रिकॉर्ड", lawRef: "Business choice: 3 years after the course ends", periodDays: 1095, trigger: "purpose_complete", action: "erase" },
      R.invoices,
      R.enquiries,
      R.marketing,
      R.logs,
      R.consentProof,
    ],
  },

  d2c: {
    sector: "d2c",
    label: { en: "Online store (D2C, Shopify, WooCommerce)", hi: "ऑनलाइन स्टोर (D2C, Shopify, WooCommerce)" },
    goodsServices: { en: "Sale and delivery of products ordered online.", hi: "ऑनलाइन ऑर्डर किए गए सामान की बिक्री और डिलीवरी।" },
    childrenMode: false,
    identifiers: ["email", "mobile", "order_id"],
    purposes: [
      {
        key: "orders",
        name: { en: "Process and deliver your orders", hi: "आपके ऑर्डर प्रोसेस करना और पहुँचाना" },
        description: { en: "Take payment, ship your order, handle returns and keep invoices.", hi: "भुगतान लेना, ऑर्डर भेजना, रिटर्न संभालना और इनवॉइस रखना।" },
        basis: "s7a_voluntary",
        items: ["name", "mobile", "email", "delivery_address", "order_details", "payment_ref"],
        vendors: ["Shopify", "Razorpay", "Courier partner"],
        retention: "Tax invoices and accounts",
      },
      {
        key: "marketing_email",
        name: { en: "Send offers by email", hi: "ईमेल से ऑफ़र भेजना" },
        description: { en: "Email you about new products and sales. You can unsubscribe at any time.", hi: "नए प्रोडक्ट और सेल के बारे में ईमेल भेजना। आप कभी भी अनसब्सक्राइब कर सकते हैं।" },
        basis: "consent",
        items: ["name", "email"],
        retention: "Marketing contact list",
      },
      common.whatsappOffers,
      {
        key: "ads",
        name: { en: "Show you relevant ads", hi: "आपको प्रासंगिक विज्ञापन दिखाना" },
        description: { en: "Use advertising cookies to show you our ads on other websites.", hi: "दूसरी वेबसाइटों पर हमारे विज्ञापन दिखाने के लिए विज्ञापन कुकी का उपयोग करना।" },
        basis: "consent",
        items: ["cookie_id", "pages_visited"],
        isTracking: true,
        retention: "Analytics data",
      },
      common.website,
      common.analytics,
    ],
    vendors: [V.hosting, V.shopify, V.razorpay, V.courier, V.whatsapp, V.analytics],
    retention: [R.invoices, R.marketing, R.logs, R.analytics, R.consentProof],
  },

  agent: {
    sector: "agent",
    label: { en: "Real estate, insurance or loan agent", hi: "रियल एस्टेट, बीमा या लोन एजेंट" },
    goodsServices: { en: "Advice and help with property, insurance or loans.", hi: "प्रॉपर्टी, बीमा या लोन में सलाह और मदद।" },
    childrenMode: false,
    identifiers: ["mobile", "email"],
    purposes: [
      {
        key: "enquiry_followup",
        name: { en: "Follow up on your enquiry", hi: "आपकी पूछताछ पर संपर्क करना" },
        description: { en: "Call or message you about the property, policy or loan you asked about.", hi: "आपकी पूछी गई प्रॉपर्टी, पॉलिसी या लोन के बारे में कॉल या संदेश करना।" },
        basis: "s7a_voluntary",
        items: ["name", "mobile", "email", "requirement", "property_pref", "policy_details"],
        retention: "Enquiries and leads",
      },
      {
        key: "call_recording",
        name: { en: "Record calls for quality", hi: "गुणवत्ता के लिए कॉल रिकॉर्ड करना" },
        description: { en: "Record follow-up calls to check what was agreed.", hi: "जो तय हुआ उसकी जाँच के लिए फ़ॉलो-अप कॉल रिकॉर्ड करना।" },
        basis: "consent",
        items: ["mobile", "call_recording"],
        retention: "Enquiries and leads",
      },
      common.whatsappOffers,
      common.website,
    ],
    vendors: [V.hosting, V.whatsapp, V.workspace],
    retention: [R.enquiries, R.marketing, R.logs, R.consentProof],
  },

  ca_firm: {
    sector: "ca_firm",
    label: { en: "CA, CS or tax practitioner", hi: "CA, CS या टैक्स प्रैक्टिशनर" },
    goodsServices: { en: "Accounting, tax filing, audit and compliance services.", hi: "अकाउंटिंग, टैक्स फ़ाइलिंग, ऑडिट और अनुपालन सेवाएँ।" },
    childrenMode: false,
    identifiers: ["email", "mobile", "customer_id"],
    purposes: [
      {
        key: "client_services",
        name: { en: "Provide tax and compliance services", hi: "टैक्स और अनुपालन सेवाएँ देना" },
        description: { en: "Prepare and file returns, maintain accounts and represent you before authorities.", hi: "रिटर्न तैयार और फ़ाइल करना, खाते रखना और प्राधिकरणों के सामने आपका प्रतिनिधित्व करना।" },
        basis: "s7a_voluntary",
        items: ["name", "pan", "gstin", "email", "mobile", "address", "bank_details", "income_details"],
        vendors: ["Google Workspace", "Accounting software"],
        retention: "Client files",
      },
      {
        key: "due_date_reminders",
        name: { en: "Send due-date reminders", hi: "नियत तारीख़ के रिमाइंडर भेजना" },
        description: { en: "Remind you of tax and filing deadlines.", hi: "टैक्स और फ़ाइलिंग की अंतिम तारीख़ याद दिलाना।" },
        basis: "consent",
        items: ["name", "email", "whatsapp"],
        vendors: ["WhatsApp Business API provider"],
        retention: "Marketing contact list",
      },
      common.website,
    ],
    vendors: [V.hosting, V.workspace, V.tally, V.whatsapp],
    retention: [
      { category: "Client files", categoryHi: "क्लाइंट फ़ाइलें", lawRef: "Income-tax Rules, Rule 6F: 6 years [verify]", periodDays: 2190, trigger: "purpose_complete", action: "review" },
      R.invoices,
      R.marketing,
      R.logs,
      R.consentProof,
    ],
  },

  other: {
    sector: "other",
    label: { en: "Other small business", hi: "अन्य छोटा व्यवसाय" },
    goodsServices: { en: "", hi: "" },
    childrenMode: false,
    identifiers: ["email", "mobile"],
    purposes: [
      {
        key: "contact_form",
        name: { en: "Answer your enquiries", hi: "आपकी पूछताछ का जवाब देना" },
        description: { en: "Reply to messages you send through our contact form, email or phone.", hi: "संपर्क फ़ॉर्म, ईमेल या फ़ोन से भेजे गए आपके संदेशों का जवाब देना।" },
        basis: "s7a_voluntary",
        items: ["name", "email", "mobile", "messages"],
        retention: "Enquiries and leads",
      },
      common.whatsappOffers,
      common.website,
    ],
    vendors: [V.hosting, V.workspace, V.whatsapp],
    retention: [R.enquiries, R.marketing, R.logs, R.consentProof],
  },
};

export function getPreset(sector: string): SectorPreset {
  return SECTOR_PRESETS[(SECTORS as readonly string[]).includes(sector) ? (sector as Sector) : "other"];
}
