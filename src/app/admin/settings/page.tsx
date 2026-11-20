import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";

export default async function SettingsIndex() {
  // Layouts and pages render in parallel: check here too, not only in the admin layout.
  await requireAdmin();
  redirect("/admin/settings/general");
}
