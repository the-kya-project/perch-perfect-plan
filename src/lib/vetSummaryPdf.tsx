import { Document, Page, View, Text, StyleSheet, pdf } from "@react-pdf/renderer";

// Vector PDF for the vet summary — a real PDF generated client-side (no
// window.print, which is unreliable in the iOS standalone PWA, and no
// html2canvas, which clips rows across page breaks). @react-pdf paginates
// automatically; table headers repeat via `fixed` and rows use `wrap={false}`
// so nothing is split. This module is dynamically imported on demand so the
// renderer stays out of the entry bundle.

const NONE = "none on file";

// Hex equivalents of the design tokens (react-pdf can't read CSS variables).
const C = {
  ink: "#1a3d2e",
  mute: "#5b6b61",
  mute2: "#8a8270",
  line: "#e0d8c4",
  line2: "#eee6d4",
  teal: "#5a8c7a",
  amber: "#854f0b",
  redFill: "#fcebeb",
  redLine: "#e7b9b9",
  redDeep: "#791f1f",
  white: "#ffffff",
};

export type VetPdfData = {
  name: string;
  species: string | null;
  generated: string;
  fileDate: string; // YYYY-MM-DD for the filename
  identity: [string, string | null][];
  weightText: string | null;
  dietText: string | null;
  meds: string | null;
  handling: string | null;
  emergency: { label: string; value: string }[];
  weightSummary: string | null;
  weights: { date: string; time: string; grams: number; meal: string | null }[];
  journal: { date: string; kind: string | null; title: string | null; body: string }[];
};

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 44, paddingHorizontal: 44, fontSize: 10, color: C.ink, fontFamily: "Helvetica", lineHeight: 1.4 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  species: { fontSize: 11, color: C.mute, fontStyle: "italic", marginTop: 2 },
  meta: { fontSize: 9, color: C.mute2, marginTop: 3 },
  headerRule: { borderBottomWidth: 1, borderBottomColor: C.line2, marginTop: 8, marginBottom: 4 },

  section: { marginTop: 14 },
  eyebrow: { fontSize: 8.5, letterSpacing: 1, color: C.amber, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  appendixEyebrow: { fontSize: 8.5, letterSpacing: 1, color: C.teal, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  body: { marginTop: 3, fontSize: 10.5, color: C.ink },
  bodyNone: { marginTop: 3, fontSize: 10.5, color: C.mute2, fontStyle: "italic" },

  idGrid: { marginTop: 4, flexDirection: "row", flexWrap: "wrap" },
  idCell: { width: "50%", marginBottom: 6, paddingRight: 8 },
  idLabel: { fontSize: 8, letterSpacing: 0.6, color: C.mute2, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  idValue: { fontSize: 10.5, marginTop: 1 },

  emBox: { marginTop: 14, borderWidth: 1, borderColor: C.redLine, backgroundColor: C.redFill, borderRadius: 6, padding: 10 },
  emTitle: { fontSize: 8.5, letterSpacing: 1, color: C.redDeep, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  emRow: { flexDirection: "row", marginTop: 4 },
  emLabel: { width: 96, fontFamily: "Helvetica-Bold", color: C.redDeep, fontSize: 10 },
  emValue: { flex: 1, color: C.redDeep, fontSize: 10 },

  appendixDivider: { marginTop: 22, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 4 },
  appendixHeading: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 2 },

  tHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.ink, paddingBottom: 4, marginTop: 8 },
  tRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line2, paddingVertical: 4 },
  th: { fontSize: 8.5, letterSpacing: 0.5, color: C.mute, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  td: { fontSize: 10, color: C.ink },
  colDate: { width: "30%" },
  colTime: { width: "22%" },
  colWeight: { width: "20%" },
  colMeal: { width: "28%" },

  jEntry: { marginTop: 10 },
  jHead: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink },
  jKind: { color: C.mute, fontFamily: "Helvetica" },
  jBody: { fontSize: 10.5, color: C.ink, marginTop: 2 },
});

function TextSection({ label, text }: { label: string; text: string | null }) {
  return (
    <View style={s.section} minPresenceAhead={36}>
      <Text style={s.eyebrow}>{label}</Text>
      {text ? <Text style={s.body}>{text}</Text> : <Text style={s.bodyNone}>{NONE}</Text>}
    </View>
  );
}

