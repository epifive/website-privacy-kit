# Scheduled jobs (VPS crontab)

EpiFive Website Privacy Kit has no background worker. Everything that must happen on time is an
HTTP endpoint protected by a secret, called from the server's crontab. Not legal advice: the
deadlines the jobs remind about are explained in the dashboard and in `docs/REQUIREMENTS.md`.

## Secrets

Put these in the app's environment (for example `/etc/privacykit.env`, mode 600, loaded by systemd
or PM2) and in the crontab's environment:

| Variable | Used by | Notes |
|---|---|---|
| `CRON_SECRET` | `/api/v1/cron/*` | 16+ random characters. Reminders only; never deletes data. |
| `WPK_MAINTENANCE_SECRET` | `/api/v1/maintenance/*` | 16+ characters, **different** from `CRON_SECRET`. These jobs delete records past retention. |

Generate each with `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.
A wrong secret answers 404; 20 wrong attempts from one address in 10 minutes lock that address out
of the endpoint for the rest of the window.

## Crontab

```cron
# m   h  dom mon dow  command
# Every 15 minutes: all reminder jobs in one call (the CERT-In breach window is 6 hours).
*/15  *  *   *   *    . /etc/privacykit.env; curl -fsS -m 300 -X POST -H "Authorization: Bearer $CRON_SECRET" https://privacy.example.com/api/v1/cron/run > /dev/null

# 04:00 every day: account closures - 7-day reminders, accounts past their export window, closed organisations after a year.
0     4  *   *   *    . /etc/privacykit.env; curl -fsS -m 900 -X POST -H "Authorization: Bearer $WPK_MAINTENANCE_SECRET" "https://privacy.example.com/api/v1/maintenance/closed-accounts?apply=1" >> /var/log/privacykit/maintenance.log

# Sunday 03:15: consent records past each organisation's retention (never younger than one year).
15    3  *   *   0    . /etc/privacykit.env; curl -fsS -m 900 -X POST -H "Authorization: Bearer $WPK_MAINTENANCE_SECRET" "https://privacy.example.com/api/v1/maintenance/consent-purge?apply=1" >> /var/log/privacykit/maintenance.log

# Sunday 03:30: platform logs older than WPK_LOG_RETENTION_DAYS (default 400, never under 365).
30    3  *   *   0    . /etc/privacykit.env; curl -fsS -m 300 -X POST -H "Authorization: Bearer $WPK_MAINTENANCE_SECRET" "https://privacy.example.com/api/v1/maintenance/log-purge?apply=1" >> /var/log/privacykit/maintenance.log

# 02:30 every night: encrypted backup (see scripts/backup.sh; the master key is NOT in it).
30    2  *   *   *    WPK_ENV=/etc/privacykit.env /opt/privacykit/scripts/backup.sh >> /var/log/privacykit/backup.log 2>&1
```

Use the server's time zone consistently (IST on an India VPS: `timedatectl set-timezone Asia/Kolkata`)
and keep the clock synced (`timedatectl set-ntp true`; CERT-In asks for NTP sync).

## What `/api/v1/cron/run` does

One `POST` runs, in order, and reports each job separately (HTTP 500 if any failed, so `curl -f`
makes cron mail you):

| Job | What it sends | Repeats? |
|---|---|---|
| `breachTimers` | CERT-In 6 h, Board "without delay" and 72 h, affected-people reminders to the organisation's owner and admins | each reminder once |
| `rightsReminders` | T−7, T−1 and overdue reminders for rights requests | each once per request |
| `retentionReminders` | next periodic erasure task per rule; due-soon, overdue and pre-erasure-notice reminders | each once per task |
| `chainDigest` | daily email to each owner with every website's consent chain head (last record and its SHA-256), after 07:00 IST, only when there are new records (plan §7.4; Admin → Settings → Security) | once per organisation per IST day |
| `expiredSessions` | deletes expired sign-in sessions and password-reset links | — |

Every job is idempotent, so a missed run is caught up by the next one and an extra run sends
nothing twice. The older single-job endpoints (`/api/v1/cron/breach-timers`,
`/rights-reminders`, `/retention-reminders`) still work.

## Dry runs and checks

```sh
# What would the purges delete? (no ?apply=1 = dry run, nothing changes)
curl -fsS -X POST -H "Authorization: Bearer $WPK_MAINTENANCE_SECRET" https://privacy.example.com/api/v1/maintenance/consent-purge
curl -fsS -X POST -H "Authorization: Bearer $WPK_MAINTENANCE_SECRET" https://privacy.example.com/api/v1/maintenance/log-purge
curl -fsS -X POST -H "Authorization: Bearer $WPK_MAINTENANCE_SECRET" https://privacy.example.com/api/v1/maintenance/closed-accounts
# Run all reminder jobs now and see the result per job
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://privacy.example.com/api/v1/cron/run | jq
```

With MySQL, give the maintenance endpoints their own database user (`DB_MAINT_USER`,
`DB_MAINT_PASSWORD`; see `scripts/mysql-grants.sql`), the only one allowed to delete old logs.

`npm run setup` already wrote random `CRON_SECRET` and `WPK_MAINTENANCE_SECRET` values to `.env.local`.
