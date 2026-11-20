#!/usr/bin/env node
/**
 * First-run setup: writes .env.local with a new master key and the two job secrets.
 *
 *   npm run setup            create .env.local (never overwrites an existing one)
 *
 * The master key wraps the data keys that encrypt contact details and request
 * attachments. Keep a copy in your password manager: without it the encrypted
 * data cannot be read, and it must never be stored with the database backups.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, ".env.local");

if (fs.existsSync(file) && /^WPK_MASTER_KEY=/m.test(fs.readFileSync(file, "utf8"))) {
  console.log(".env.local already has WPK_MASTER_KEY. Nothing changed.");
  process.exit(0);
}

const secret = () => crypto.randomBytes(24).toString("base64url");
const key = crypto.randomBytes(32).toString("hex");
const lines = [
  "# Written by `npm run setup`. Keep this file private (it is in .gitignore).",
  "# Master key: keep a copy in your password manager; never store it with database backups.",
  `WPK_MASTER_KEY=${key}`,
  "# Secrets for the scheduled jobs (see scripts/cron.md).",
  `CRON_SECRET=${secret()}`,
  `WPK_MAINTENANCE_SECRET=${secret()}`,
  "# Public address of this installation (used in the banner snippet and emails).",
  "# SITE_URL=https://privacy.example.com",
  "# Plain-HTTP access from another computer on your network (testing only, never on the internet):",
  "# WPK_INSECURE_COOKIES=1",
  "",
];
fs.appendFileSync(file, lines.join("\n"), { mode: 0o600 });
console.log(`Wrote ${path.relative(process.cwd(), file) || ".env.local"} with a new master key and job secrets.`);
console.log("Copy WPK_MASTER_KEY into your password manager now. Then run: npm start");
