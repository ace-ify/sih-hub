import { ImageResponse } from "next/og";
import { byId, statements, crowding, daysLeft } from "@/lib/data";
import { SITE_NAME } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Every path must be known at build time for a static export.
export function generateStaticParams() {
  return statements.map((s) => ({ id: s.ps_number }));
}

export const dynamicParams = false;

/**
 * Per-statement share card.
 *
 * The card must key off `params.id` — the route being rendered. Reading an
 * image `id` from generateImageMetadata instead is the trap that makes every
 * statement serve the same card; there is deliberately no generateImageMetadata
 * here, so one route means one image.
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = byId.get(id);

  if (!s) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%", height: "100%", display: "flex",
            alignItems: "center", justifyContent: "center",
            background: "#0a0a0a", color: "#fafafa", fontSize: 48,
          }}
        >
          {SITE_NAME}
        </div>
      ),
      size
    );
  }

  const left = daysLeft(s.deadline_date);
  const crowd = crowding(s);
  // 1200px fits roughly this much title before it overflows the card.
  const title = s.title.length > 150 ? `${s.title.slice(0, 147)}…` : s.title;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", background: "#0a0a0a", color: "#fafafa",
          padding: "64px 72px", fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30 }}>
            <span style={{ color: "#a1a1aa", letterSpacing: 1 }}>{s.ps_number}</span>
            <span
              style={{
                padding: "4px 18px", borderRadius: 999, fontSize: 24,
                background: s.category === "Hardware" ? "#3f3f46" : "#1e3a8a",
                color: "#fafafa",
              }}
            >
              {s.category}
            </span>
            <span style={{ color: "#a1a1aa" }}>{s.theme}</span>
          </div>

          <div style={{ fontSize: title.length > 90 ? 52 : 64, lineHeight: 1.15, fontWeight: 600 }}>
            {title}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 28, color: "#d4d4d8" }}>{s.organization}</div>
          <div
            style={{
              display: "flex", alignItems: "center", gap: 28, fontSize: 26,
              color: "#a1a1aa", borderTop: "1px solid #27272a", paddingTop: 20,
            }}
          >
            <span>{s.deadline}</span>
            {left !== null && left >= 0 && (
              <span style={{ color: left <= 7 ? "#fb7185" : "#a1a1aa" }}>
                {left === 0 ? "closes today" : `${left} days left`}
              </span>
            )}
            {s.ideas !== null && (
              <span>
                {s.ideas}/{s.ideas_quota} ideas{crowd ? ` · ${crowd.label}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>
    ),
    size
  );
}
