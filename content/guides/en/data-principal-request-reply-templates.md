---
title: "DPDP Data Principal Request Reply Templates (India)"
meta_description: "How to reply to DPDP access, correction, erasure, nomination and grievance requests, with sample templates, due dates and the Rule 9 contact."
slug: data-principal-request-reply-templates
path: /dpdp/data-principal-request-reply-templates
lang: en
primary_keyword: DPDP data principal request reply template
secondary_keywords:
  - DPDP access request response
  - DPDP erasure request
  - DPDP grievance redressal 90 days
  - DPDP right to nominate
  - DSAR template India
last_reviewed: 2026-11-19
alternate: null
sources:
  - https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf
  - https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf
  - https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa
  - https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf
---

> Not legal advice. This page explains the law in general terms. Talk to a qualified lawyer about your business.

# DPDP data principal request reply templates

Under the Digital Personal Data Protection Act, 2023, the person whose data you hold (the "Data Principal") can ask you for a summary of their data, ask you to correct or erase it, nominate someone, or raise a grievance. From **13 May 2027**, the DPDP Rules, 2025 add practical duties on how you publish the request route and how fast you respond ([Rule 1(4)](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)).

This page lists each right, what the law asks of you, and a short sample reply. The samples use `{{placeholders}}` for your details. They are drafts: have a lawyer review them before use.

## Before any request arrives

- **Publish the route.** Rule 14(1) asks you to publish prominently on your website or app (a) how a person can make a request and (b) the identifier you need to identify them, such as a customer ID, mobile number, email address, enrolment ID or application number (Rule 14(5)).
- **Publish your response period.** Rule 14(3) asks you to publish the period within which you respond to grievances, "not exceeding ninety days", and to put measures in place to meet it. The PIB explainer of 17 Nov 2025 says Data Fiduciaries must address access, correction, updating and erasure requests within a maximum of ninety days. Many businesses choose a shorter target, such as 30 days.
- **Publish a contact.** Rule 9 asks you to publish the business contact of a Data Protection Officer (if applicable) or a person who can answer questions about the processing, and to **mention it in every response** to a rights request.
- **Know your vendors.** For access requests you must name the other Data Fiduciaries and Data Processors you shared data with (s.11(1)(b)). Keep a vendor register.

## The rights and what to send

| Right | Law | What you must do |
|---|---|---|
| Access | s.11 | Give a summary of the personal data and processing activities; the identities of all other Data Fiduciaries and Data Processors you shared it with, with a description of the data shared; and any other prescribed information |
| Correction, completion, updating | s.12(1)–(2) | Correct inaccurate or misleading data, complete incomplete data, update data |
| Erasure | s.12(3); s.8(7) | Erase unless retention is necessary for the specified purpose or for compliance with law; cause your processors to erase |
| Nomination | s.14; Rule 14(4) | Let the person nominate one or more individuals to exercise their rights on death or incapacity |
| Grievance | s.13; Rule 14(3) | Provide readily available means of redress and respond within your published period |

The access and correction rights apply to data processed on consent, including data voluntarily provided under s.7(a). Section 11(2) carves out sharing with a Data Fiduciary authorised by law, made on its written request for preventing, detecting or investigating offences or cyber incidents, or for prosecution or punishment of offences. You do not need to list that sharing in an access reply.

## Sample replies

Every reply below ends with the Rule 9 contact block. Replace the placeholders.

### 1. Acknowledgement (all request types)

```text
Subject: We have received your request ({{request_id}})

Dear {{requester_name}},

We received your {{request_type}} request on {{received_date}}.
To protect your data, we will verify your identity using {{identifier_type}}.
We will respond by {{due_date}}.

Questions about how we process your personal data:
{{contact_role}}, {{business_name}}
{{contact_email}} | {{contact_phone}}
```

### 2. Access (s.11)

```text
Subject: Your personal data summary ({{request_id}})

Dear {{requester_name}},

1. Personal data we process about you: {{data_summary}}
2. What we do with it: {{processing_activities}}
3. Others we have shared it with, and what we shared:
   {{#recipients}}- {{recipient_name}} ({{recipient_role}}): {{data_shared}}
   {{/recipients}}

[Rule 9 contact block]
```

### 3. Correction, completion or updating (s.12(2))

```text
Dear {{requester_name}},

We have {{corrected/completed/updated}} the following on {{action_date}}:
{{field_changes}}
We have also asked our service providers who hold this data to update it.

[Rule 9 contact block]
```

### 4. Erasure (s.12(3), s.8(7))

