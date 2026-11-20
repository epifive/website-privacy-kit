---
title: "DPDP Consent Banner: What Indian Websites Need in 2027"
meta_description: "How a consent banner can help an Indian website meet DPDP Act 2023 and DPDP Rules 2025 requirements: notice, purpose toggles, reject, withdraw, proof."
slug: dpdp-consent-banner
path: /dpdp/dpdp-consent-banner
lang: en
primary_keyword: DPDP consent banner
secondary_keywords:
  - DPDP cookie banner
  - consent banner India
  - DPDP Act consent requirements
  - withdraw consent DPDP
  - Google Consent Mode v2 India
last_reviewed: 2026-11-19
alternate: null
sources:
  - https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf
  - https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf
  - https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa
  - https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf
---

> Not legal advice. This page explains the law in general terms. Talk to a qualified lawyer about your business.

# DPDP consent banner: what an Indian website should show

Most Indian business websites collect some personal data: a contact form, a WhatsApp click-to-chat number, an appointment request, analytics that use an identifier, or a newsletter sign-up. From **13 May 2027**, the consent and notice duties in the Digital Personal Data Protection Act, 2023 (the "Act") and the DPDP Rules, 2025 (G.S.R. 846(E)) apply to most of this processing ([Rule 1(4)](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)).

A consent banner is one practical way to ask for consent on a website. This page explains what the Act and Rules actually say, what is our interpretation, and what a reasonable banner looks like.

## What the law says about consent

The Act does not mention "cookies" or "banners". It sets rules for consent in general. The key provisions:

- **Quality of consent, s.6(1).** Consent must be "free, specific, informed, unconditional and unambiguous with a clear affirmative action", and limited to the personal data necessary for the specified purpose.
- **Notice first, s.5(1).** Every request for consent must be "accompanied or preceded by a notice" that tells the person what personal data will be processed and why, how to withdraw consent and raise a grievance, and how to complain to the Data Protection Board of India.
- **Notice content, Rule 3.** The notice must be understandable on its own, give an **itemised description** of the personal data, the specified purposes and the goods, services or uses enabled, and the link and other means to withdraw consent, exercise rights and complain to the Board ([Rule 3(a)–(c)](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)).
- **Language, s.5(3) and s.6(3).** The person must have the option to read the notice and the consent request in English or any language in the Eighth Schedule to the Constitution. The consent request must be in clear and plain language and give the contact details of the person authorised to respond (or a Data Protection Officer, where applicable).
- **Withdrawal, s.6(4).** Where consent is the basis, the person may withdraw "at any time, with the ease of doing so being comparable to the ease with which such consent was given". After withdrawal, the business must cease processing, and cause its processors to cease, within a reasonable time, unless the law requires or authorises the processing (s.6(6)).
- **Proof, s.6(10).** If a question arises in a proceeding, the business (the Data Fiduciary) must prove that a notice was given and that consent was given.
- **Children, s.9.** A child is anyone under 18 (s.2(f)). Verifiable parental consent is needed before processing a child's data (s.9(1), Rule 10), and the business must not undertake "tracking or behavioural monitoring of children or targeted advertising directed at children" (s.9(3)), subject to the limited exemptions in Rule 12 and the Fourth Schedule.

## What this means for a banner (our interpretation)

The points below are **interpretation**, not text from the Act. They follow from s.6(1) and s.6(4) and are what we recommend to customers.

1. **No pre-ticked boxes.** "Clear affirmative action" suggests that optional purposes such as analytics, marketing or advertising should start switched off.
2. **Reject should be as easy as Accept.** If accepting takes one click, refusing should also take one click, with a button of similar size and visibility. Hiding "Reject" behind a settings page makes consent less "free" and less "unambiguous".
3. **No "by continuing to browse you agree".** Scrolling or staying on a page is not a clear affirmative action.
4. **Purpose-wise choices.** Consent must be "specific" and "limited to such personal data as is necessary". Group choices by purpose (for example analytics, marketing messages, advertising), not one blanket "I agree".
5. **A way back in.** A small "Privacy choices" link or button on every page lets people change or withdraw consent as easily as they gave it (s.6(4)).
6. **Load scripts only after consent.** Analytics, advertising pixels and chat widgets that collect personal data should not fire before the person has chosen.
7. **Keep a record.** Store which notice version and language the person saw, what they chose, when, and through which channel. This is how you can meet the burden of proof in s.6(10). The Rules do not prescribe a log format.

### What about cookies?

There is **no cookie-specific rule** in the DPDP Act or the DPDP Rules. Our interpretation: where a cookie or similar identifier is personal data (it relates to an identifiable individual), processing it needs consent unless a legitimate use under s.7 applies. Purely technical items that do not relate to an identifiable person may fall outside the Act. A lawyer can help you sort your own scripts into these groups.

