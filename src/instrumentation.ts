/**
 * Startup checks (plan §7.6), run once when the server starts (`next start`,
 * server.js, PM2, Docker). In production the app refuses to run without a
 * usable master key or without argon2id; it warns about missing job secrets
 * and a log retention below one year. The key's match with the database is
 * checked on the first database use (src/lib/secrets.ts loadKeyring).
 * WPK_MIGRATE_ONLY=1 runs the database migrations and exits (deploy/db-setup.sh).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.WPK_MIGRATE_ONLY === "1") {
    const { runMigrationsAndExit } = await import("./lib/db/migrate-only");
    await runMigrationsAndExit();
  }
  const { runStartupCheck } = await import("./lib/startup-check");
  runStartupCheck();
}
