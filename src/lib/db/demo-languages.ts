import "server-only";
import type { Kysely } from "kysely";
import type { Database } from "./schema";

/** Translations of the default site texts, so the demo's home page is fully translated. */
const SITE_TEXTS: Record<string, Record<string, string>> = {
  hi: {
    "setting.site_tagline": "भारतीय वेबसाइटों के लिए DPDP सहमति, सूचना और अधिकार अनुरोध",
    "setting.home_hero_title": "मई 2027 से पहले अपनी वेबसाइट की DPDP तैयारी कीजिए",
    "setting.home_hero_subtitle":
      "अंग्रेज़ी और हिंदी में प्राइवेसी नोटिस, उद्देश्य-वार सहमति बैनर, सहमति रिकॉर्ड, अधिकार अनुरोध, ब्रीच रजिस्टर और रिटेंशन शेड्यूल — छोटे व्यवसायों के लिए एक जगह।",
    "setting.footer_text": "भारतीय वेबसाइटों के लिए DPDP सहमति, सूचना और अधिकार अनुरोध। यह कानूनी सलाह नहीं है।",
    "setting.copyright_text": "© {year} {site_name}. सर्वाधिकार सुरक्षित।",
  },
};

interface LanguagePack {
  language: { code: string; name: string; native_name: string; direction: "ltr" | "rtl" };
  translations: Record<string, string>;
}

/** Install the bundled Hindi pack on a demo site (once, guarded by a settings row). */
export async function seedDemoLanguages(db: Kysely<Database>): Promise<void> {
  try {
    await db.insertInto("settings").values({ key: "demo_languages_seeded_at", value: new Date().toISOString() }).execute();
  } catch {
    return;
  }
  const packs = [(await import("../../../languages/hi.json")).default] as LanguagePack[];
  for (const [index, pack] of packs.entries()) {
    const { code, name, native_name, direction } = pack.language;
    const exists = await db.selectFrom("languages").select("code").where("code", "=", code).executeTakeFirst();
    if (exists) continue;
    const rows = Object.entries({ ...pack.translations, ...SITE_TEXTS[code] }).map(([key, value]) => ({ lang: code, key, value }));
    await db.transaction().execute(async (trx) => {
      await trx.insertInto("languages").values({ code, name, native_name, direction, is_active: 1, sort_order: (index + 1) * 10 }).execute();
      for (let i = 0; i < rows.length; i += 200) await trx.insertInto("translations").values(rows.slice(i, i + 200)).execute();
    });
  }
}
