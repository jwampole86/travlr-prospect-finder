import React from 'react';
import { Document, Page, Text, View, Link, StyleSheet, Font } from '@react-pdf/renderer';
import type { HomeownerReport } from '@/lib/homeownerEstimateTypes';
import {
  buildEquipmentView, TYPICAL_PERMIT_COSTS, TYPICAL_PERMIT_STEPS, TYPICAL_PROCESSING, PERMIT_HELP, SETUP_HELP, OWNER_DASHBOARD,
  type EquipmentKey,
} from '@/lib/homeownerReportContent';
import { CONTACT_EMAIL, CONTACT_PHONE } from '@/lib/homeownerContact';

// Never split words with hyphens: it reads badly in a client-facing document.
Font.registerHyphenationCallback(word => [word]);

// Built-in PDF fonts cover Latin-1 only. Map anything else to a safe equivalent so no glyph renders as garbage.
const t = (s: string | null | undefined) => (s ?? '')
  .replace(/[\u2018\u2019]/g, '\u2019').replace(/[\u201c\u201d]/g, '"')
  .replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...').replace(/\u2713/g, '')
  .replace(/[^\x09\x0a\x20-\x7e\u00a0-\u00ff\u2019]/g, '');

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const compact = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M` : n >= 10_000 ? `$${Math.round(n / 1000)}K` : usd(n));
const dateLabel = (iso: string | null) => { if (!iso) return null; try { return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); } catch { return null; } };

const C = {
  ink: '#0f172a', body: '#334155', muted: '#64748b', line: '#e2e8f0', soft: '#f8fafc',
  indigo: '#4338ca', indigoDark: '#1e1b4b', indigoSoft: '#eef2ff', indigoLine: '#c7d2fe',
  green: '#059669', greenSoft: '#ecfdf5', greenLine: '#a7f3d0', amber: '#b45309', amberSoft: '#fffbeb', amberLine: '#fcd34d',
};

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 50, paddingHorizontal: 36, fontFamily: 'Helvetica', fontSize: 9.5, color: C.body, lineHeight: 1.45 },
  hero: { backgroundColor: C.indigoDark, borderRadius: 10, padding: 22, color: '#fff' },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: '#fff' },
  heroSmall: { fontSize: 8.5, color: '#c7d2fe' },
  heroAddr: { marginTop: 18, fontSize: 10.5, color: '#e0e7ff', fontFamily: 'Helvetica-Bold' },
  heroLead: { marginTop: 12, fontSize: 10, color: '#e0e7ff' },
  heroBig: { marginTop: 4, marginBottom: 6, fontSize: 34, lineHeight: 1.1, fontFamily: 'Helvetica-Bold', color: '#fff' },
  heroBigSub: { fontSize: 13, color: '#c7d2fe', fontFamily: 'Helvetica' },
  statRow: { marginTop: 14, flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: '#312e81', borderRadius: 7, paddingVertical: 8, paddingHorizontal: 10 },
  statLabel: { fontSize: 7.5, color: '#c7d2fe', textTransform: 'uppercase', letterSpacing: 0.6 },
  statVal: { marginTop: 2, fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#fff' },
  statSub: { fontSize: 7.5, color: '#a5b4fc' },
  section: { marginTop: 20 },
  eyebrow: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.indigo, textTransform: 'uppercase', letterSpacing: 1.2 },
  h2: { marginTop: 2, fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.ink },
  sub: { marginTop: 3, fontSize: 9.5, color: C.muted },
  row: { flexDirection: 'row', gap: 8 },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 11 },
  h3: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.ink },
  bold: { fontFamily: 'Helvetica-Bold', color: C.ink },
  small: { fontSize: 8.5, color: C.muted },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  bar: { flexDirection: 'row', height: 22, borderRadius: 5, overflow: 'hidden', marginTop: 8 },
  footerLeft: { position: 'absolute', bottom: 22, left: 36, fontSize: 7.5, color: C.muted },
  step: { flexDirection: 'row', gap: 8, marginTop: 5 },
  stepNo: { width: 15, height: 15, borderRadius: 8, backgroundColor: C.indigo, alignItems: 'center', justifyContent: 'center' },
  stepNoText: { color: '#fff', fontSize: 8, lineHeight: 1, fontFamily: 'Helvetica-Bold' },
});

function Title({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <View minPresenceAhead={80}>
      <Text style={s.eyebrow}>{eyebrow}</Text>
      <Text style={s.h2}>{t(title)}</Text>
      {sub ? <Text style={s.sub}>{t(sub)}</Text> : null}
    </View>
  );
}

const Kv = ({ k, v, bold }: { k: string; v: string; bold?: boolean }) => (
  <View style={s.kv}><Text style={{ color: C.muted }}>{t(k)}</Text><Text style={bold ? s.bold : undefined}>{t(v)}</Text></View>
);

export function HomeownerReportPdf({ report, equipment }: { report: HomeownerReport; equipment: EquipmentKey[] | null }) {
  const [cons, exp, opt] = report.scenarios;
  const reg = report.regulation;
  const permit = reg.permit;
  const place = [report.city, report.state].filter(Boolean).join(', ');
  const placeOrArea = place || 'your area';
  const verified = dateLabel(reg.lastVerified);
  const maxYear = Math.max(...report.fiveYear.map(y => Math.max(y.net, y.longTerm)), 1);
  const eq = buildEquipmentView(equipment, permit?.safety ?? []);
  const steps = permit?.steps.length ? permit.steps : TYPICAL_PERMIT_STEPS;
  const barColors = ['#4338ca', '#6366f1', '#64748b', '#94a3b8'];
  const toneColor = reg.tone === 'good' ? C.green : reg.tone === 'bad' ? '#be123c' : reg.tone === 'caution' ? C.amber : C.muted;

  return (
    <Document title={t(`TRAVLR - Property Revenue Report ${report.street}`)} author="TRAVLR Vacation Homes" subject="Vacation rental revenue estimate">
      <Page size="LETTER" style={s.page}>
        <Text fixed style={s.footerLeft}>TRAVLR Vacation Homes  |  {CONTACT_EMAIL}  |  Estimate for planning purposes, not a guarantee of income</Text>

        <View style={s.hero}>
          <View style={s.brandRow}>
            <View><Text style={s.brand}>TRAVLR Vacation Homes</Text><Text style={s.heroSmall}>Property Revenue Report</Text></View>
            <Text style={s.heroSmall}>Prepared {dateLabel(report.generatedAt)}</Text>
          </View>
          <Text style={s.heroAddr}>{t(`${report.street}${place ? `, ${place}` : ''}${report.zip ? ` ${report.zip}` : ''}`)}</Text>
          <Text style={s.heroLead}>Your home could earn an estimated</Text>
          <Text style={s.heroBig}>{usd(exp.annualNet)}<Text style={s.heroBigSub}> / year</Text></Text>
          <Text style={{ fontSize: 9.5, color: '#e0e7ff', marginTop: 2 }}>
            Net to you after all operating costs. Realistic range {compact(cons.annualNet)} to {compact(opt.annualNet)} a year.
          </Text>
          <View style={s.statRow}>
            {[
              ['Net per month', usd(exp.netMonthly), 'to you'], ['Gross bookings', usd(exp.grossMonthly), 'per month'],
              ['Nightly rate', usd(exp.adr), 'average (ADR)'], ['Occupancy', `${exp.occupancy}%`, 'nights booked'],
            ].map(([l, v, sub]) => (
              <View key={l} style={s.stat}><Text style={s.statLabel}>{l}</Text><Text style={s.statVal}>{v}</Text><Text style={s.statSub}>{sub}</Text></View>
            ))}
          </View>
          <Text style={{ marginTop: 10, fontSize: 8, color: '#a5b4fc' }}>{t(report.basisLabel)}.</Text>
        </View>

        <View style={s.section}>
          <Title eyebrow="Revenue outlook" title="Three ways the year could go" sub="Occupancy and nightly rates move with the season, local events and how well a listing is managed. We plan around the expected case." />
          <View style={[s.row, { marginTop: 10 }]}>
            {report.scenarios.map(sc => {
              const featured = sc.key === 'expected';
              return (
                <View key={sc.key} wrap={false} style={[s.card, { flex: 1 }, featured ? { borderColor: C.indigoLine, backgroundColor: C.indigoSoft } : {}]}>
                  <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: featured ? C.indigo : C.muted, textTransform: 'uppercase' }}>{sc.label}{featured ? '  (most likely)' : ''}</Text>
                  <Text style={{ marginTop: 5, fontSize: 18, lineHeight: 1.2, fontFamily: 'Helvetica-Bold', color: C.ink }}>{usd(sc.annualNet)}</Text>
                  <Text style={s.small}>net per year</Text>
                  <View style={{ marginTop: 6 }}>
                    <Kv k="Net per month" v={usd(sc.netMonthly)} bold /><Kv k="Nightly rate" v={usd(sc.adr)} bold /><Kv k="Occupancy" v={`${sc.occupancy}%`} bold />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={s.section}>
          <Title eyebrow="Transparent economics" title="Where each month's revenue goes" sub={`On an expected ${usd(exp.grossMonthly)} of monthly bookings, this is how revenue turns into the ${usd(exp.netMonthly)} you keep.`} />
          <View wrap={false}>
          <View style={s.bar}>
            <View style={{ width: '65%', backgroundColor: C.green, justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 8, fontFamily: 'Helvetica-Bold', textAlign: 'center' }}>You keep 65%</Text></View>
            {report.costs.map((c, i) => <View key={c.label} style={{ width: `${c.pct}%`, backgroundColor: barColors[i] ?? '#94a3b8' }} />)}
          </View>
          <View style={{ marginTop: 8 }}>
            <Kv k="Owner net income" v={usd(exp.netMonthly)} bold />
            {report.costs.map(c => <Kv key={c.label} k={`${c.label} (${c.pct}%)`} v={usd(c.monthly)} />)}
          </View>
          </View>
        </View>

        <View style={s.section}>
          <Title eyebrow="The advantage" title="Vacation rental vs. a traditional lease" sub="The same home, two strategies. Both figures are net of operating costs and use the same growth assumption (3% a year)." />
          <View style={[s.row, { marginTop: 10 }]}>
            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.h3}>Per month</Text>
              <View style={{ marginTop: 8 }}>
                <Kv k="Vacation rental with TRAVLR" v={usd(exp.netMonthly)} bold />
                <View style={{ height: 7, backgroundColor: '#f1f5f9', borderRadius: 4 }}><View style={{ height: 7, width: '100%', backgroundColor: C.green, borderRadius: 4 }} /></View>
                <Kv k="Typical long-term lease" v={usd(report.longTermRent)} bold />
                <View style={{ height: 7, backgroundColor: '#f1f5f9', borderRadius: 4 }}><View style={{ height: 7, width: `${Math.min(100, Math.max(6, Math.round((report.longTermRent / Math.max(exp.netMonthly, 1)) * 100)))}%`, backgroundColor: '#94a3b8', borderRadius: 4 }} /></View>
              </View>
              <View style={{ marginTop: 9, backgroundColor: C.greenSoft, borderWidth: 1, borderColor: C.greenLine, borderRadius: 6, padding: 7 }}>
                <Text style={{ color: '#065f46' }}>
                  {report.advantageMonthly > 0 ? `About ${usd(report.advantageMonthly)} more per month, or ${usd(report.advantageAnnual)} a year, than a standard lease.` : 'Comparable to a standard lease, with far more flexibility: you can still use the home yourself.'}
                </Text>
              </View>
              <Text style={[s.small, { marginTop: 5 }]}>Lease figure is an estimate of market rent for a home like yours.</Text>
            </View>
            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.h3}>Five-year view</Text>
              <Text style={s.small}>Cumulative net: {compact(report.fiveYearTotal)} vs {compact(report.fiveYearLongTermTotal)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 78, marginTop: 8, gap: 6 }}>
                {report.fiveYear.map(y => (
                  <View key={y.year} style={{ flex: 1, alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 66, gap: 2 }}>
                      <View style={{ width: 9, height: Math.max(4, (y.net / maxYear) * 66), backgroundColor: C.green }} />
                      <View style={{ width: 9, height: Math.max(4, (y.longTerm / maxYear) * 66), backgroundColor: '#cbd5e1' }} />
                    </View>
                    <Text style={[s.small, { marginTop: 2 }]}>Yr {y.year}</Text>
                  </View>
                ))}
              </View>
              <Text style={[s.small, { marginTop: 4 }]}>Green: vacation rental. Grey: long-term lease.</Text>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Title eyebrow="Your owner dashboard" title="See everything about your home in one place" sub="When you join TRAVLR you get your own secure homeowner dashboard. Your earnings, bookings and updates are always a click away." />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {OWNER_DASHBOARD.map(f => (
              <View key={f.title} wrap={false} style={[s.card, { width: '32%', backgroundColor: C.soft }]}>
                <Text style={s.h3}>{t(f.title)}</Text>
                <Text style={[s.small, { marginTop: 3 }]}>{t(f.body)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <Title eyebrow="Rules & permits" title={`Short-term rental rules${place ? ` in ${place}` : ' for your area'}`} sub="What your city or county requires before you can host, so there are no surprises." />
          <View wrap={false} style={[s.card, { marginTop: 10, borderColor: toneColor, backgroundColor: C.soft }]}>
            <Text style={[s.h3, { color: toneColor }]}>{t(reg.headline)}</Text>
            {reg.summary ? <Text style={{ marginTop: 3 }}>{t(reg.summary)}</Text> : null}
            {reg.note ? <Text style={[s.small, { marginTop: 4 }]}>{t(reg.note)}</Text> : null}
          </View>
          {reg.requirements.length > 0 && (
            <View style={[s.card, { marginTop: 8 }]}>
              <Text style={[s.small, { fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' }]}>Requirements for {t(reg.jurisdiction)}</Text>
              {reg.requirements.map(r => (
                <View key={r.label} wrap={false} style={{ flexDirection: 'row', paddingVertical: 3, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 3 }}>
                  <Text style={{ width: 110, fontFamily: 'Helvetica-Bold', color: C.ink }}>{t(r.label)}</Text>
                  <Text style={{ flex: 1, color: r.required === false ? C.muted : C.body }}>{t(r.value)}</Text>
                </View>
              ))}
            </View>
          )}
          {reg.taxes ? <View wrap={false} style={[s.card, { marginTop: 8 }]}><Text style={s.h3}>Taxes</Text><Text style={{ marginTop: 3 }}>{t(reg.taxes)}</Text></View> : null}
          {!reg.found && (
            <View wrap={false} style={[s.card, { marginTop: 8 }]}>
              <Text style={s.h3}>What almost every market asks for</Text>
              {reg.typicalChecklist.map(i => <Text key={i} style={{ marginTop: 3 }}>- {t(i)}</Text>)}
            </View>
          )}
          {reg.found && <Text style={[s.small, { marginTop: 6 }]}>{t(`Compiled from public sources${reg.sourceName ? `, including ${reg.sourceName}` : ''}${verified ? `, last checked ${verified}` : ''}. Rules change, so your TRAVLR specialist confirms the current requirements for your exact address before anything is listed.`)}</Text>}
        </View>

        <View style={s.section}>
          <Title eyebrow="Permits & licenses" title="What it takes to get licensed, and what it costs" sub="Most homeowners have never done this before, and that is fine. Your specialist walks you through every step." />
          <View wrap={false} style={[s.card, { marginTop: 10 }]}>
            <Text style={s.h3}>{permit ? `Costs specific to ${t(placeOrArea)}` : 'Typical costs (general estimates)'}</Text>
            {permit ? (
              <View style={{ marginTop: 4 }}>
                {permit.name ? <Text style={s.bold}>{t(permit.name)}</Text> : null}
                {permit.costSummary ? <Text style={{ marginTop: 2 }}>{t(permit.costSummary)}</Text> : null}
                {permit.renewal ? <Text style={{ marginTop: 2 }}>Renewal: {t(permit.renewal)}</Text> : null}
                {permit.processingTime ? <Text style={{ marginTop: 2 }}>Timing: {t(permit.processingTime)}</Text> : null}
                {permit.applicationUrl ? <Link src={permit.applicationUrl} style={{ marginTop: 2, color: C.indigo }}>Official application page</Link> : null}
              </View>
            ) : (
              <View style={{ marginTop: 4 }}>
                {TYPICAL_PERMIT_COSTS.map(c => (
                  <View key={c.label} style={{ flexDirection: 'row', paddingVertical: 2 }}>
                    <Text style={{ width: 170, fontFamily: 'Helvetica-Bold', color: C.ink }}>{t(c.label)}</Text>
                    <Text style={{ flex: 1 }}>{t(c.range)}</Text>
                  </View>
                ))}
                <Text style={{ marginTop: 5, fontSize: 8.5, color: C.amber }}>{t(`These are typical ranges across U.S. markets, not the fees for ${placeOrArea}. Your specialist confirms the real amounts before you pay anything. ${TYPICAL_PROCESSING}`)}</Text>
              </View>
            )}
          </View>
          <View wrap={false} style={[s.card, { marginTop: 8 }]}>
            <Text style={s.h3}>The steps</Text>
            {steps.map((st, i) => <View key={i} style={s.step}><View style={s.stepNo}><Text style={s.stepNoText}>{i + 1}</Text></View><Text style={{ flex: 1 }}>{t(st)}</Text></View>)}
          </View>
          <View wrap={false} style={[s.card, { marginTop: 8, backgroundColor: C.indigoSoft, borderColor: C.indigoLine }]}>
            <Text style={[s.h3, { color: C.indigo }]}>How TRAVLR helps</Text>
            {PERMIT_HELP.map(h => <Text key={h} style={{ marginTop: 3 }}>- {t(h)}</Text>)}
            <Text style={[s.small, { marginTop: 4 }]}>Permit fees are paid to the city and are separate from TRAVLR&apos;s management fee.</Text>
          </View>
        </View>

        <View style={s.section}>
          <Title eyebrow="Safety & smart-home setup" title="Getting the home guest-ready"
            sub={equipment !== null ? `Based on what you told us the home already has${eq.mustHaveCount ? `, here is what is worth adding first (${eq.mustHaveCount} must-have${eq.mustHaveCount === 1 ? '' : 's'}).` : ', you are in good shape on the essentials.'}` : 'The safety essentials and smart-home equipment that make a rental safer to operate.'} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {eq.items.map(({ item, status, cityRequired }) => (
              <View key={item.key} wrap={false} style={[s.card, { width: '49%' }, status === 'need' ? { borderColor: C.amberLine, backgroundColor: C.amberSoft } : status === 'have' ? { borderColor: C.greenLine, backgroundColor: C.greenSoft } : {}]}>
                <Text style={s.h3}>{t(item.label)}</Text>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', marginTop: 1, color: status === 'have' ? C.green : status === 'need' ? C.amber : C.muted }}>
                  {[cityRequired ? `Required in ${placeOrArea}` : null, status === 'have' ? 'You have this' : status === 'need' ? 'Add this' : status === 'optional' ? 'Recommended' : null].filter(Boolean).join('  |  ')}
                </Text>
                <Text style={[s.small, { marginTop: 3 }]}>{t(item.why)}</Text>
                {item.note ? <Text style={[s.small, { marginTop: 2, color: C.amber }]}>{t(item.note)}</Text> : null}
                {status !== 'have' ? <Text style={[s.small, { marginTop: 3 }]}>Typical cost: <Text style={s.bold}>{t(item.cost)}</Text></Text> : null}
              </View>
            ))}
          </View>
          {eq.otherCity.length > 0 && (
            <View wrap={false} style={[s.card, { marginTop: 8 }]}>
              <Text style={s.h3}>Also required by the city in {t(placeOrArea)}</Text>
              {eq.otherCity.map(o => <Text key={o.item} style={{ marginTop: 3 }}><Text style={s.bold}>{t(o.item)}. </Text>{t(o.detail)}</Text>)}
            </View>
          )}
          <Text style={{ marginTop: 8 }}>{t(SETUP_HELP)} Costs shown are typical retail ranges and vary by brand and installation.</Text>
        </View>

        <View wrap={false} style={[s.section, { backgroundColor: C.indigoDark, borderRadius: 10, padding: 18 }]}>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#fff' }}>Ready to see what your home can really earn?</Text>
          <Text style={{ marginTop: 4, color: '#e0e7ff' }}>A TRAVLR specialist will contact you within one business day to refine these numbers with your home's details. No obligation.</Text>
          <Text style={{ marginTop: 8, color: '#fff', fontFamily: 'Helvetica-Bold' }}>{CONTACT_EMAIL}{CONTACT_PHONE ? `   |   ${CONTACT_PHONE}` : ''}</Text>
        </View>

        <Text style={{ marginTop: 14, fontSize: 7.5, color: C.muted }}>
          This report is an estimate for planning purposes, not a guarantee of income. Projections are based on typical performance for homes like yours and local market data and will vary with seasonality, pricing, regulations, property condition and guest demand. Regulatory information is a summary of public sources and is not legal advice; please confirm requirements with your local authority. TRAVLR Vacation Homes is not responsible for decisions made solely on this estimate.
        </Text>

      </Page>
    </Document>
  );
}