### Google Consent Mode v2

If you use Google Analytics or Google Ads, Consent Mode v2 lets those tags run in a restricted mode until the visitor chooses. A banner can set the default to "denied" and update it to "granted" only for the purposes the visitor accepted. This is a Google product setting, not a DPDP requirement, but it fits the "nothing before consent" approach.

## Banner checklist

| Item | Legal hook | Done? |
|---|---|---|
| Short notice text with a link to a full, standalone notice | s.5(1); Rule 3(a) | |
| Itemised list of personal data per purpose in the full notice | Rule 3(b)(i) | |
| Purposes and the goods, services or uses they enable | Rule 3(b)(ii) | |
| "Accept all", "Reject all" and "Choose" with equal weight | s.6(1) (interpretation) | |
| Optional purposes off by default | s.6(1) (interpretation) | |
| Language switch (at least English and the language your customers read, such as Hindi) | s.5(3); s.6(3) | |
| Contact of the person who answers privacy questions | s.6(3); Rule 9 | |
| Persistent "Privacy choices" link to change or withdraw | s.6(4); Rule 3(c)(i) | |
| Links to exercise rights and to complain to the Board | Rule 3(c)(ii)–(iii) | |
| Consent record with notice version, language, time and channel | s.6(10) | |
| Under-18 handling: no tracking, behavioural monitoring or targeted ads | s.9(3) | |
| Scripts blocked until consent; Consent Mode default "denied" | s.6(1) (interpretation) | |

## Forms count too

Many small businesses collect more personal data through **forms** (enquiries, bookings, admissions) than through browsing. A form that asks for consent, for example for WhatsApp marketing, also needs a notice and an unticked checkbox per optional purpose. Data given voluntarily for a booking may fall under s.7(a), but later marketing is a separate purpose. See our [DPDP checklist for small business](/dpdp/dpdp-checklist-small-business-2027) and the [privacy notice format in Hindi](/dpdp/dpdp-privacy-notice-format-hindi).

## FAQ

**Is a cookie banner mandatory under the DPDP Act?**
The Act does not name banners or cookies. It requires notice and valid consent where consent is the basis for processing (s.5, s.6). A banner is a common and practical way to do that on a website.

**Can I use "implied consent" if visitors keep browsing?**
Section 6(1) asks for a "clear affirmative action". Continued browsing is unlikely to meet that test, in our reading.

**Does the banner have to be in Hindi?**
Section 5(3) and s.6(3) require the option to access the notice and request in English or any Eighth Schedule language. Whether you need all 22 languages is not settled, and the Board has not issued guidance. Offering the languages your customers actually use, such as Hindi, is a sensible start.

**How long should I keep consent records?**
The Rules do not set a period for consent proof. Rule 8(3) requires keeping personal data, traffic data and processing logs for at least one year from the processing. Many businesses keep consent proof longer, for as long as they may need to prove consent. Ask your lawyer.

**Is a consent banner the same as a Consent Manager?**
No. A Consent Manager is a company registered with the Board under s.6(9) and Rule 4. A banner used by one business on its own website is a different thing. See [Consent Manager vs consent tool](/dpdp/consent-manager-vs-consent-tool).

**What happens if I get it wrong?**
The Board can inquire (s.28) and, if it finds a significant breach, impose a penalty (s.33); for breaches not listed separately it "may extend to fifty crore rupees".

## Next steps

- Take the [free DPDP readiness check](/readiness): 3 minutes, Hindi or English.
- In this kit: a purpose-wise banner, preference centre, Hindi and English notices and a consent log. Add the banner from [Dashboard, Websites](/dashboard/sites).

Related: [DPDP 13 May 2027 countdown](/dpdp/dpdp-deadline-13-may-2027) · [Data principal request reply templates](/dpdp/data-principal-request-reply-templates) · [DPDP for Shopify and WooCommerce stores](/dpdp/dpdp-for-shopify-woocommerce-stores)

---

*Not legal advice. This page summarises the DPDP Act, 2023 and the DPDP Rules, 2025 as read on 19 Nov 2026 and may not fit your situation. EpiFive Website Privacy Kit is software that helps you organise DPDP tasks; it is not a Consent Manager registered with the Data Protection Board of India. It helps you meet DPDP requirements but does not make you compliant on its own.*

**Official sources:** [DPDP Act, 2023 (MeitY)](https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf) · [DPDP Rules, 2025 (MeitY)](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf) · [Rules index page](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa) · [PIB explainer, 17 Nov 2025](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf)
