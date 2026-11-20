import Link from "next/link";
import { Card, EmptyState, PageHeader, Pagination, Table, Td, Th } from "@/components/admin/ui";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { requireAdmin } from "@/lib/auth/session";

export const metadata = { title: "Security log" };

const PER_PAGE = 50;
const GROUPS = ["all", "login", "password", "2fa", "session", "admin", "csrf"] as const;

/** Platform audit log (security_events): sign-in, 2FA, passwords, sessions and administrator actions. Insert-only, kept ≥ 1 year. */
export default async function SecurityLogPage({ searchParams }: { searchParams: Promise<{ group?: string; page?: string; user?: string }> }) {
  // Layouts and pages render in parallel: check here too, not only in the admin layout.
  await requireAdmin();
  const params = await searchParams;
  const group = (GROUPS as readonly string[]).includes(params.group ?? "") ? params.group! : "all";
  const page = Math.max(1, Number(params.page) || 1);
  const userId = Number(params.user) || 0;
  const db = await getDb();
  let q = db.selectFrom("security_events").leftJoin("users", "users.id", "security_events.user_id").leftJoin("users as actors", "actors.id", "security_events.actor_id");
  if (group !== "all") q = q.where("security_events.action", "like", `${group}.%`);
  if (userId) q = q.where("security_events.user_id", "=", userId);
  const [total, rows] = await Promise.all([
    q.select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirst(),
    q
      .select(["security_events.id", "security_events.action", "security_events.target", "security_events.ip_trunc", "security_events.ua_family", "security_events.created_at", "security_events.user_id", "users.email", "actors.email as actor_email"])
      .orderBy("security_events.id", "desc")
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE)
      .execute(),
  ]);
  const pages = Math.max(1, Math.ceil(Number(total?.n ?? 0) / PER_PAGE));
  return (
    <>
      <PageHeader title="Security log" description="Sign-in, two-step verification, password, session and administrator events. Insert-only; kept for at least one year." />
      <Card padded={false}>
        <div className="flex flex-wrap gap-1 border-b border-line p-3">
          {GROUPS.map((g) => (
            <Link key={g} href={`/admin/security?group=${g}${userId ? `&user=${userId}` : ""}`} className={`rounded-md px-3 py-1.5 text-sm font-medium ${group === g ? "bg-primary-soft text-primary" : "text-muted hover:text-ink"}`}>
              {g}
            </Link>
          ))}
        </div>
        {rows.length ? (
          <Table minWidth={900}>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Event</Th>
                <Th>Account</Th>
                <Th>By</Th>
                <Th>Detail</Th>
                <Th>Network</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-muted">{formatDate(r.created_at, true)}</Td>
                  <Td className="font-mono text-xs">{r.action}</Td>
                  <Td>{r.user_id ? <Link href={`/admin/security?user=${r.user_id}`} className="hover:text-primary">{r.email ?? `#${r.user_id}`}</Link> : "—"}</Td>
                  <Td className="text-muted">{r.actor_email ?? "—"}</Td>
                  <Td className="max-w-72 break-words">{r.target || "—"}</Td>
                  <Td className="text-xs text-muted">
                    {r.ip_trunc || "—"} · {r.ua_family || "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No events" />
        )}
        <Pagination page={page} pages={pages} href={(p) => `/admin/security?group=${group}&page=${p}${userId ? `&user=${userId}` : ""}`} />
      </Card>
    </>
  );
}
