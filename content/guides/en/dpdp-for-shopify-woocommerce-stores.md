---
title: "DPDP for Shopify and WooCommerce Stores in India"
meta_description: "DPDP guide for Indian D2C stores on Shopify or WooCommerce: consent banner, checkout and marketing consent, old customers, vendors and retention."
slug: dpdp-for-shopify-woocommerce-stores
path: /dpdp/dpdp-for-shopify-woocommerce-stores
lang: en
primary_keyword: DPDP for Shopify store
secondary_keywords:
  - DPDP WooCommerce
  - DPDP ecommerce India
  - DPDP D2C brand
  - DPDP cookie consent Shopify
  - DPDP abandoned cart WhatsApp
last_reviewed: 2026-11-19
alternate: null
sources:
  - https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf
  - https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf
  - https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf
  - https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf
---

> Not legal advice. This page explains the law in general terms. Talk to a qualified lawyer about your business.

# DPDP for Shopify and WooCommerce stores

If you run a D2C store on Shopify, WooCommerce or a similar platform and sell to customers in India, you are a **Data Fiduciary** under the Digital Personal Data Protection Act, 2023. The Act also applies to processing outside India if it is connected with offering goods or services to people in India (s.3(b)). Most duties start on **13 May 2027** (Rule 1(4)).

This guide covers what matters most for an online store: the banner, checkout and marketing consent, your existing customer list, the apps and vendors you use, and retention.

## Who is responsible: you or Shopify?

You decide what data to collect and why, so **you are the Data Fiduciary**. Shopify, your WooCommerce host, payment gateway, courier aggregator, email tool and WhatsApp or SMS provider process data for you, so they are usually **Data Processors**.

Two rules follow:

- You may use a Data Processor "only under a valid contract" (s.8(2)), and the contract should cover security safeguards (Rule 6(1)(f)). For big platforms this is usually their data processing terms; check that you have accepted them and keep a copy.
- You remain responsible for processing done on your behalf, "irrespective of any agreement to the contrary" (s.8(1)).

Some partners, such as a marketplace or a payment aggregator acting under its own regulatory duties, may be separate Data Fiduciaries for their part. Your lawyer can help you classify each one.

## Consent banner and tracking

The Act has no cookie-specific rule. Our reading (not legal advice): cookies, pixels and similar identifiers that are personal data need consent unless a legitimate use applies. For a store this usually means:

- Analytics, Meta and Google ad pixels, heatmaps and retargeting tags should load **only after consent**, with toggles off by default (s.6(1)).
- "Reject all" should be as easy to find as "Accept all".
- Visitors should be able to change their choice later, as easily as they gave it (s.6(4)).
- Record each choice with the notice version and language, because you must be able to prove consent (s.6(10)).

Many stores use Google Consent Mode with a default of "denied" until the visitor chooses. See [DPDP consent banner](/dpdp/dpdp-consent-banner) for a fuller guide.

## Checkout: what needs consent and what does not

Section 7(a) allows processing of data a customer "voluntarily provided" for a specified purpose, as long as she has not said she does not consent. When a customer enters her address and phone number to get an order delivered, processing it to fulfil that order can fall under s.7(a) (confirm with your lawyer).

The Act's own illustration under s.6(5) is an online store: if a customer withdraws consent, the store may stop letting her place new orders, "but may not stop the processing for supply of the goods already ordered and paid for".

What usually needs separate, unticked consent:

| Activity | Typical basis (our reading) |
|---|---|
| Order confirmation, shipping and delivery updates | s.7(a) voluntarily provided |
| Invoice and tax records | s.7(a) plus legal retention duties |
| Newsletter and offer emails | Consent |
| WhatsApp or SMS marketing | Consent; promotional SMS also under TRAI TCCCPR |
| Abandoned-cart reminders | Consent is the safer route; ask your lawyer |
| Sharing data with a brand partner for its own marketing | Consent for that specific purpose |
| Ad retargeting pixels | Consent |

Do not pre-tick the marketing box at checkout, and do not make marketing consent a condition of buying. Consent must be "free" and "unconditional" (s.6(1)).

## Your existing customer list (s.5(2))

If you collected customer data before the Act starts, you must send a notice "as soon as it is reasonably practicable" describing the data, the purpose, how to withdraw and use rights, and how to complain to the Board (s.5(2)). The Act's illustration is an e-commerce store doing this "through email, in-app notification or other effective method".

You may continue processing until the customer withdraws consent (s.5(2)(b)). A short email or WhatsApp message with a link to your full notice and a one-click way to opt out is a practical approach.

## Notice and privacy page

