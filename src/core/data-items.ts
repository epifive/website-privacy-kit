/**
 * Catalogue of personal-data items used to build an *itemised* description
 * (DPDP Rules, Rule 3(b)(i)). Each item has an English and a Hindi label.
 * Businesses can add custom items; those must carry both labels (N4).
 */

export interface CatalogueItem {
  key: string;
  en: string;
  hi: string;
  /** Group shown in the dashboard checklist. */
  group: "identity" | "contact" | "health" | "education" | "finance" | "commerce" | "online" | "other";
}

export const DATA_ITEMS: readonly CatalogueItem[] = [
  { key: "name", en: "Name", hi: "नाम", group: "identity" },
  { key: "dob", en: "Date of birth or age", hi: "जन्म तिथि या उम्र", group: "identity" },
  { key: "gender", en: "Gender", hi: "लिंग", group: "identity" },
  { key: "photo", en: "Photograph", hi: "फ़ोटो", group: "identity" },
  { key: "id_number", en: "Identity document number", hi: "पहचान दस्तावेज़ संख्या", group: "identity" },
  { key: "mobile", en: "Mobile number", hi: "मोबाइल नंबर", group: "contact" },
  { key: "whatsapp", en: "WhatsApp number", hi: "WhatsApp नंबर", group: "contact" },
  { key: "email", en: "Email address", hi: "ईमेल पता", group: "contact" },
  { key: "address", en: "Postal address", hi: "डाक पता", group: "contact" },
  { key: "city_pincode", en: "City and PIN code", hi: "शहर और पिन कोड", group: "contact" },
  { key: "health_history", en: "Health complaints and medical history", hi: "स्वास्थ्य संबंधी शिकायतें और चिकित्सा इतिहास", group: "health" },
  { key: "prescriptions", en: "Prescriptions and test reports", hi: "पर्चे और जाँच रिपोर्ट", group: "health" },
  { key: "appointment", en: "Appointment date and time", hi: "अपॉइंटमेंट की तारीख़ और समय", group: "health" },
  { key: "student_name", en: "Student's name", hi: "छात्र का नाम", group: "education" },
  { key: "student_class", en: "Class, school or course", hi: "कक्षा, स्कूल या कोर्स", group: "education" },
  { key: "parent_name", en: "Parent or guardian's name", hi: "माता-पिता या अभिभावक का नाम", group: "education" },
  { key: "parent_mobile", en: "Parent or guardian's mobile number", hi: "माता-पिता या अभिभावक का मोबाइल नंबर", group: "education" },
  { key: "attendance_scores", en: "Attendance and test scores", hi: "उपस्थिति और टेस्ट के अंक", group: "education" },
  { key: "pan", en: "PAN", hi: "पैन (PAN)", group: "finance" },
  { key: "gstin", en: "GSTIN", hi: "GSTIN", group: "finance" },
  { key: "bank_details", en: "Bank account details", hi: "बैंक खाते का विवरण", group: "finance" },
  { key: "income_details", en: "Income and financial documents", hi: "आय और वित्तीय दस्तावेज़", group: "finance" },
  { key: "payment_ref", en: "Payment reference (no card or UPI PIN)", hi: "भुगतान संदर्भ (कार्ड या UPI पिन नहीं)", group: "finance" },
  { key: "order_details", en: "Order and purchase history", hi: "ऑर्डर और खरीदारी का इतिहास", group: "commerce" },
  { key: "delivery_address", en: "Delivery address", hi: "डिलीवरी पता", group: "commerce" },
  { key: "requirement", en: "Your requirement or enquiry details", hi: "आपकी ज़रूरत या पूछताछ का विवरण", group: "commerce" },
  { key: "property_pref", en: "Property preferences and budget", hi: "प्रॉपर्टी की पसंद और बजट", group: "commerce" },
  { key: "policy_details", en: "Insurance or loan details", hi: "बीमा या लोन का विवरण", group: "commerce" },
  { key: "cookie_id", en: "Browser identifier stored in a cookie", hi: "कुकी में रखा ब्राउज़र पहचानकर्ता", group: "online" },
  { key: "ip_address", en: "IP address (shortened)", hi: "IP पता (छोटा किया हुआ)", group: "online" },
  { key: "device_info", en: "Device and browser type", hi: "डिवाइस और ब्राउज़र का प्रकार", group: "online" },
  { key: "pages_visited", en: "Pages visited and clicks", hi: "देखे गए पेज और क्लिक", group: "online" },
  { key: "messages", en: "Messages you send us", hi: "आपके द्वारा भेजे गए संदेश", group: "other" },
  { key: "call_recording", en: "Call recordings", hi: "कॉल रिकॉर्डिंग", group: "other" },
  { key: "feedback", en: "Feedback and reviews", hi: "फ़ीडबैक और समीक्षाएँ", group: "other" },
];

const BY_KEY = new Map(DATA_ITEMS.map((i) => [i.key, i]));

/** A purpose's data item: a catalogue key, or a custom item with both labels. */
export type DataItem = { key: string } | { en: string; hi: string };

export function isCatalogueKey(key: string): boolean {
  return BY_KEY.has(key);
}

export function dataItemLabel(item: DataItem, lang: "en" | "hi"): string {
  if ("key" in item) return BY_KEY.get(item.key)?.[lang] ?? item.key;
  return (lang === "hi" ? item.hi : item.en).trim();
}

/** Parse the JSON stored in `purposes.data_items`, dropping anything malformed. */
export function parseDataItems(json: string | null | undefined): DataItem[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: DataItem[] = [];
  for (const v of raw) {
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.key === "string" && isCatalogueKey(o.key)) out.push({ key: o.key });
      else if (typeof o.en === "string" && o.en.trim()) out.push({ en: o.en.trim().slice(0, 120), hi: typeof o.hi === "string" ? o.hi.trim().slice(0, 120) : "" });
    }
  }
  return out.slice(0, 60);
}