```text
Dear {{requester_name}},

We have erased {{erased_items}} on {{action_date}} and instructed
{{processor_names}} to erase the copies they hold.

We must keep {{retained_items}} until {{retain_until}} because
{{legal_reason}} (for example, tax records or the one-year retention
of processing logs under Rule 8(3) of the DPDP Rules, 2025).
We will not use it for any other purpose.

[Rule 9 contact block]
```

### 5. Nomination (s.14, Rule 14(4))

```text
Dear {{requester_name}},

We have recorded {{nominee_name}} as your nominee on {{action_date}}.
If you die or become unable to exercise your rights, your nominee may do so
on your behalf. You can change or cancel this nomination at {{rights_url}}.

[Rule 9 contact block]
```

### 6. Grievance closure (s.13)

```text
Dear {{requester_name}},

About your grievance received on {{received_date}}: {{summary_of_issue}}.
What we found: {{findings}}
What we have done: {{actions}}

If you are not satisfied, you may complain to the Data Protection Board
of India: {{board_complaint_info}}.

[Rule 9 contact block]
```

Section 13(3) says the person must exhaust your grievance route before approaching the Board. A clear closure letter that also explains the Board route is good practice.

## Handling tips

1. **Verify, but do not over-collect.** Ask only for the identifier you published under Rule 14(1)(b). Do not demand Aadhaar copies when a registered mobile or email OTP is enough.
2. **Diary the due date** on the day the request arrives, and set reminders a week and a day before.
3. **Erasure is not always total.** Section 12(3) lets you keep data needed for the specified purpose or for compliance with law. Rule 8(3) also requires keeping personal data, traffic data and logs of processing for at least one year from the processing, for the purposes in the Seventh Schedule. Explain what you keep and why.
4. **Tell your processors.** Section 8(7)(b) asks you to cause your Data Processors to erase data you gave them. Keep a record that you did.
5. **Withdrawal is separate.** A person who withdraws consent (s.6(4)) is not necessarily asking for erasure, but s.8(7)(a) asks you to erase on withdrawal unless the law requires retention.
6. **Ordinary SMBs have no fixed erasure clock.** The Third Schedule erasure periods and the 48-hour pre-erasure notice in Rule 8(1)–(2) apply only to large e-commerce, online gaming and social media platforms.
7. **Keep a log** of each request, the dates and the reply. It helps if a grievance reaches the Board.

## FAQ

**How many days do I have to reply?**
Rule 14(3) refers to a period "not exceeding ninety days" for grievances, and the PIB explainer applies ninety days to access, correction, updating and erasure requests. Publish your own period, which can be shorter.

**Do I need a Data Protection Officer to answer requests?**
Only Significant Data Fiduciaries notified under s.10 must appoint a DPO. Other businesses need a named contact person who can answer (s.8(9), Rule 9).

**Can I refuse an erasure request?**
You may keep data where retention is necessary for the specified purpose or required by law (s.12(3), s.8(7)). Tell the person what you kept, why and until when.

**Can a parent make requests for a child?**
Under s.2(j), the Data Principal includes the parent or lawful guardian of a child. Verify the parent as you would for consent.

**Can I charge a fee?**
The Act and Rules do not provide for a fee. Ask your lawyer before charging anything.

## Next steps

- Take the [free DPDP readiness check](/readiness): 3 minutes, Hindi or English.
- EpiFive Website Privacy Kit includes a request form with email verification, an inbox with due dates and reply templates in Hindi and English that insert your Rule 9 contact (Dashboard, Rights requests).

Related: [DPDP checklist for small business](/dpdp/dpdp-checklist-small-business-2027) · [Breach intimation: 72 hours and 6 hours](/dpdp/dpdp-breach-intimation-72-hours-6-hours) · [DPDP for clinics](/dpdp/dpdp-for-clinics) · [DPDP 13 May 2027 countdown](/dpdp/dpdp-deadline-13-may-2027)

---

*Not legal advice. The sample replies are drafts pending review by a qualified lawyer and may not fit your situation. This page summarises the DPDP Act, 2023 and the DPDP Rules, 2025 as read on 19 Nov 2026. EpiFive Website Privacy Kit is software that helps you organise DPDP tasks; it is not a Consent Manager registered with the Data Protection Board of India.*

**Official sources:** [DPDP Act, 2023 (MeitY)](https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf) · [DPDP Rules, 2025 (MeitY)](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf) · [Rules index page](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa) · [PIB explainer, 17 Nov 2025](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf)
