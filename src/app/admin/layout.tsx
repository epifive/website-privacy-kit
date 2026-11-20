import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BrandStyle } from "@/components/site/brand-style";
import { ThemeScript, type ThemeChoice } from "@/components/site/theme";
import { requireAdmin } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/config";
import { getNonce } from "@/lib/nonce";
import { getSettings } from "@/lib/settings";
import { uploadUrl } from "@/lib/site";
import { AdminShell } from "./shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s – Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();
  const [settings, nonce] = await Promise.all([getSettings(), getNonce()]);

  return (
    <>
      <ThemeScript defaultTheme={settings.default_theme as ThemeChoice} nonce={nonce} />
      <BrandStyle color={settings.primary_color} />
      <AdminShell
        siteName={settings.site_name}
        logo={uploadUrl(settings.logo)}
        logoDark={uploadUrl(settings.logo_dark)}
        user={{ name: user.name, email: user.email }}
        demo={isDemoMode()}
        defaultTheme={settings.default_theme as ThemeChoice}
      >
        {children}
      </AdminShell>
    </>
  );
}