function VetSummaryDocument({ data }: { data: VetPdfData }) {
  return (
    <Document title={`${data.name} — vet summary`} author="Kya & Co.">
      <Page size="A4" style={s.page}>
        {/* Header */}
        <Text style={s.title}>{data.name}</Text>
        {data.species ? <Text style={s.species}>{data.species}</Text> : null}
        <Text style={s.meta}>Generated {data.generated}</Text>
        <View style={s.headerRule} />

        {/* Identity */}
        <View style={s.section} minPresenceAhead={36}>
          <Text style={s.eyebrow}>Identity</Text>
          <View style={s.idGrid}>
            {data.identity.map(([l, v]) => (
              <View key={l} style={s.idCell} wrap={false}>
                <Text style={s.idLabel}>{l}</Text>
                <Text style={[s.idValue, v ? {} : { color: C.mute2, fontStyle: "italic" }]}>{v ?? NONE}</Text>
              </View>
            ))}
          </View>
        </View>

        <TextSection label="Weight" text={data.weightText} />
        <TextSection label="Diet" text={data.dietText} />
        <TextSection label="Meds & health flags" text={data.meds} />
        <TextSection label="Handling" text={data.handling} />

        {/* Emergency */}
        <View style={s.emBox} minPresenceAhead={60}>
          <Text style={s.emTitle}>Emergency contacts</Text>
          {data.emergency.map((e) => (
            <View key={e.label} style={s.emRow} wrap={false}>
              <Text style={s.emLabel}>{e.label}</Text>
              <Text style={[s.emValue, e.value ? {} : { fontStyle: "italic", opacity: 0.7 }]}>{e.value || NONE}</Text>
            </View>
          ))}
        </View>

        {/* ---------------- Appendix: Weight log ---------------- */}
        <View style={s.appendixDivider} minPresenceAhead={80}>
          <Text style={s.appendixHeading}>Appendix · Weight log</Text>
          {data.weightSummary ? <Text style={[s.body, { color: C.mute }]}>{data.weightSummary}</Text> : null}
        </View>
        {data.weights.length === 0 ? (
          <Text style={s.bodyNone}>No weight entries recorded.</Text>
        ) : (
          <View>
            <View style={s.tHeader} fixed>
              <Text style={[s.th, s.colDate]}>Date</Text>
              <Text style={[s.th, s.colTime]}>Time</Text>
              <Text style={[s.th, s.colWeight]}>Weight</Text>
              <Text style={[s.th, s.colMeal]}>Context</Text>
            </View>
            {data.weights.map((w, i) => (
              <View key={i} style={s.tRow} wrap={false}>
                <Text style={[s.td, s.colDate]}>{w.date}</Text>
                <Text style={[s.td, s.colTime]}>{w.time}</Text>
                <Text style={[s.td, s.colWeight]}>{w.grams} g</Text>
                <Text style={[s.td, s.colMeal, w.meal ? {} : { color: C.mute2 }]}>{w.meal ?? "—"}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ---------------- Appendix: Journal ---------------- */}
        <View style={s.appendixDivider} minPresenceAhead={60}>
          <Text style={s.appendixHeading}>Appendix · Journal</Text>
        </View>
        {data.journal.length === 0 ? (
          <Text style={s.bodyNone}>No journal entries recorded.</Text>
        ) : (
          data.journal.map((j, i) => (
            <View key={i} style={s.jEntry} minPresenceAhead={40}>
              <Text style={s.jHead}>
                {j.date}
                {j.kind ? <Text style={s.jKind}>  ·  {j.kind}</Text> : null}
                {j.title ? `  —  ${j.title}` : ""}
              </Text>
              {j.body ? <Text style={s.jBody}>{j.body}</Text> : null}
            </View>
          ))
        )}
      </Page>
    </Document>
  );
}

function slugify(name: string): string {
  return name.trim().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "") || "bird";
}

// Generate + save the PDF. iOS (incl. standalone PWA) ignores <a download>, so
// route through the Web Share sheet ("Save to Files") there; everything else
// uses a normal download. Returns silently if the user cancels the iOS share.
export async function downloadVetSummaryPdf(data: VetPdfData): Promise<void> {
  const blob = await pdf(<VetSummaryDocument data={data} />).toBlob();
  const filename = `${slugify(data.name)}-vet-summary-${data.fileDate}.pdf`;

  const nav = typeof navigator !== "undefined" ? navigator : (undefined as any);
  const isIOS = !!nav && (/iP(hone|ad|od)/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1));

  if (isIOS && typeof nav.canShare === "function") {
    const file = new File([blob], filename, { type: "application/pdf" });
    if (nav.canShare({ files: [file] })) {
      try { await nav.share({ files: [file], title: filename }); return; }
      catch (e: any) { if (e?.name === "AbortError") return; /* else fall through to download */ }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // iOS Safari ignores the download attribute — open the blob so it's still reachable.
  if (isIOS) window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
