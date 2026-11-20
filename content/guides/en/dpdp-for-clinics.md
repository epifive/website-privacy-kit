---
title: "DPDP for Clinics, Labs and Physios: A Practical Guide"
meta_description: "How the DPDP Act and Rules apply to Indian clinics, diagnostic labs and physiotherapists: patient notices, WhatsApp reminders, minors and requests."
slug: dpdp-for-clinics
path: /dpdp/dpdp-for-clinics
lang: en
primary_keyword: DPDP for clinics
secondary_keywords:
  - DPDP Act healthcare India
  - DPDP diagnostic lab
  - patient data privacy India
  - DPDP WhatsApp appointment reminders
  - DPDP physiotherapy clinic
last_reviewed: 2026-11-19
alternate: null
sources:
  - https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf
  - https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf
  - https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf
  - https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf
---

> Not legal advice. This page explains the law in general terms. Talk to a qualified lawyer about your business.

# DPDP for clinics, diagnostic labs and physiotherapists

A small clinic handles some of the most personal data any business holds: names, phone numbers, symptoms, prescriptions, reports, and often children's details. Under the Digital Personal Data Protection Act, 2023 and the DPDP Rules, 2025, the clinic is a **Data Fiduciary** for this data. Most of the duties below apply from **13 May 2027** (Rule 1(4)).

Until then, the IT Act s.43A and the SPDI Rules 2011, which already treat medical records as sensitive data, continue to apply (Act s.44(2)).

This guide is for GP clinics, dental and eye clinics, diagnostic and pathology labs, physiotherapists and similar practices that use a website, online booking, a practice-management app or WhatsApp.

## What counts as personal data in a clinic

Anything that identifies a patient, in digital form or digitised later (s.3(a)): the appointment register, the billing software, scanned prescriptions, lab reports in email, WhatsApp chats, CCTV footage, and website enquiry forms. A paper register is covered once it is typed or scanned into a system.

The DPDP Act does not create a separate "sensitive data" category, but the Board considers "the type and nature of the personal data affected" when deciding a penalty (s.33(2)(b)). Health data deserves your strongest care.

## Consent or legitimate use?

Not everything needs a consent click.

- **Voluntarily provided data (s.7(a)).** When a patient gives details for a specific purpose, such as booking an appointment or getting a receipt, and has not objected, you may process it for that purpose. The Act's own illustration is a pharmacy sending a payment receipt by SMS.
- **Medical emergency (s.7(f)).** Processing to respond to "a medical emergency involving a threat to the life or immediate threat to the health" of a person.
- **Epidemic or public-health threat (s.7(g)).** Measures to provide treatment or health services during an epidemic or outbreak.

These are narrow. s.7(f) and (g) cover emergencies and public-health situations, not routine marketing or general record-keeping. Marketing messages, health-tip newsletters, reviews requests and website analytics usually need **consent** with a proper notice (s.5, s.6).

## WhatsApp and SMS reminders

Appointment reminders on WhatsApp are common and patients like them. Points to check:

- **Purpose split.** "Reminders for my booked appointment" and "offers and health camps" are different purposes. Ask separately, with unticked options (s.6(1)).
- **Withdrawal.** A patient who opted in with one tap should be able to opt out as easily, for example by replying STOP or using a link (s.6(4)).
- **Vendors.** Your WhatsApp Business API provider, SMS gateway and practice software are Data Processors. Use them only under a valid contract with security clauses (s.8(2), Rule 6(1)(f)).
- **Promotional SMS** also has to follow TRAI's TCCCPR rules (DLT registration, templates and consent).

## Children and the Fourth Schedule

A child is anyone under 18 (s.2(f)). Normally you need verifiable consent of a parent before processing a child's data (s.9(1), Rule 10), and you must not track, behaviourally monitor or target ads at children (s.9(3)).

The Fourth Schedule, Part A, gives a **limited** exemption from s.9(1) and s.9(3):

| Item | Who | Condition |
|---|---|---|
| 1 | Clinical establishment, mental health establishment, healthcare professional | Processing restricted to providing health services to the child, to the extent necessary for the protection of her health |
| 2 | Allied healthcare professional | Processing restricted to supporting a treatment and referral plan recommended by such professional, to the extent necessary for the protection of her health |

What this means in practice (our reading, not legal advice):

