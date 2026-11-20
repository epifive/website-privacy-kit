import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { publishNoticeAction } from "@/app/actions/dashboard/privacy";
import { ActionForm } from "@/components/dashboard/action-form";
import { CopyField } from "@/components/dashboard/copy";
import { DashHeader, DTable, DTd, DTh, Panel } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { renderMarkdown } from "@/core/notice/markdown";
import { buildContactBlock, buildLegacyMessage, buildShortNotice, type NoticeIssue } from "@/core/notice/render";
import type { MessageKey } from "@/lib/i18n/messages";
import { getLocale, getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { listNoticeVersions, previewNotice } from "@/lib/privacy/notices";
import { baseUrl } from "@/lib/request";
import { formatDateTime } from "@/lib/dashboard-format";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.nav.notices") };
}

const ISSUE_LINK: Record<NoticeIssue["code"], string> = {
  org_name: "/dashboard/setup?step=1",
  goods_services: "/dashboard/setup?step=1",
  no_purposes: "/dashboard/purposes",
  purpose_no_items: "/dashboard/purposes",
  purpose_translation: "/dashboard/purposes",
  item_translation: "/dashboard/purposes",
  no_contact: "/dashboard/contacts",
  contact_channel: "/dashboard/contacts",
  response_days: "/dashboard/org",
  identifiers: "/dashboard/org",
  links: "/admin/settings/general",
};

export default async function NoticesPage({ searchParams }: { searchParams: Promise<{ lang?: string; from?: string }> }) {
  const [{ t: tenant, canWrite }, t, locale, query, base] = await Promise.all([requireOrg(), getT(), getLocale(), searchParams, baseUrl()]);
  const [preview, versions] = await Promise.all([previewNotice(tenant, base), listNoticeVersions(tenant)]);
  const lang = query.lang === "hi" || query.lang === "en" ? query.lang : locale.code === "hi" ? "hi" : "en";
  const draft = preview.rendered.find((r) => r.lang === lang)!;

  return (
    <>
      <DashHeader title={t("dash.nav.notices")} description={t("dash.notices.subtitle")} />
      <Alert tone="warning" className="mb-6">
        {t("dash.notices.draftWarning")}
      </Alert>

      {preview.issues.length ? (
        <Panel title={t("dash.notices.issuesTitle", { count: preview.issues.length })} className="mb-6">
          <ul className="space-y-2 text-sm">
            {preview.issues.map((issue, i) => (
              <li key={i} className="flex gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
                <Link href={ISSUE_LINK[issue.code]} className="hover:underline">
                  {t(`notice.issue.${issue.code}` as MessageKey, { ref: issue.ref ?? "" })}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <Panel title={t("dash.notices.readyTitle", { version: preview.input.version })} description={t("dash.notices.readyText")} className="mb-6">
          <ActionForm action={publishNoticeAction} submit={t("dash.notices.publish")} pending={t("dash.notices.publishing")} disabled={!canWrite}>
            <p className="text-sm text-muted">{t("dash.notices.publishHint")}</p>
          </ActionForm>
        </Panel>
      )}

      {versions.length ? (
        <Panel title={t("dash.notices.versions")} padded={false} className="mb-6">
          <DTable label={t("dash.notices.versions")} minWidth={560}>
            <thead>
              <tr>
                <DTh>{t("dash.notices.version")}</DTh>
                <DTh>{t("dash.notices.published")}</DTh>
                <DTh>SHA-256</DTh>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.version}>
                  <DTd>
                    <Link href={`/dashboard/notices/${v.version}`} className="font-medium hover:text-primary">
                      v{v.version}
                    </Link>
                  </DTd>
                  <DTd>{formatDateTime(v.published_at, locale.code)}</DTd>
                  <DTd>
                    {v.langs.map((l) => (
                      <p key={l.lang} className="font-mono text-xs" dir="ltr">
                        {l.lang}: {l.sha256.slice(0, 16)}…
                      </p>
                    ))}
                  </DTd>
                </tr>
              ))}
            </tbody>
          </DTable>
        </Panel>
      ) : null}

      <Panel
        title={t("dash.notices.preview", { version: preview.input.version })}
        actions={
          <div className="flex gap-2 text-sm">
            <Link href="?lang=en" className={lang === "en" ? "font-semibold text-primary" : "text-muted hover:text-ink"}>
              English
            </Link>
            <span className="text-muted">·</span>
            <Link href="?lang=hi" className={lang === "hi" ? "font-semibold text-primary" : "text-muted hover:text-ink"}>
              हिंदी
            </Link>
          </div>
        }
      >
        {/* Rendered by the notice renderer, which escapes all business input and emits a fixed tag set. */}
        <div lang={lang} className="prose-wpk max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.bodyMd) }} />
      </Panel>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title={t("dash.notices.short")} description={t("dash.notices.shortText")}>
          <CopyField value={buildShortNotice(preview.input, lang)} label={t("dash.notices.short")} multiline />
        </Panel>
        <Panel title={t("dash.notices.contactBlock")} description={t("dash.notices.contactBlockText")}>
          <CopyField value={buildContactBlock(preview.input, lang).replace(/\*\*|\\/g, "")} label={t("dash.notices.contactBlock")} multiline />
        </Panel>
        <Panel title={t("dash.notices.legacyEmail")} description={t("dash.notices.legacyText")}>
          <CopyField value={(() => { const m = buildLegacyMessage(preview.input, lang, "email"); return `${m.subject}\n\n${m.body}`; })()} label={t("dash.notices.legacyEmail")} multiline />
        </Panel>
        <Panel title={t("dash.notices.legacySms")} description={t("dash.notices.legacyText")}>
          <CopyField value={buildLegacyMessage(preview.input, lang, "sms").body} label={t("dash.notices.legacySms")} multiline />
        </Panel>
      </div>
    </>
  );
}