Your notice must itemise the data and purposes (Rule 3(b)), be understandable on its own (Rule 3(a)), and explain withdrawal, rights and the Board complaint route with a link (Rule 3(c)). Offer it in English or an Eighth Schedule language (s.5(3)). Many Indian stores add Hindi. See [DPDP privacy notice format in Hindi](/dpdp/dpdp-privacy-notice-format-hindi).

## Rights requests

Customers can ask for a summary of their data and the names of other Data Fiduciaries and Data Processors you shared it with (s.11), correction or erasure (s.12), grievance redressal (s.13) and nomination (s.14). Publish how to make a request, the identifier you need (order ID, registered mobile or email), a response period not exceeding ninety days (Rule 14(1), 14(3), 14(5)), and your contact person (Rule 9).

Your vendor list does double duty here: it is what you send when someone asks under s.11(1)(b) who their data was shared with.

## Retention and erasure

- Erase data when the purpose is over or consent is withdrawn, unless a law requires you to keep it, and make your processors erase it too (s.8(7)).
- Keep personal data, traffic data and processing logs for **at least one year** from the processing (Rule 8(3)). The Rules' own illustration is an e-book store that must keep order, payment and delivery records for a year even if the customer deletes her account.
- Tax and accounting laws may require longer retention of invoices.

**The Third Schedule does not apply to most stores.** Fixed three-year erasure periods and the 48-hour pre-erasure notice (Rule 8(1)-(2)) apply only to e-commerce entities with **at least two crore registered users in India** (and to large gaming and social media platforms). The Schedule's definition of "e-commerce entity" also excludes a seller offering goods on a marketplace.

## Security and breaches

Rule 6(1) sets minimum safeguards: encryption or masking, access control, logs and monitoring, backups, one-year log retention, contract clauses and organisational measures. For a store, start with two-factor login for every admin, removing ex-staff accounts, limiting app permissions and reviewing installed apps.

If customer data leaks, for example through a compromised plugin, you must inform affected customers without delay (Rule 7(1)) and the Board without delay, with a detailed report within 72 hours (Rule 7(2)). CERT-In expects certain incidents to be reported within 6 hours of noticing (CERT-In Directions). See [breach intimation explained](/dpdp/dpdp-breach-intimation-72-hours-6-hours).

## Store checklist

- [ ] Consent banner with analytics and ad tags blocked until consent.
- [ ] Unticked, separate marketing checkboxes at checkout and signup.
- [ ] Notice in English and Hindi, itemised per purpose.
- [ ] Legacy-customer notice sent to your existing list (s.5(2)).
- [ ] Vendor register: platform, payment gateway, courier, email, WhatsApp/SMS, reviews and loyalty apps, with contract status (s.8(2)).
- [ ] Rights request page with identifiers and response period.
- [ ] One-click unsubscribe in every marketing email and message.
- [ ] Retention schedule, with the one-year Rule 8(3) floor.
- [ ] Admin two-factor login and app permission review.
- [ ] Breach plan with 6-hour and 72-hour timers.

## FAQ

**Shopify is a foreign company. Is that a problem?**
Transfer outside India is allowed subject to restrictions the government may specify (s.16, Rule 15). There is no general data-localisation rule for small stores.

**Do I need a separate consent for COD orders?**
Cash on delivery needs the same delivery data as prepaid orders. The purpose is fulfilling the order.

**Can I keep emailing customers who bought from me in 2025?**
Send them a s.5(2) notice as soon as practicable, with an easy way to opt out, and stop if they withdraw.

**Are marketplace sellers covered?**
Yes, for the personal data they process as Data Fiduciaries. The Third Schedule's large-platform rules exclude a seller on a marketplace.

**Does a WooCommerce plugin make me compliant?**
No plugin can do that on its own. Tools help you show notices, record consent and handle requests. The decisions about purposes and retention are yours.

## Get started

- **Free DPDP readiness check:** 3 minutes, Hindi or English. [Start the readiness check](/readiness).
- **Set up for stores in this kit:** consent banner on Shopify or WooCommerce, checkout consent, notice in English and Hindi, legacy-customer message and registers. Start with the [setup wizard](/dashboard/setup).

Related: [DPDP checklist for small business](/dpdp/dpdp-checklist-small-business-2027) · [DPDP consent banner](/dpdp/dpdp-consent-banner) · [Consent Manager vs consent tool](/dpdp/consent-manager-vs-consent-tool)

---

*Not legal advice. This page reflects the DPDP Act 2023 and DPDP Rules 2025 as read on 19 November 2026. EpiFive Website Privacy Kit is software that helps you organise DPDP tasks; it is not a Consent Manager registered with the Data Protection Board of India. It helps you meet DPDP requirements but does not make you compliant on its own.*