- Treating a child and keeping the clinical record can fall within the exemption.
- Sending marketing to the child, running ad-tracking on the child, or using the data for anything beyond health services is **outside** the exemption and needs parental consent, and tracking or targeted ads directed at children are not allowed at all.
- The terms "clinical establishment", "healthcare professional" and "allied healthcare professional" take their meaning from the Clinical Establishments Act 2010 and the NCAHP Act 2021 (Fourth Schedule note). Check with your lawyer whether your practice fits.

Most parents are present at the visit anyway, so collecting the parent's consent at registration is often simple.

## Patient rights requests

Patients can ask for:

- a summary of their data and processing, and the names of other Data Fiduciaries and Data Processors you shared it with (s.11);
- correction, completion, updating or erasure (s.12);
- grievance redressal (s.13);
- nomination of someone to act for them on death or incapacity (s.14).

Publish how to make a request and which identifier you need, such as the patient ID or registered mobile (Rule 14(1), 14(5)). Publish a response period not exceeding ninety days (Rule 14(3)), and include your contact person in every reply (Rule 9).

**Erasure is not automatic.** You may keep data where retention "is necessary for the specified purpose or for compliance with any law" (s.12(3)). Medical-record retention rules that apply to your practice, and the one-year minimum in Rule 8(3), can require you to keep records. Tell the patient what you keep and why.

## Breaches

A lost laptop, a receptionist's WhatsApp sent to the wrong group, or ransomware on the billing PC can all be a "personal data breach" (s.2(u)). There is no minimum size. You must inform each affected patient without delay (Rule 7(1)) and the Board without delay, with a detailed report within 72 hours (Rule 7(2)). CERT-In expects certain incidents, such as ransomware and data breaches, to be reported within 6 hours of noticing (CERT-In Directions, 28 Apr 2022). See [breach intimation explained](/dpdp/dpdp-breach-intimation-72-hours-6-hours).

## Clinic checklist

- [ ] Map data: booking form, register, billing, lab software, WhatsApp, CCTV.
- [ ] Notice in English and Hindi (or your patients' language) with itemised data per purpose (Rule 3, s.5(3)).
- [ ] Separate, unticked consent for marketing and reminders beyond the booked visit.
- [ ] Parent consent flow for patients under 18, except where the Fourth Schedule health-services exemption applies.
- [ ] No ad pixels or tracking on pages aimed at children.
- [ ] Contracts with WhatsApp/SMS provider, practice software, lab software, hosting (s.8(2)).
- [ ] Staff logins (no shared passwords), two-factor login, encrypted backups, access logs kept for one year (Rule 6(1)).
- [ ] Rights request process and named contact (Rule 9, Rule 14).
- [ ] Breach plan with 6-hour and 72-hour timers.
- [ ] Retention schedule with the law that requires each period.

## FAQ

**Do I need consent to keep a patient's treatment record?**
Often the patient voluntarily provides data for treatment, which can fall under s.7(a). Laws on medical records may also require you to keep them. Ask your lawyer to confirm the basis for each purpose.

**Can I send health tips to all past patients on WhatsApp?**
Only with consent for that purpose. For patients from before the Act, send a notice under s.5(2) and offer an easy opt-out.

**Does my clinic need a Data Protection Officer?**
No, unless the government notifies you as a Significant Data Fiduciary (s.10). You do need a named contact for privacy questions (Rule 9).

**Can I store patient data on a cloud server outside India?**
The Act allows transfer abroad subject to government restrictions (s.16, Rule 15). Your vendor contract and security still matter.

**What about Google Analytics on my clinic website?**
Analytics cookies and identifiers that are personal data generally need consent (our reading). Use a consent banner with analytics off by default. See [DPDP consent banner](/dpdp/dpdp-consent-banner).

## Get started

- **Free DPDP readiness check:** 3 minutes, Hindi or English. [Start the readiness check](/readiness).
- **Set up for clinics in this kit:** patient notice in English and Hindi, consent banner, booking-form consent, privacy page and registers. Start with the [setup wizard](/dashboard/setup).

Related: [DPDP checklist for small business](/dpdp/dpdp-checklist-small-business-2027) · [DPDP for coaching centres](/dpdp/dpdp-for-coaching-centres) · [Data principal request reply templates](/dpdp/data-principal-request-reply-templates)

---

*Not legal advice. Healthcare is regulated by many laws beyond DPDP; talk to a qualified lawyer about your practice. This page reflects the DPDP Act 2023 and DPDP Rules 2025 as read on 19 November 2026. EpiFive Website Privacy Kit is software that helps you organise DPDP tasks; it is not a Consent Manager registered with the Data Protection Board of India. It helps you meet DPDP requirements but does not make you compliant on its own.*
