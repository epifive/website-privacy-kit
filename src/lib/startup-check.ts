import { argon2Available } from "./auth/password";
import { logRetentionDays, MIN_LOG_RETENTION_DAYS } from "./log-retention";
import { masterKey, masterKeySource } from "./secrets";

/** What src/instrumentation.ts checks before the server takes requests. */
export function startupProblems(env: NodeJS.ProcessEnv = process.env): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = env.NODE_ENV === "production";
  if (production && masterKeySource(env) === "missing") {
    errors.push("WPK_MASTER_KEY (or WPK_MASTER_KEY_FILE) is not set. Generate one with `node scripts/keys.mjs generate`, keep a copy in your password manager, and never put it in the database backups.");
  } else {
    try {
      masterKey();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (!argon2Available()) errors.push("This Node.js has no built-in argon2id (crypto.argon2). Use Node.js 24.7 or newer.");
  if (production) {
    if ((env.CRON_SECRET ?? "").length < 16) warnings.push("CRON_SECRET is not set (16+ characters): reminders and breach timers will not run. See scripts/cron.md.");
    if ((env.WPK_MAINTENANCE_SECRET ?? "").length < 16) warnings.push("WPK_MAINTENANCE_SECRET is not set: consent and log retention purges are disabled.");
    if (env.WPK_ADMIN_2FA === "off") warnings.push("WPK_ADMIN_2FA=off: administrators can sign in without two-step verification. Use it only for automated tests.");
    if (env.WPK_INSECURE_COOKIES === "1") warnings.push("WPK_INSECURE_COOKIES=1: session cookies are sent over plain HTTP.");
  }
  const raw = Number(env.WPK_LOG_RETENTION_DAYS);
  if (env.WPK_LOG_RETENTION_DAYS && raw < MIN_LOG_RETENTION_DAYS) warnings.push(`WPK_LOG_RETENTION_DAYS=${env.WPK_LOG_RETENTION_DAYS} is under one year; ${logRetentionDays(env.WPK_LOG_RETENTION_DAYS)} days are used (Rule 6(1)(e), 8(3)).`);
  return { errors, warnings };
}

/** Log the problems; in production, stop the process when there are errors. */
export function runStartupCheck(): void {
  const { errors, warnings } = startupProblems();
  for (const w of warnings) console.warn(`[startup] ${w}`);
  if (!errors.length) return;
  for (const e of errors) console.error(`[startup] ${e}`);
  if (process.env.NODE_ENV === "production") {
    console.error("[startup] Website Privacy Kit refuses to start. Fix the problems above and start it again.");
    process.exit(1);
  }
}
