import Link from "next/link";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { mailConfigured } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { AddSuppressionForm, RemoveSuppressionForm, TestMailForm } from "./mail-forms";

export const metadata = { title: "Email" };

export default async function AdminMailPage() {
  const [admin, settings, db] = await Promise.all([requireAdmin(), getSettings(), getDb()]);
  const suppressions = await db.selectFrom("mail_suppressions").selectAll().orderBy("created_at", "desc").limit(200).execute();
  const configured = mailConfigured(settings);
  return (
    <>
      <PageHeader
        title="Email"
        description={
          <>
            {configured ? `SMTP ${settings.smtp_host}` : "Not configured"} ·{" "}
            <Link href="/admin/settings/email" className="text-primary hover:underline">
              Email settings
            </Link>
          </>
        }
      />
      <div className="grid gap-6">
        <Card title="Send a test email">
          <TestMailForm defaultTo={admin.email} />
        </Card>
        <Card title="Suppressed addresses" padded={false}>
          <div className="border-b border-line p-4">
            <p className="mb-3 text-sm text-muted">
              Add addresses that bounce or asked not to be emailed. They are never emailed again; emails to them are logged as skipped.
            </p>
            <AddSuppressionForm />
          </div>
          {suppressions.length ? (
            <Table minWidth={640}>
              <thead>
                <tr>
                  <Th>Address</Th>
                  <Th>Reason</Th>
                  <Th>Since</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {suppressions.map((s) => (
                  <tr key={s.email_hmac}>
                    <Td>{s.email_masked}</Td>
                    <Td>
                      {s.reason}
                      {s.detail ? <p className="max-w-80 truncate text-xs text-muted">{s.detail}</p> : null}
                    </Td>
                    <Td className="text-muted">{formatDate(s.created_at, true)}</Td>
                    <Td>
                      <RemoveSuppressionForm keyHex={s.email_hmac} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="No suppressed addresses" />
          )}
        </Card>
      </div>
    </>
  );
}
