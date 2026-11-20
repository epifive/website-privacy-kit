import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { archiveSiteAction, deleteSiteAction } from "@/app/actions/dashboard/privacy";
import { ActionButton } from "@/components/dashboard/actions";
import { CopyField } from "@/components/dashboard/copy";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { parseTheme, resolveGcmMap } from "@/core/consent/banner";
import { idParam } from "@/lib/db/tenant";
import { getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { latestVersionNumber, noticeLinks } from "@/lib/privacy/notices";
import { getSite, listPurposes } from "@/lib/privacy/registers";
import { siteRetentionStatus } from "@/lib/privacy/retention";
import { istDateTime } from "@/core/breach/model";
import { baseUrl } from "@/lib/request";
import { SiteForm } from "../site-form";
import { BannerForm } from "./banner-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.nav.sites") };
}

export default async function EditSitePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ t: tenant, canWrite, org }, t, { id }, base] = await Promise.all([requireOrg(), getT(), params, baseUrl()]);
  const siteId = idParam(id);
  const site = siteId ? await getSite(tenant, siteId) : undefined;
  if (!site) notFound();
  const [purposes, published, retention] = await Promise.all([listPurposes(tenant), latestVersionNumber(tenant), siteRetentionStatus(tenant, site.id)]);
  const consent = purposes.filter((p) => p.active === 1 && p.basis === "consent" && (p.site_id === null || p.site_id === site.id));
  const keys = consent.map((p) => p.purpose_key);
  const theme = parseTheme(site.theme_json);
  const example = keys.find((k) => /analytic/.test(k)) ?? keys[0] ?? "analytics";
  const formKeys = keys.filter((k) => /marketing|offer|whatsapp|email/.test(k)).slice(0, 2);

  const snippet = `<script src="${base}/w.js" data-site="${site.public_key}" async></script>`;
  const gating = [
    `<!-- Google tag: runs only after "${example}" is switched on -->`,
    `<script type="text/plain" data-wpk-purpose="${example}" src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>`,
    `<script type="text/plain" data-wpk-purpose="${example}">`,
    `  window.dataLayer = window.dataLayer || [];`,
    `  function gtag(){dataLayer.push(arguments);}`,
    `  gtag('js', new Date()); gtag('config', 'G-XXXXXXX');`,
    `</script>`,
    ``,
    `<!-- Embedded content (YouTube, maps): -->`,
    `<iframe data-wpk-purpose="${example}" data-wpk-src="https://www.youtube-nocookie.com/embed/VIDEO_ID"></iframe>`,
  ].join("\n");
  const links = [
    `<a href="#" data-wpk-open>Privacy choices</a>`,
    `<a href="#" data-wpk-withdraw>Withdraw consent</a>`,
    `<a href="${noticeLinks(base, org.slug).notice}">Privacy notice</a>`,
    ``,
    `<form id="enquiry"> … <input name="email" type="email"> … <button type="submit">Send</button></form>`,
    `<script>`,
    `  window.addEventListener("load", function () {`,
    `    wpk.form(document.getElementById("enquiry"), { purposes: ${JSON.stringify(formKeys.length ? formKeys : keys.slice(0, 1))}, subject: "email" });`,
    `  });`,
    `</script>`,
  ].join("\n");

  return (
    <>
      <DashHeader
        title={site.name}
        description={site.domain}
        actions={
          <>
            <ButtonLink href={`/dashboard/sites/${site.id}/consents`} variant="outline" size="sm">
              {t("dash.consents.title")}
            </ButtonLink>
            {canWrite ? (
              <ActionButton action={archiveSiteAction} fields={{ id: site.id, archive: site.archived_at ? "0" : "1" }} confirmText={site.archived_at ? undefined : t("dash.sites.confirmArchive")}>
                {t(site.archived_at ? "dash.sites.unarchive" : "dash.sites.archive")}
              </ActionButton>
            ) : null}
            {canWrite && retention?.canDelete ? (
              <ActionButton action={deleteSiteAction} fields={{ id: site.id }} variant="danger" confirmText={t(retention.events ? "dash.sites.confirmDeletePurge" : "dash.confirmDelete")}>
                {t("dash.delete")}
              </ActionButton>
            ) : null}
          </>
        }
      />
      {site.archived_at ? (
        <Alert tone="warning" className="mb-6 max-w-3xl">
          {t("dash.sites.archivedNote", { date: istDateTime(site.archived_at) })}
        </Alert>
      ) : null}
      {retention && retention.events > 0 ? (
        <p className="mb-6 max-w-3xl text-sm text-muted">
          {t("dash.sites.retentionStatus", { count: retention.events, date: istDateTime(retention.expiresAt) })}
          {retention.purged ? ` ${t("dash.sites.purgedCount", { count: retention.purged })}` : ""}
        </p>
      ) : null}
      {published ? null : (
        <Alert tone="warning" className="mb-6 max-w-3xl">
          {t("dash.sites.noNotice")}
        </Alert>
      )}
      <Panel title={t("dash.sites.snippet")} description={t("dash.sites.snippetHint", { domain: site.domain })} className="mb-6 max-w-3xl">
        <CopyField value={snippet} label={t("dash.sites.snippet")} />
        <p className="mt-3 text-xs text-muted" dir="ltr">
          {t("dash.sites.purposeKeys", { keys: keys.join(", ") || "—" })}
        </p>
      </Panel>
      <Panel title={t("dash.banner.title")} description={t("dash.banner.subtitle")} className="mb-6 max-w-3xl">
        <BannerForm
          t={t}
          siteId={site.id}
          theme={theme}
          gcm={resolveGcmMap(theme, keys)}
          purposes={consent.map((p) => ({ key: p.purpose_key, name: p.name_en }))}
          canWrite={canWrite}
        />
      </Panel>
      <Panel title={t("dash.sites.gating")} description={t("dash.sites.gatingHint")} className="mb-6 max-w-3xl">
        <CopyField value={gating} label={t("dash.sites.gating")} multiline />
      </Panel>
      <Panel title={t("dash.sites.links")} description={t("dash.sites.linksHint")} className="mb-6 max-w-3xl">
        <CopyField value={links} label={t("dash.sites.links")} multiline />
      </Panel>
      <Panel className="max-w-3xl">
        <SiteForm t={t} site={site} canWrite={canWrite} />
      </Panel>
    </>
  );
}
