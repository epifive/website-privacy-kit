import Link from "next/link";
import { CircleCheck, CircleDashed } from "lucide-react";
import { Card, PageHeader, StatCard } from "@/components/admin/ui";
import { getDb } from "@/lib/db";
import { editionLimits, PRO_URL } from "@/lib/edition";
import { mailConfigured } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/auth/session";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  // Layouts and pages render in parallel: check here too, not only in the admin layout.
  await requireAdmin();
  const db = await getDb();
  const settings = await getSettings();
  const limits = editionLimits();

  const [orgs, sites, events, requests] = await Promise.all([
    db.selectFrom("orgs").select((eb) => eb.fn.countAll<number>().as("n")).where("status", "=", "active").executeTakeFirst(),
    db.selectFrom("sites").select((eb) => eb.fn.countAll<number>().as("n")).where("archived_at", "is", null).executeTakeFirst(),
    db.selectFrom("consent_events").select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirst(),
    db.selectFrom("rights_requests").select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirst(),
  ]);

  const checklist = [
    { done: Boolean(settings.site_url), label: "Set your site URL (used in the banner snippet and emails)", href: "/admin/settings/general" },
    { done: mailConfigured(settings), label: "Configure email (SMTP) for request codes and reminders", href: "/admin/settings/email" },
    { done: Number(orgs?.n ?? 0) > 0, label: "Create your organisation in the dashboard", href: "/dashboard" },
  ];
  const remaining = checklist.filter((c) => !c.done);
  const limit = (n: number) => (n > 0 ? String(n) : "unlimited");

  return (
    <>
      <PageHeader title="Dashboard" description={`Overview of ${settings.site_name}.`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Organisations" value={Number(orgs?.n ?? 0).toLocaleString()} hint={`Edition limit: ${limit(limits.maxOrgs)}`} />
        <StatCard label="Websites" value={Number(sites?.n ?? 0).toLocaleString()} hint={`Edition limit: ${limit(limits.maxSites)}`} />
        <StatCard label="Consent records" value={Number(events?.n ?? 0).toLocaleString()} hint="Never limited" />
        <StatCard label="Rights requests" value={Number(requests?.n ?? 0).toLocaleString()} hint="Never limited" />
      </div>

      {remaining.length ? (
        <Card title="Finish setting up" className="mt-6">
          <ul className="space-y-1">
            {checklist.map((c) => (
              <li key={c.label}>
                <Link href={c.href} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-paper">
                  {c.done ? <CircleCheck className="size-5 text-primary" aria-label="Done" /> : <CircleDashed className="size-5 text-muted" aria-label="To do" />}
                  <span className={c.done ? "text-muted line-through" : undefined}>{c.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {limits.edition === "free" ? (
        <Card title="Free edition" className="mt-6">
          <p className="text-sm text-muted">
            This installation runs the open-source Free edition: one organisation, one website and one user, with unlimited consent records and rights
            requests. Pro adds several organisations and websites with team roles, white-label pages, the full parental-consent flow, the evidence pack, a
            REST API with webhooks and sector template packs. Hosted plans coming soon.
          </p>
          <a href={PRO_URL} target="_blank" rel="noopener" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
            Get Pro
          </a>
        </Card>
      ) : null}
    </>
  );
}
