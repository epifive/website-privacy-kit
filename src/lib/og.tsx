import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

/**
 * Open Graph card (1200×630) in the brand colours. Uses the bundled default
 * font, so callers pass Latin text (Hindi pages use their English title plus a
 * "Hindi" label) to avoid missing glyphs.
 */
export function ogCard({ eyebrow, title, footer }: { eyebrow: string; title: string; footer?: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #f0fdfa 0%, #ffffff 55%, #fef9c3 100%)",
          color: "#1b1a24",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "#0f766e", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 30, fontWeight: 700 }}>
            E
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, color: "#0f766e" }}>EpiFive Website Privacy Kit</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 28, fontWeight: 600, color: "#115e59", textTransform: "uppercase", letterSpacing: 2 }}>{eyebrow}</div>
          <div style={{ fontSize: title.length > 60 ? 54 : 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 1040 }}>{title}</div>
        </div>
        <div style={{ fontSize: 24, color: "#57534e" }}>{footer ?? "DPDP Act 2023 · DPDP Rules 2025 · Not legal advice"}</div>
      </div>
    ),
    OG_SIZE,
  );
}
