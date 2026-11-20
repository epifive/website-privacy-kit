import { Meter, Panel } from "@/components/dashboard/ui";
import { PRO_URL, type UsageMeter } from "@/lib/edition";
import type { Translator } from "@/lib/i18n/messages";

/** Edition, limits and this month's activity for the current organisation. Server component. */
export function UsagePanel({ meter, t, className }: { meter: UsageMeter; t: Translator; className?: string }) {
  const fmt = (n: number) => n.toLocaleString("en-IN");
  const limitText = (n: number) => (n > 0 ? fmt(n) : t("dash.usage.unlimited"));
  return (
    <Panel
      title={t("dash.usage.title")}
      className={className}
      actions={
        meter.entitlements.edition === "free" ? (
          <a href={PRO_URL} target="_blank" rel="noopener" className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-white hover:opacity-90">
            {t("dash.nav.getPro")}
          </a>
        ) : null
      }
    >
      <p className="text-sm">
        <strong>{meter.entitlements.edition === "free" ? t("account.editionFree") : t("dash.usage.pro")}</strong>
        <span className="text-muted"> · {t("dash.usage.events")}: {fmt(meter.events.used)}</span>
      </p>
      <div className="mt-4 grid gap-5 sm:grid-cols-3">
        <Meter label={t("dash.usage.sites")} used={meter.sites.used} limit={meter.sites.limit} usedText={fmt(meter.sites.used)} limitText={limitText(meter.sites.limit)} />
        <Meter label={t("dash.usage.members")} used={meter.members.used} limit={meter.members.limit} usedText={fmt(meter.members.used)} limitText={limitText(meter.members.limit)} />
        <Meter label={t("dash.usage.orgs")} used={meter.orgs.used} limit={meter.orgs.limit} usedText={fmt(meter.orgs.used)} limitText={limitText(meter.orgs.limit)} />
      </div>
      <p className="mt-4 text-sm text-muted">{t("dash.usage.requests", { count: fmt(meter.rightsRequests) })}</p>
      {meter.entitlements.edition === "free" ? <p className="mt-1 text-xs text-muted">{t("dash.usage.freeNote")}</p> : null}
    </Panel>
  );
}
