'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';

const EFFECTIVE_DATE = 'August 18, 2026';
const COMPANY = 'TRAVLR Inc.';
const CONTACT_EMAIL = 'legal@travlr.com';
const SITE_URL = 'https://travlrpro3047.builtwithrocket.new';

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: 'acceptance',
    title: '1. Acceptance of Terms',
    content: (
      <p>
        By accessing or using the TRAVLR Prospect Finder platform (&quot;Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you are using the Service on behalf of an organization, you represent that you have authority to bind that organization to these Terms. If you do not agree, do not use the Service.
      </p>
    ),
  },
  {
    id: 'description',
    title: '2. Description of Service',
    content: (
      <div className="space-y-3">
        <p>TRAVLR Prospect Finder is a property management lead generation, outreach automation, and CRM platform designed for property managers, leasing agents, and real estate operators. The Service includes:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li>Lead sourcing, enrichment, and scoring</li>
          <li>SMS, email, and voice outreach via integrated third-party providers (Twilio, Resend)</li>
          <li>E-signature workflows via DocuSign</li>
          <li>Analytics, reporting, and compliance tooling</li>
          <li>Agent and team management features</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'accounts',
    title: '3. Accounts and Access',
    content: (
      <div className="space-y-3">
        <p>You must create an account to use the Service. You are responsible for maintaining the confidentiality of your credentials and for all activity under your account. You agree to:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li>Provide accurate and complete registration information</li>
          <li>Notify us immediately of any unauthorized use of your account</li>
          <li>Not share login credentials with unauthorized parties</li>
          <li>Not create accounts for automated access without prior written consent</li>
        </ul>
        <p>We reserve the right to suspend or terminate accounts that violate these Terms.</p>
      </div>
    ),
  },
  {
    id: 'acceptable-use',
    title: '4. Acceptable Use',
    content: (
      <div className="space-y-3">
        <p>You agree not to use the Service to:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li>Send unsolicited communications in violation of applicable law (including CAN-SPAM, TCPA, or GDPR)</li>
          <li>Harvest, scrape, or collect personal data without consent</li>
          <li>Transmit malware, spam, or fraudulent content</li>
          <li>Impersonate any person or entity</li>
          <li>Reverse-engineer, decompile, or attempt to extract source code</li>
          <li>Circumvent any access controls or security measures</li>
          <li>Use the Service for any unlawful purpose</li>
        </ul>
        <p>Violations may result in immediate account termination and legal action.</p>
      </div>
    ),
  },
  {
    id: 'outreach-compliance',
    title: '5. Outreach and Communications Compliance',
    content: (
      <div className="space-y-3">
        <p>You are solely responsible for ensuring that all outreach conducted through the Service complies with applicable federal, state, and local laws, including but not limited to:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li><strong className="text-gray-300">TCPA</strong> — Telephone Consumer Protection Act (prior express written consent for autodialed/prerecorded calls and texts)</li>
          <li><strong className="text-gray-300">CAN-SPAM Act</strong> — commercial email requirements including opt-out mechanisms</li>
          <li><strong className="text-gray-300">GDPR / CCPA</strong> — data subject rights, lawful basis for processing, and privacy notices</li>
          <li><strong className="text-gray-300">State Do-Not-Call registries</strong> — honoring opt-outs and DNC lists</li>
        </ul>
        <p>TRAVLR provides compliance tooling as a convenience. We do not guarantee that use of these tools constitutes legal compliance. You should consult qualified legal counsel for compliance advice.</p>
      </div>
    ),
  },
  {
    id: 'data',
    title: '6. Data and Privacy',
    content: (
      <p>
        Your use of the Service is also governed by our <Link href="/privacy-policy" className="text-blue-400 hover:text-blue-300 underline">Privacy Policy</Link> and, where applicable, our <Link href="/gdpr-data-processing" className="text-blue-400 hover:text-blue-300 underline">GDPR Data Processing Agreement</Link>. By using the Service, you consent to the collection and use of information as described in those documents.
      </p>
    ),
  },
  {
    id: 'ip',
    title: '7. Intellectual Property',
    content: (
      <div className="space-y-3">
        <p>All content, features, and functionality of the Service — including software, text, graphics, logos, and data — are owned by {COMPANY} or its licensors and are protected by copyright, trademark, and other intellectual property laws.</p>
        <p>You retain ownership of data you upload or input into the Service (&quot;Customer Data&quot;). You grant {COMPANY} a limited license to process Customer Data solely to provide the Service.</p>
      </div>
    ),
  },
  {
    id: 'third-party',
    title: '8. Third-Party Services',
    content: (
      <div className="space-y-3">
        <p>The Service integrates with third-party providers including Twilio (SMS/voice), Resend (email), DocuSign (e-signatures), Supabase (database), and others. Your use of these integrations is subject to those providers&apos; terms of service.</p>
        <p>We are not responsible for the availability, accuracy, or conduct of third-party services. Outages or changes to third-party APIs may affect Service functionality.</p>
      </div>
    ),
  },
  {
    id: 'disclaimers',
    title: '9. Disclaimers and Limitation of Liability',
    content: (
      <div className="space-y-3">
        <p className="uppercase text-xs tracking-wide text-gray-500 font-semibold">Disclaimer of warranties</p>
        <p>THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.</p>
        <p className="uppercase text-xs tracking-wide text-gray-500 font-semibold mt-4">Limitation of liability</p>
        <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, {COMPANY.toUpperCase()} SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM YOUR USE OF THE SERVICE.</p>
      </div>
    ),
  },
  {
    id: 'termination',
    title: '10. Termination',
    content: (
      <p>
        Either party may terminate these Terms at any time. Upon termination, your right to use the Service ceases immediately. We may retain Customer Data for up to 90 days after termination for backup and legal compliance purposes, after which it will be deleted in accordance with our data retention policy.
      </p>
    ),
  },
  {
    id: 'governing-law',
    title: '11. Governing Law and Disputes',
    content: (
      <p>
        These Terms are governed by the laws of the State of Delaware, without regard to conflict of law principles. Any dispute arising from these Terms shall be resolved by binding arbitration in Austin, Texas, except that either party may seek injunctive relief in any court of competent jurisdiction.
      </p>
    ),
  },
  {
    id: 'changes',
    title: '12. Changes to Terms',
    content: (
      <p>
        We may update these Terms from time to time. We will notify you of material changes by posting the updated Terms on this page and updating the effective date. Continued use of the Service after changes constitutes acceptance of the revised Terms.
      </p>
    ),
  },
  {
    id: 'contact',
    title: '13. Contact',
    content: (
      <p>
        Questions about these Terms? Contact us at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:text-blue-300 underline">{CONTACT_EMAIL}</a>{' '}
        or write to {COMPANY}, 123 TRAVLR Way, Suite 100, Austin, TX 78701.
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
        <div className="px-5 pb-5 text-sm text-gray-400 leading-relaxed space-y-3 border-t border-[#2a3142]">
          <div className="pt-4">{section.content}</div>
        </div>
      )}
    </div>
  );
}

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        {/* Back */}
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to App
        </Link>

        {/* Header */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
            Legal
          </div>
          <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
          <p className="text-gray-500 text-sm">
            Effective date: <span className="text-gray-300">{EFFECTIVE_DATE}</span> &nbsp;·&nbsp; {COMPANY}
          </p>
          <p className="text-gray-400 text-sm leading-relaxed pt-2">
            Please read these Terms of Service carefully before using the TRAVLR Prospect Finder platform. These Terms constitute a legally binding agreement between you and {COMPANY}.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-3">
          {SECTIONS.map(section => (
            <AccordionSection key={section.id} section={section} />
          ))}
        </div>

        {/* Footer links */}
        <div className="flex flex-wrap gap-4 text-xs text-gray-600 pt-4 border-t border-[#2a3142]">
          <Link href="/privacy-policy" className="hover:text-gray-400 transition-colors">Privacy Policy</Link>
          <Link href="/tcpa-compliance" className="hover:text-gray-400 transition-colors">TCPA Compliance</Link>
          <Link href="/gdpr-data-processing" className="hover:text-gray-400 transition-colors">GDPR Data Processing</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-gray-400 transition-colors">{CONTACT_EMAIL}</a>
        </div>
      </div>
    </div>
  );
}
