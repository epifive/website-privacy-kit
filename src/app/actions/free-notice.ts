"use server";

import { buildFreeNoticeInput, readFreeNoticeForm, type FreeNoticeError } from "@/core/free-notice";
import { marketingT, type MarketingKey } from "@/core/marketing/text";
import { renderMarkdown } from "@/core/notice/markdown";
import { renderNotice, renderStandaloneHtml } from "@/core/notice/render";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export interface FreeNoticeState {
  error?: string;
  /** Changes on every successful run so the client can scroll to the new preview. */
  runId?: number;
  warning?: string;
  notices?: Array<{ lang: "en" | "hi"; title: string; html: string; document: string; sha256: string }>;
}

const ERRORS: Record<FreeNoticeError, MarketingKey> = {
  orgName: "ng.err.orgName",
  goods: "ng.err.goods",
  website: "ng.err.website",
  noticeUrl: "ng.err.noticeUrl",
  purposes: "ng.err.purposes",
  contactName: "ng.err.contactName",
  contactEmail: "ng.err.contactEmail",
  identifiers: "ng.err.identifiers",
};

/**
 * Free notice generator (no login). Renders a draft notice in English and Hindi
 * from the submitted answers and returns it; nothing is stored or logged.
 */
export async function generateFreeNotice(_prev: FreeNoticeState, formData: FormData): Promise<FreeNoticeState> {
  const t = marketingT(formData.get("lang") === "hi" ? "hi" : "en");
  if (!rateLimit(`free-notice:${await clientIp()}`, 20, 60_000)) return { error: t("ng.err.rate") };

  const answers = readFreeNoticeForm(
    (n) => formData.get(n),
    (n) => formData.getAll(n),
  );
  const built = buildFreeNoticeInput(answers);
  if (!built.ok) return { error: t(ERRORS[built.error]) };

  const notices = renderNotice(built.input).map((n) => ({
    lang: n.lang,
    title: n.title,
    sha256: n.sha256,
    html: renderMarkdown(n.bodyMd),
    document: renderStandaloneHtml(n),
  }));
  return {
    runId: Date.now(),
    notices,
    warning: built.warnings.includes("goodsHiMissing") ? t("ng.warnGoodsHi") : undefined,
  };
}
