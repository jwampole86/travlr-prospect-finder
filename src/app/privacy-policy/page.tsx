'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';

const EFFECTIVE_DATE = 'August 18, 2026';
const COMPANY = 'TRAVLR Inc.';
const CONTACT_EMAIL = 'privacy@travlr.com';

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: 'overview',
    title: '1. Overview',
    content: (
      <p>
        {COMPANY} (&quot;TRAVLR&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates the TRAVLR Prospect Finder platform. This Privacy Policy explains how we collect, use, disclose, and protect information about you when you use our Service. It also describes your rights regarding your personal data.
      </p>
    ),
  },
  {
    id: 'data-collected',
    title: '2. Information We Collect',
    content: (
      <div className="space-y-4">
        <div>
          <p className="font-semibold text-gray-300 mb-2">2.1 Information You Provide</p>
          <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
            <li>Account registration data (name, email, role, organization)</li>
            <li>Lead and contact data you import or enter</li>
            <li>Communication content (SMS messages, email templates, call notes)</li>
            <li>Document data submitted through e-signature workflows</li>
            <li>Support requests and feedback</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-gray-300 mb-2">2.2 Information Collected Automatically</p>
          <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
            <li>Log data (IP address, browser type, pages visited, timestamps)</li>
            <li>Device identifiers and operating system information</li>
            <li>Usage analytics via Mixpanel (events, session duration, feature usage)</li>
            <li>Cookies and similar tracking technologies</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-gray-300 mb-2">2.3 Information from Third Parties</p>
          <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
            <li>Lead enrichment data from SalesGenie and other data providers</li>
            <li>Property listing data from real estate portals</li>
            <li>Communication delivery status from Twilio and Resend</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    id: 'how-we-use',
    title: '3. How We Use Your Information',
    content: (
      <div className="space-y-3">
        <p>We use collected information to:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li>Provide, operate, and improve the Service</li>
          <li>Process and deliver outreach communications on your behalf</li>
          <li>Authenticate users and enforce access controls</li>
          <li>Generate analytics, reports, and performance insights</li>
          <li>Send transactional notifications (account alerts, billing, security)</li>
          <li>Comply with legal obligations and enforce our Terms</li>
          <li>Detect and prevent fraud, abuse, and security incidents</li>
        </ul>
        <p className="text-gray-400 text-sm mt-2">
          We do not sell your personal data to third parties. We do not use Customer Data to train AI models without explicit consent.
        </p>
      </div>
    ),
  },
  {
    id: 'sharing',
    title: '4. How We Share Information',
    content: (
      <div className="space-y-3">
        <p>We may share information with:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li><strong className="text-gray-300">Service providers</strong> — Supabase (database), Twilio (SMS/voice), Resend (email), DocuSign (e-signatures), Mixpanel (analytics), Stripe (billing), OpenAI/Anthropic (AI features)</li>
          <li><strong className="text-gray-300">Legal authorities</strong> — when required by law, court order, or to protect rights and safety</li>
          <li><strong className="text-gray-300">Business transfers</strong> — in connection with a merger, acquisition, or sale of assets</li>
          <li><strong className="text-gray-300">With your consent</strong> — for any other purpose with your explicit consent</li>
        </ul>
        <p>All service providers are contractually required to protect your data and use it only for the purposes we specify.</p>
      </div>
    ),
  },
  {
    id: 'cookies',
    title: '5. Cookies and Tracking',
    content: (
      <div className="space-y-3">
        <p>We use cookies and similar technologies for:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li><strong className="text-gray-300">Essential cookies</strong> — authentication sessions, CSRF protection</li>
          <li><strong className="text-gray-300">Analytics cookies</strong> — Mixpanel event tracking to understand feature usage</li>
          <li><strong className="text-gray-300">Preference cookies</strong> — storing UI preferences (theme, sidebar state)</li>
        </ul>
        <p>You can control cookies through your browser settings. Disabling essential cookies may affect Service functionality.</p>
      </div>
    ),
  },
  {
    id: 'retention',
    title: '6. Data Retention',
    content: (
      <div className="space-y-3">
        <p>We retain personal data for as long as necessary to provide the Service and comply with legal obligations:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li>Account data: retained for the duration of your account plus 90 days after deletion</li>
          <li>Lead and outreach data: retained per your organization&apos;s settings (default 2 years)</li>
          <li>Audit logs: retained for 7 years for compliance purposes</li>
          <li>Call recordings: retained for 90 days unless extended by your organization</li>
          <li>Billing records: retained for 7 years per tax and accounting requirements</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'security',
    title: '7. Security',
    content: (
      <div className="space-y-3">
        <p>We implement industry-standard security measures including:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li>TLS encryption for all data in transit</li>
          <li>AES-256 encryption for sensitive data at rest</li>
          <li>Row-level security (RLS) policies enforced at the database layer</li>
          <li>Role-based access controls (RBAC) with least-privilege principles</li>
          <li>Regular security audits and penetration testing</li>
          <li>Multi-factor authentication support</li>
        </ul>
        <p>No system is completely secure. If you discover a security vulnerability, please report it to <a href="mailto:security@travlr.com" className="text-blue-400 hover:text-blue-300 underline">security@travlr.com</a>.</p>
      </div>
    ),
  },
  {
    id: 'your-rights',
    title: '8. Your Rights',
    content: (
      <div className="space-y-3">
        <p>Depending on your location, you may have the following rights regarding your personal data:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li><strong className="text-gray-300">Access</strong> — request a copy of your personal data</li>
          <li><strong className="text-gray-300">Rectification</strong> — correct inaccurate or incomplete data</li>
          <li><strong className="text-gray-300">Erasure</strong> — request deletion of your data (&quot;right to be forgotten&quot;)</li>
          <li><strong className="text-gray-300">Portability</strong> — receive your data in a machine-readable format</li>
          <li><strong className="text-gray-300">Restriction</strong> — limit how we process your data</li>
          <li><strong className="text-gray-300">Objection</strong> — object to processing based on legitimate interests</li>
          <li><strong className="text-gray-300">Opt-out of sale</strong> — California residents may opt out of the sale of personal information (we do not sell data)</li>
        </ul>
        <p>To exercise these rights, contact <a href="mailto:privacy@travlr.com" className="text-blue-400 hover:text-blue-300 underline">privacy@travlr.com</a>. We will respond within 30 days.</p>
      </div>
    ),
  },
  {
    id: 'children',
    title: '9. Children\'s Privacy',
    content: (
      <p>
        The Service is not directed to individuals under 18 years of age. We do not knowingly collect personal data from children. If you believe we have inadvertently collected such data, contact us immediately at <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:text-blue-300 underline">{CONTACT_EMAIL}</a>.
      </p>
    ),
  },
  {
    id: 'international',
    title: '10. International Data Transfers',
    content: (
      <p>
        Your data may be processed in the United States and other countries where our service providers operate. For transfers from the European Economic Area (EEA), we rely on Standard Contractual Clauses (SCCs) and other appropriate safeguards as described in our <Link href="/gdpr-data-processing" className="text-blue-400 hover:text-blue-300 underline">GDPR Data Processing Agreement</Link>.
      </p>
    ),
  },
  {
    id: 'changes',
    title: '11. Changes to This Policy',
    content: (
      <p>
        We may update this Privacy Policy periodically. We will notify you of material changes by email or by posting a notice in the Service. The updated policy will be effective upon posting. Your continued use of the Service constitutes acceptance of the revised policy.
      </p>
    ),
  },
  {
    id: 'contact',
    title: '12. Contact Us',
    content: (
      <p>
        For privacy-related questions, data subject requests, or to reach our Data Protection Officer, contact us at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:text-blue-300 underline">{CONTACT_EMAIL}</a>{' '}
        or write to {COMPANY}, Attn: Privacy, 123 TRAVLR Way, Suite 100, Austin, TX 78701.
      </p>
    ),
  },
];

function AccordionSection({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#2a3142] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#1a2035] transition-colors"
      >
        <span className="text-sm font-semibold text-white">{section.title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-5 text-sm text-gray-400 leading-relaxed border-t border-[#2a3142]">
          <div className="pt-4">{section.content}</div>
        </div>
      )}
    </div>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to App
        </Link>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
            Legal
          </div>
          <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
          <p className="text-gray-500 text-sm">
            Effective date: <span className="text-gray-300">{EFFECTIVE_DATE}</span> &nbsp;·&nbsp; {COMPANY}
          </p>
          <p className="text-gray-400 text-sm leading-relaxed pt-2">
            Your privacy matters to us. This policy explains what data we collect, why we collect it, and how you can control it.
          </p>
        </div>

        <div className="space-y-3">
          {SECTIONS.map(section => (
            <AccordionSection key={section.id} section={section} />
          ))}
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-gray-600 pt-4 border-t border-[#2a3142]">
          <Link href="/terms-of-service" className="hover:text-gray-400 transition-colors">Terms of Service</Link>
          <Link href="/tcpa-compliance" className="hover:text-gray-400 transition-colors">TCPA Compliance</Link>
          <Link href="/gdpr-data-processing" className="hover:text-gray-400 transition-colors">GDPR Data Processing</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-gray-400 transition-colors">{CONTACT_EMAIL}</a>
        </div>
      </div>
    </div>
  );
}
