-- EpiFive Website Privacy Kit: optional least-privilege MySQL 8 users and grants (insert-only proofs and logs).
--
-- Three users:
--   wpk_owner  owns the schema: migrations (DB_MIGRATE_USER/DB_MIGRATE_PASSWORD), triggers,
--              scripts/keys.mjs (rewrap / rotate-org). Not used by the running app otherwise.
--   wpk_app    the running app (DB_USER/DB_PASSWORD): no DDL; SELECT + INSERT only on the
--              insert-only tables, so even a compromised app can't rewrite proofs or logs.
--   wpk_maint  retention purges only (DB_MAINT_USER/DB_MAINT_PASSWORD, used by
--              /api/v1/maintenance/*): the only user that may delete old logs.
-- The database triggers (migrations 000004, 000006, 000007, 000013) are a second guard:
-- they reject UPDATE on the insert-only tables, DELETE of consent records not covered by a
-- one-year-old retention checkpoint, and DELETE of log rows younger than one year.
--
-- Use: replace `privacykit`, the host '%' (prefer the app server's private IP) and the
-- passwords, then run as an administrator:  mysql -u admin -p < scripts/mysql-grants.sql
-- Run it again after an update that adds tables (tests/ops.test.ts checks every table is listed);
-- Run the steps below in order on every update that adds tables.
-- Managed MySQL (DigitalOcean, Lightsail): create the users in the console if CREATE USER is
-- refused, then run the GRANT lines. Creating triggers needs TRIGGER on wpk_owner (and, with
-- binary logging on, log_bin_trust_function_creators=1 in the provider's settings).

CREATE USER IF NOT EXISTS 'wpk_owner'@'%' IDENTIFIED BY 'CHANGE-ME-owner-password';
CREATE USER IF NOT EXISTS 'wpk_app'@'%' IDENTIFIED BY 'CHANGE-ME-app-password';
CREATE USER IF NOT EXISTS 'wpk_maint'@'%' IDENTIFIED BY 'CHANGE-ME-maint-password';

GRANT ALL PRIVILEGES ON `privacykit`.* TO 'wpk_owner'@'%';

-- ---- TABLE GRANTS (below) need the tables: first install = run the lines above, migrate as wpk_owner,
-- ---- then run this whole file (users, then migrations, then grants). MySQL refuses a table grant
-- ---- on a table that does not exist yet (ERROR 1146).

-- wpk_app: regular tables (read and write)
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`breach_recipients` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`breaches` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`consent_chain_heads` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`consent_state` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`contacts` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`erasure_tasks` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`languages` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`mail_log` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`mail_suppressions` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`memberships` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`nominations` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`orgs` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`parental_consents` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`password_resets` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`purposes` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`questionnaires` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`request_attachments` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`request_events` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`retention_rules` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`rights_requests` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`sessions` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`settings` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`sites` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`translations` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`usage_counters` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`users` TO 'wpk_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `privacykit`.`vendors` TO 'wpk_app'@'%';

-- wpk_app: insert-only tables (proofs, timelines, logs, keys)
GRANT SELECT, INSERT ON `privacykit`.`audit_log` TO 'wpk_app'@'%';
GRANT SELECT, INSERT ON `privacykit`.`breach_events` TO 'wpk_app'@'%';
GRANT SELECT, INSERT ON `privacykit`.`consent_purge_checkpoints` TO 'wpk_app'@'%';
GRANT SELECT, INSERT ON `privacykit`.`notice_versions` TO 'wpk_app'@'%';
GRANT SELECT, INSERT ON `privacykit`.`org_keys` TO 'wpk_app'@'%';
GRANT SELECT, INSERT ON `privacykit`.`security_events` TO 'wpk_app'@'%';
-- consent_events: no UPDATE ever. DELETE stays because a member may delete an archived site
-- once all its records are past retention; the trigger allows only rows under a checkpoint
-- that is at least one year old.
GRANT SELECT, INSERT, DELETE ON `privacykit`.`consent_events` TO 'wpk_app'@'%';
-- Migrations run as wpk_owner; the app only reads which ones ran (Admin → System).
GRANT SELECT ON `privacykit`.`kysely_migration` TO 'wpk_app'@'%';
GRANT SELECT ON `privacykit`.`kysely_migration_lock` TO 'wpk_app'@'%';

-- wpk_maint: read everything, write only what the retention purges need
GRANT SELECT ON `privacykit`.* TO 'wpk_maint'@'%';
GRANT INSERT ON `privacykit`.`consent_purge_checkpoints` TO 'wpk_maint'@'%';
GRANT INSERT ON `privacykit`.`audit_log` TO 'wpk_maint'@'%';
GRANT DELETE ON `privacykit`.`consent_events` TO 'wpk_maint'@'%';
GRANT DELETE ON `privacykit`.`consent_state` TO 'wpk_maint'@'%';
GRANT DELETE ON `privacykit`.`security_events` TO 'wpk_maint'@'%';
GRANT DELETE ON `privacykit`.`mail_log` TO 'wpk_maint'@'%';
-- Closed accounts, one year after closure: the organisation's keys are destroyed (crypto-shredding).
GRANT DELETE ON `privacykit`.`org_keys` TO 'wpk_maint'@'%';

FLUSH PRIVILEGES;
