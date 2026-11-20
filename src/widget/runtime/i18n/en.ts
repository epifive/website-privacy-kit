/**
 * Banner strings, English (inline in w.js). Source: wpk-content/legal-templates/en/
 * 02-consent-banner.md and 03-preference-centre.md. Template status: draft —
 * pending lawyer review. Not legal advice. Never add "by continuing you agree"
 * wording (C1-03) and never call this a Consent Manager.
 */
export const EN = {
  title: "Your privacy choices",
  body: "{org} would like to use some personal data for the purposes below. Some things are needed to run this website. Everything else is off unless you switch it on. You can change your mind at any time from \"Privacy choices\" at the bottom of the page.",
  summary: "We would like to use: {list}.",
  notice: "Read our full privacy notice: what data, why, who receives it, your rights and how to complain.",
  contact: "Questions? {c}",
  accept: "Accept all",
  reject: "Reject all",
  choose: "Let me choose",
  pcTitle: "Privacy choices for {org}",
  pcIntro: "Switch on only what you are happy with. Your choice is saved for this website on this device. Switching something off is as quick as switching it on.",
  necessary: "Needed to run the website (always on)",
  optional: "Optional (off unless you switch it on)",
  alwaysOn: "Always on",
  on: "On",
  off: "Off",
  details: "What data · Why · Who receives it · How long",
  data: "Data",
  shared: "Shared with",
  keep: "Kept for",
  basis: "Basis",
  save: "Save my choices",
  withdrawAll: "Withdraw all optional consents",
  saved: "Your choices are saved. You can change them any time from \"Privacy choices\".",
  floating: "Privacy choices",
  rights: "Ask for a copy, correction or erasure of your data",
  board: "How to complain to the Data Protection Board of India",
  footer: "Privacy choices are provided by {org} using EpiFive Website Privacy Kit.",
  close: "Close",
  formNotice: "We use the details in this form for: {p}.",
  formSee: "See our privacy notice for what we collect, who receives it, how long we keep it, your rights and how to complain.",
  formAgree: "Yes, I agree to: {p}. (Optional. You can withdraw at any time.)",
  formWithdraw: "To withdraw consent later, use the link in any message from us or visit {u}",
  other: "हिन्दी",
  ageQ: "Are you 18 years or older?",
  ageWhy: "{org} asks this first because the personal data of anyone under 18 is used only with a parent's or guardian's consent.",
  ageYes: "Yes, I am 18 or older",
  ageNo: "No, I am under 18",
  kidTitle: "Ask a parent or guardian",
  kidBody: "Thanks. Because you are under 18, optional uses of your details stay off. A parent or guardian can contact us using the details below.",
  kidBlocked: "Some options are turned off for users under 18. Website statistics, personalised content and advertising cannot be switched on.",
  kidChange: "I answered wrongly",
};

export type Strings = typeof EN;
