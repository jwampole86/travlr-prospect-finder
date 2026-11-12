import type { Metadata } from 'next';
import Link from 'next/link';
import MarketingFooter from '@/app/prospect-finder/components/MarketingFooter';

export const metadata: Metadata = {
  title: 'Security | AVYRO AI',
  description: 'How AVYRO AI protects homeowner contact data, limits access, and handles texting, opt-outs and AI.',
};

const VENDORS: [string, string][] = [
  ['Supabase', 'Database and sign-in'],
  ['Vercel', 'Hosting and deployment'],
  ['Twilio', 'Texting and calling'],
  ['Resend', 'Email'],
  ['Anthropic', 'AI assistance (AVA) and analysis'],
];

const SECTIONS: { title: string; points: string[] }[] = [
  {
    title: 'Access',
    points: [
      'Access is role-based. Admins, owners and agents see different data and can do different things.',
      'Row-level security is enforced in the database, so access rules do not depend on the screen alone.',
      'Each organization works only with the data sources and plan allowances it has enabled.',
    ],
  },
  {
    title: 'Texting and contact',
    points: [
      'Texts are sent only between 9am and 8pm in the owner\u2019s time zone.',
      'Opt-outs (STOP and similar words) are honored automatically and stop all further texts.',
      'We do not promise a verified identity, phone number or outcome on every lead.',
      'Texting, consent and opt-out handling are described on the TCPA compliance page.',
    ],
  },
  {
    title: 'AI',
    points: [
      'AVA only sees what the signed-in person\u2019s role allows.',
      'AVA never clicks or types for you and never changes a record without your explicit approval.',
      'Value, score and income figures are estimates, not appraisals or guarantees.',
    ],
  },
  {
    title: 'Data in transit',
    points: ['The site and its APIs are served over HTTPS.'],
  },
];

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold">Security at AVYRO AI</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          AVYRO AI handles homeowner contact details, property data and messages. This page lists the protections we can describe today.
          For anything more detailed, such as a security questionnaire, write to{' '}
          <a className="underline" href="mailto:security@avyropro.ai">security@avyropro.ai</a>.
        </p>

        {SECTIONS.map((s) => (
          <section key={s.title} className="mt-8">
            <h2 className="text-lg font-semibold">{s.title}</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              {s.points.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </section>
        ))}

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Services we rely on</h2>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border text-sm">
            {VENDORS.map(([name, use]) => (
              <li key={name} className="flex justify-between gap-4 px-4 py-2"><span className="font-medium">{name}</span><span className="text-muted-foreground">{use}</span></li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Report a vulnerability</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Email <a className="underline" href="mailto:security@avyropro.ai">security@avyropro.ai</a> with what you found and how to reproduce it. Please do not access other people&rsquo;s data or disrupt the service while testing.
          </p>
        </section>

        <p className="mt-10 text-sm text-muted-foreground">
          See also the <Link className="underline" href="/privacy-policy">Privacy Policy</Link>, <Link className="underline" href="/terms-of-service">Terms of Service</Link> and <Link className="underline" href="/tcpa-compliance">TCPA compliance</Link>.
        </p>
      </div>
      <MarketingFooter />
    </main>
  );
}
