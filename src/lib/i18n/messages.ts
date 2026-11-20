/**
 * Every interface string shown to visitors, in English. Translations are stored
 * in the database (Admin → Languages) and fall back to these values.
 * Placeholders like {name} are replaced at runtime.
 */
import { PRODUCT_MESSAGES } from "./product-messages";

const BASE_MESSAGES = {
  // Navigation & header
  "nav.features": "Features",
  "nav.dashboard": "Dashboard",
  "nav.signIn": "Sign in",
  "nav.openMenu": "Open menu",
  "nav.closeMenu": "Close menu",
  "nav.accountMenu": "Account menu",
  "nav.myAccount": "My account",
  "nav.admin": "Admin panel",
  "nav.signOut": "Sign out",
  "nav.skipToContent": "Skip to content",
  "nav.language": "Language",
  "footer.product": "Product",
  "footer.resources": "Resources",
  "theme.light": "Light theme",
  "theme.dark": "Dark theme",
  "theme.system": "System theme",
  "theme.switchTo": "Switch to {theme}",

  // Shared controls
  "ui.copy": "Copy",
  "ui.copied": "Copied",

  // Cookie notice
  "cookie.accept": "Accept and close",
  "cookie.privacy": "Privacy policy",
  "cookie.label": "Cookie notice",

  // Maintenance
  "maintenance.title": "{site} will be back soon",
  "maintenance.adminNotice": "Maintenance mode is on. Only administrators can see the site.",

  // Not found
  "notFound.title": "This page doesn't exist",
  "notFound.text": "The link may be broken or the page may have been moved.",
  "notFound.browse": "See features",
  "notFound.home": "Go home",

  // Auth
  "auth.signInTitle": "Sign in",
  "auth.signInSubtitle": "Welcome back to {site}.",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.forgot": "Forgot password?",
  "auth.signIn": "Sign in",
  "auth.signingIn": "Signing in…",
  "auth.demoTitle": "Live demo",
  "auth.demoText": "The demo administrator account is filled in. Press Sign in to explore the admin panel (saving is disabled).",
  "auth.name": "Name",
  "auth.passwordHint": "At least 8 characters.",
  "auth.resetTitle": "Reset your password",
  "auth.resetSubtitle": "Enter your account email and we'll send you a link to choose a new password.",
  "auth.backToSignIn": "Back to sign in",
  "auth.sendLink": "Send reset link",
  "auth.sending": "Sending…",
  "auth.newPasswordTitle": "Choose a new password",
  "auth.newPassword": "New password",
  "auth.setPassword": "Set new password",
  "auth.saving": "Saving…",
  "auth.linkIncompleteTitle": "This reset link is incomplete.",
  "auth.linkIncompleteRich": "Open the link from your email again, or {link}.",
  "auth.requestNew": "request a new one",
  "auth.resetMetaTitle": "Reset password",
  "auth.err.tooManyLogins": "Too many sign-in attempts. Wait 15 minutes and try again.",
  "auth.err.invalidEmail": "Enter a valid email address.",
  "auth.err.passwordLength": "Use at least 8 characters for your password.",
  "auth.err.enterPassword": "Enter your password.",
  "auth.err.wrongCredentials": "The email or password is incorrect.",
  "auth.err.suspended": "This account has been suspended. Contact support for help.",
  "auth.err.enterName": "Enter your name.",
  "auth.err.resetUnavailable": "Password reset by email is not available. Contact {email} for help.",
  "auth.err.tooManyRequests": "Too many requests. Try again later.",
  "auth.resetSent": "If an account exists for that email, a reset link is on its way. Check your inbox.",
  "auth.err.mailFailed": "We couldn't send the email right now. Try again in a few minutes.",
  "auth.err.linkInvalid": "This reset link is invalid.",
  "auth.err.linkExpired": "This reset link has expired. Request a new one.",
  "auth.err.sessionExpired": "Your session has expired. Sign in again.",
  "auth.err.emailInUse": "Another account already uses this email.",
  "auth.err.currentPassword": "Enter your current password.",
  "auth.err.currentWrong": "Your current password is incorrect.",
  "auth.profileSaved": "Profile saved.",
  "auth.passwordChanged": "Password changed. Other devices have been signed out.",

  // Account
  "account.title": "My account",
  "account.signedInAs": "Signed in as {email}",
  "account.passwordReset": "Your password has been changed.",
  "account.profile": "Profile",
  "account.saveProfile": "Save profile",
  "account.passwordSection": "Password",
  "account.currentPassword": "Current password",
  "account.changePassword": "Change password",

} as const;

export const MESSAGES = { ...BASE_MESSAGES, ...PRODUCT_MESSAGES } as const;

export type MessageKey = keyof typeof MESSAGES;

/** Settings whose text can be translated (key in the translations table: "setting.<key>"). */
export const TRANSLATABLE_SETTINGS = [
  "site_tagline",
  "home_hero_title",
  "home_hero_subtitle",
  "footer_text",
  "copyright_text",
  "meta_title",
  "meta_description",
  "cookie_consent_text",
  "maintenance_message",
] as const;

export type TranslatableSetting = (typeof TRANSLATABLE_SETTINGS)[number];

export type Translator = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** Splits a message around its placeholders so they can be replaced with rich content (e.g. links or bold text). */
export function interpolateParts<T>(text: string, vars: Record<string, T>): Array<string | T> {
  return text
    .split(/\{(\w+)\}/g)
    .map((part, i) => (i % 2 === 1 ? (part in vars ? vars[part] : `{${part}}`) : part))
    .filter((part) => part !== "");
}
