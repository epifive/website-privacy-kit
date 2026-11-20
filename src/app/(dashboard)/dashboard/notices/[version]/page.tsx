import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, ShieldX } from "lucide-react";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { renderMarkdown } from "@/core/notice/markdown";
import { formatDateTime } from "@/lib/dashboard-format";
import { idParam } from "@/lib/db/tenant";
import { getLocale, getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { getNoticeVersion, verifyNoticeVersion } from "@/lib/privacy/notices";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.nav.notices") };
}

export default async function NoticeVersionPage({ params, searchParams }: { params: Promise<{ version: string }>; searchParams: Promise<{ lang?: string; published?: string }> }) {
  const [{ org, t: tenant }, t, locale, { version: raw }, query] = await Promise.all([requireOrg(), getT(), getLocale(), params, searchParams]);
  const version = idParam(raw);
  const lang = query.lang === "hi" || query.lang === "en" ? query.lang : locale.code === "hi" ? "hi" : "en";
  const row = version ? await getNoticeVersion(tenant, lang, version) : undefined;
  if (!row) notFound();
  const intact = verifyNoticeVersion(row);
  const publicUrl = `/p/${org.slug}/notice?v=${row.version}&lang=${lang}`;

  return (
    <>
      <DashHeader
        title={t("dash.notices.versionTitle", { version: row.version })}
        description={t("dash.notices.publishedOn", { date: formatDateTime(row.published_at, locale.code) })}
        actions={
          <>
            <ButtonLink href={`?lang=${lang === "en" ? "hi" : "en"}`} variant="outline">
              {lang === "en" ? "हिंदी" : "English"}
            </ButtonLink>
            <ButtonLink href={publicUrl} variant="outline">
              {t("dash.notices.openPublic")}
            </ButtonLink>
          </>
        }
      />
      {query.published ? <Alert tone="success" className="mb-4">{t("dash.notices.publishedOk", { version: row.version })}</Alert> : null}
      <Panel className="mb-6">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {intact ? <ShieldCheck className="size-5 text-emerald-600" aria-hidden /> : <ShieldX className="size-5 text-red-600" aria-hidden />}
          <span>{intact ? t("dash.notices.hashOk") : t("dash.notices.hashBad")}</span>
          <code className="font-mono text-xs break-all" dir="ltr">
            {row.sha256}
          </code>
        </div>
        <p className="mt-2 text-xs text-muted">
          {t("dash.notices.template", { template: row.template_version })} ·{" "}
          <Link href="/dashboard/notices" className="text-primary hover:underline">
            {t("dash.notices.allVersions")}
          </Link>
        </p>
      </Panel>
      <Panel>
        <div lang={lang} className="prose-wpk max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdown(row.body_md) }} />
      </Panel>
    </>
  );
}
