import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyField } from "@/components/dashboard/copy";
import { DashHeader, DTable, DTd, DTh, Empty, Pager, Panel } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { idParam } from "@/lib/db/tenant";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { listConsentEvents, verifySiteChain, withdrawUrl } from "@/lib/privacy/consent";
import { getSite } from "@/lib/privacy/registers";
import { baseUrl } from "@/lib/request";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.consents.title") };
}

const PER_PAGE = 50;
const ACTION_KEY: Record<string, MessageKey> = { grant: "dash.consents.action.grant", deny: "dash.consents.action.deny", withdraw: "dash.consents.action.withdraw" };
const ACTION_TONE = { grant: "success", deny: "neutral", withdraw: "warning" } as const;

/** Consent log (plan M4; C3): paged events, hash-chain verification and CSV export. */
export default async function ConsentLogPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; subject?: string; verify?: string }> }) {
  const [{ t: tenant, org }, t, { id }, query, base] = await Promise.all([requireOrg(), getT(), params, searchParams, baseUrl()]);
  const siteId = idParam(id);
  const site = siteId ? await getSite(tenant, siteId) : undefined;
  if (!site) notFound();
  const subject = /^[A-Za-z0-9_-]{16,64}$/.test(query.subject ?? "") ? query.subject! : undefined;
  const page = Math.max(1, idParam(query.page) ?? 1);
  const [{ rows, total }, report] = await Promise.all([
    listConsentEvents(tenant, site.id, { limit: PER_PAGE, offset: (page - 1) * PER_PAGE, subjectRef: subject }),
    query.verify ? verifySiteChain(tenant, site.id) : Promise.resolve(null),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (p: number) => `?page=${p}${subject ? `&subject=${subject}` : ""}`;
  const identified = subject && /^[ep]_/.test(subject);

  return (
    <>
      <DashHeader
        title={t("dash.consents.title")}
        description={t("dash.consents.subtitle", { site: site.domain })}
        actions={
          <>
            <ButtonLink href={`?verify=1${subject ? `&subject=${subject}` : ""}`} variant="outline" size="sm">
              {t("dash.consents.verify")}
            </ButtonLink>
            <a href={`/dashboard/sites/${site.id}/consents/export`} className={buttonClass("primary", "sm")} download>
              {t("dash.consents.export")}
            </a>
          </>
        }
      />
      <p className="mb-4 text-sm">
        <Link href={`/dashboard/sites/${site.id}`} className="text-muted hover:text-primary">
          ← {site.name}
        </Link>
      </p>
      {report ? (
        report.ok ? (
          <Alert tone="success" className="mb-4">
            <span className="break-all">{t("dash.consents.ok", { count: report.count, hash: report.head })}</span>
          </Alert>
        ) : (
          <Alert tone="error" className="mb-4">
            {t("dash.consents.broken", { seq: report.error?.seq ?? 0, reason: report.error?.reason ?? "" })}
          </Alert>
        )
      ) : null}
      <form className="mb-4 flex max-w-xl gap-2" method="get">
        <Input name="subject" defaultValue={subject ?? ""} placeholder={t("dash.consents.filter")} aria-label={t("dash.consents.filter")} dir="ltr" />
        <button type="submit" className={buttonClass("outline", "md")}>
          {t("dash.consents.filterBtn")}
        </button>
        {subject ? (
          <Link href="?" className={buttonClass("ghost", "md")}>
            {t("dash.consents.clear")}
          </Link>
        ) : null}
      </form>
      {identified ? (
        <Panel title={t("dash.consents.withdrawLink")} description={t("dash.consents.withdrawHint")} className="mb-4 max-w-3xl">
          <CopyField value={withdrawUrl(base, org.slug, site.id, subject!)} label={t("dash.consents.withdrawLink")} />
        </Panel>
      ) : null}
      {rows.length ? (
        <Panel padded={false}>
          <DTable label={t("dash.consents.title")} minWidth={900}>
            <thead>
              <tr>
                <DTh>#</DTh>
                <DTh>{t("dash.consents.time")}</DTh>
                <DTh>{t("dash.consents.subject")}</DTh>
                <DTh>{t("dash.consents.purpose")}</DTh>
                <DTh>{t("dash.consents.action")}</DTh>
                <DTh>{t("dash.consents.notice")}</DTh>
                <DTh>{t("dash.consents.lang")}</DTh>
                <DTh>{t("dash.consents.channel")}</DTh>
                <DTh>{t("dash.consents.page")}</DTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <DTd className="tabular-nums">{r.seq}</DTd>
                  <DTd className="whitespace-nowrap tabular-nums" >
                    <span dir="ltr">{r.created_at.replace("T", " ").slice(0, 19)}</span>
                  </DTd>
                  <DTd>
                    <Link href={`?subject=${r.subject_ref}`} className="font-mono text-xs hover:text-primary" dir="ltr" title={r.subject_ref}>
                      {r.subject_ref.slice(0, 14)}…
                    </Link>
                    {r.subject_kind !== "browser" ? <span className="ms-1 text-xs text-muted">({r.subject_kind})</span> : null}
                  </DTd>
                  <DTd>
                    <code className="text-xs" dir="ltr">
                      {r.purpose_key}
                    </code>
                  </DTd>
                  <DTd>
                    <Badge tone={ACTION_TONE[r.action]}>{t(ACTION_KEY[r.action])}</Badge>
                  </DTd>
                  <DTd>v{r.notice_version}</DTd>
                  <DTd>{r.lang.toUpperCase()}</DTd>
                  <DTd>{r.channel}</DTd>
                  <DTd className="max-w-56 truncate text-xs" >
                    <span dir="ltr" title={r.page_url}>
                      {r.page_url.replace(/^https?:\/\//, "")}
                    </span>
                  </DTd>
                </tr>
              ))}
            </tbody>
          </DTable>
          <Pager
            page={page}
            pages={pages}
            href={href}
            labels={{ summary: t("dash.consents.summary", { page, pages, count: total }), previous: t("dash.consents.prev"), next: t("dash.consents.next"), nav: t("dash.consents.nav") }}
          />
        </Panel>
      ) : (
        <Empty title={t("dash.consents.empty")} />
      )}
    </>
  );
}
