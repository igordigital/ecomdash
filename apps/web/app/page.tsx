/**
 * Overview (slice 1 placeholder). Will read mart_mer_rolling only; the
 * dashboard never scans raw or fact tables at request time. Data changes once
 * per day, so pages cache until the daily job hits /api/revalidate.
 */
export default function OverviewPage() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 600 }}>ecomdash</h1>
      <p style={{ color: "#9aa4b2" }}>
        Blended MER and campaign health, anchored to store truth.
      </p>

      <section
        style={{
          marginTop: "2rem",
          padding: "1.5rem",
          border: "1px solid #1f2733",
          borderRadius: 8,
        }}
      >
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0 }}>
          Rolling MER (7d / 28d)
        </h2>
        <p style={{ fontSize: "2.2rem", fontWeight: 700, margin: "0.5rem 0" }}>
          &mdash;
        </p>
        <p style={{ color: "#9aa4b2", fontSize: "0.85rem" }}>
          MER credits all revenue, including organic, email, and direct, to paid
          spend. Store net revenue divided by total ad spend across platforms.
        </p>
        <p style={{ color: "#5c6773", fontSize: "0.8rem" }}>
          Wired to mart_mer_rolling in slice 1.
        </p>
      </section>
    </main>
  );
}
