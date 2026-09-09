'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ArrowLeft, Globe, Lock, FileText, Users } from 'lucide-react';

const EFFECTIVE_DATE = 'August 18, 2026';
const COMPANY = 'TRAVLR Inc.';
const CONTACT_EMAIL = 'dpo@travlr.com';

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: 'scope',
    title: '1. Scope and Purpose',
    content: (
      <div className="space-y-3">
        <p>
          This Data Processing Agreement (&quot;DPA&quot;) forms part of the agreement between {COMPANY} (&quot;Processor&quot;) and the customer (&quot;Controller&quot;) and governs the processing of personal data of data subjects in the European Economic Area (EEA), United Kingdom, and Switzerland in connection with the TRAVLR Prospect Finder Service.
        </p>
        <p>
          This DPA is intended to comply with the requirements of the EU General Data Protection Regulation (GDPR) (Regulation (EU) 2016/679), the UK GDPR, and the Swiss Federal Act on Data Protection (FADP).
        </p>
      </div>
    ),
  },
  {
    id: 'definitions',
    title: '2. Definitions',
    content: (
      <div className="space-y-2">
        {[
          { term: 'Personal Data', def: 'Any information relating to an identified or identifiable natural person (data subject).' },
          { term: 'Processing', def: 'Any operation performed on personal data, including collection, storage, use, disclosure, or deletion.' },
          { term: 'Controller', def: 'The customer who determines the purposes and means of processing personal data.' },
          { term: 'Processor', def: 'TRAVLR Inc., which processes personal data on behalf of the Controller.' },
          { term: 'Sub-processor', def: 'A third party engaged by TRAVLR to assist in processing personal data.' },
          { term: 'Data Subject', def: 'The natural person whose personal data is being processed.' },
          { term: 'SCCs', def: 'Standard Contractual Clauses approved by the European Commission for international data transfers.' },
        ].map(item => (
          <div key={item.term} className="flex gap-3">
            <span className="text-gray-300 font-semibold text-xs min-w-[120px] pt-0.5">{item.term}</span>
            <span className="text-gray-400 text-xs">{item.def}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'processing-details',
    title: '3. Details of Processing',
    content: (
      <div className="space-y-4">
        <div>
          <p className="font-semibold text-gray-300 mb-2 text-xs uppercase tracking-wide">Subject Matter</p>
          <p className="text-gray-400 text-sm">Processing of personal data of property leads, homeowners, and platform users in connection with the TRAVLR Prospect Finder Service.</p>
        </div>
        <div>
          <p className="font-semibold text-gray-300 mb-2 text-xs uppercase tracking-wide">Duration</p>
          <p className="text-gray-400 text-sm">For the duration of the Service agreement, plus any retention period required by law.</p>
        </div>
        <div>
          <p className="font-semibold text-gray-300 mb-2 text-xs uppercase tracking-wide">Nature and Purpose</p>
          <p className="text-gray-400 text-sm">Lead management, outreach automation, e-signature workflows, analytics, and CRM functionality as described in the Terms of Service.</p>
        </div>
        <div>
          <p className="font-semibold text-gray-300 mb-2 text-xs uppercase tracking-wide">Categories of Data Subjects</p>
          <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2 text-sm">
            <li>Property leads and prospects</li>
            <li>Homeowners and property owners</li>
            <li>Platform users (agents, team leads, administrators)</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-gray-300 mb-2 text-xs uppercase tracking-wide">Categories of Personal Data</p>
          <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2 text-sm">
            <li>Contact information (name, email, phone, address)</li>
            <li>Property and financial data</li>
            <li>Communication history (SMS, email, call logs)</li>
            <li>Behavioral data (platform usage, engagement metrics)</li>
            <li>Document signatures and agreement data</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    id: 'controller-obligations',
    title: '4. Controller Obligations',
    content: (
      <div className="space-y-3">
        <p>As Controller, you agree to:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li>Ensure you have a lawful basis for processing personal data (consent, legitimate interest, contract, etc.)</li>
          <li>Provide data subjects with required privacy notices before collecting their data</li>
          <li>Respond to data subject requests (access, erasure, portability) within required timeframes</li>
          <li>Ensure personal data is accurate and kept up to date</li>
          <li>Not instruct TRAVLR to process data in a manner that violates GDPR</li>
          <li>Notify TRAVLR promptly of any data subject requests or regulatory inquiries</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'processor-obligations',
    title: '5. Processor Obligations',
    content: (
      <div className="space-y-3">
        <p>As Processor, TRAVLR agrees to:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li>Process personal data only on documented instructions from the Controller</li>
          <li>Ensure that authorized personnel are bound by confidentiality obligations</li>
          <li>Implement appropriate technical and organizational security measures (Article 32 GDPR)</li>
          <li>Assist the Controller in responding to data subject requests</li>
          <li>Notify the Controller of any personal data breach within 72 hours of becoming aware</li>
          <li>Delete or return all personal data upon termination of the Service</li>
          <li>Make available all information necessary to demonstrate compliance with this DPA</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'sub-processors',
    title: '6. Sub-processors',
    content: (
      <div className="space-y-3">
        <p>TRAVLR uses the following sub-processors to deliver the Service. By using the Service, you authorize engagement of these sub-processors:</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#2a3142]">
                <th className="text-left py-2 pr-4 text-gray-500 font-medium">Sub-processor</th>
                <th className="text-left py-2 pr-4 text-gray-500 font-medium">Purpose</th>
                <th className="text-left py-2 text-gray-500 font-medium">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3142]">
              {[
                { name: 'Supabase', purpose: 'Database and authentication', location: 'USA (AWS)' },
                { name: 'Twilio', purpose: 'SMS and voice communications', location: 'USA' },
                { name: 'Resend', purpose: 'Transactional email delivery', location: 'USA' },
                { name: 'DocuSign', purpose: 'E-signature workflows', location: 'USA' },
                { name: 'OpenAI', purpose: 'AI-powered features', location: 'USA' },
                { name: 'Anthropic', purpose: 'AI-powered features', location: 'USA' },
                { name: 'Mixpanel', purpose: 'Product analytics', location: 'USA' },
                { name: 'Stripe', purpose: 'Payment processing', location: 'USA' },
              ].map(sp => (
                <tr key={sp.name}>
                  <td className="py-2 pr-4 text-gray-300 font-medium">{sp.name}</td>
                  <td className="py-2 pr-4 text-gray-400">{sp.purpose}</td>
                  <td className="py-2 text-gray-500">{sp.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">
          TRAVLR will notify Controllers of any intended changes to sub-processors with at least 30 days&apos; notice, providing an opportunity to object.
        </p>
      </div>
    ),
  },
  {
    id: 'international-transfers',
    title: '7. International Data Transfers',
    content: (
      <div className="space-y-3">
        <p>
          Personal data processed under this DPA may be transferred to and processed in the United States and other countries outside the EEA. TRAVLR relies on the following transfer mechanisms:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li><strong className="text-gray-300">Standard Contractual Clauses (SCCs)</strong> — EU Commission Decision 2021/914 for Controller-to-Processor transfers</li>
          <li><strong className="text-gray-300">UK International Data Transfer Agreement (IDTA)</strong> — for transfers from the UK</li>
          <li><strong className="text-gray-300">Adequacy decisions</strong> — where applicable for specific destination countries</li>
        </ul>
        <p>Copies of applicable SCCs are available upon request at <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:text-blue-300 underline">{CONTACT_EMAIL}</a>.</p>
      </div>
    ),
  },
  {
    id: 'security',
    title: '8. Technical and Organizational Security Measures',
    content: (
      <div className="space-y-3">
        <p>TRAVLR implements the following security measures (Article 32 GDPR):</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          {[
            { icon: Lock, label: 'Encryption', desc: 'TLS 1.3 in transit; AES-256 at rest' },
            { icon: Users, label: 'Access Control', desc: 'RBAC with least-privilege; MFA support' },
            { icon: FileText, label: 'Audit Logging', desc: 'All data access and changes logged' },
            { icon: Globe, label: 'Incident Response', desc: '72-hour breach notification SLA' },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-3 p-3 rounded-lg bg-[#1a2035] border border-[#2a3142]">
              <item.icon className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-300">{item.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'data-subject-rights',
    title: '9. Data Subject Rights Assistance',
    content: (
      <div className="space-y-3">
        <p>TRAVLR will assist the Controller in fulfilling data subject rights requests under GDPR Articles 15–22:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li><strong className="text-gray-300">Art. 15</strong> — Right of access: export lead and user data on request</li>
          <li><strong className="text-gray-300">Art. 16</strong> — Right to rectification: update inaccurate data</li>
          <li><strong className="text-gray-300">Art. 17</strong> — Right to erasure: delete data within 30 days of verified request</li>
          <li><strong className="text-gray-300">Art. 18</strong> — Right to restriction: pause processing on request</li>
          <li><strong className="text-gray-300">Art. 20</strong> — Right to portability: export data in JSON/CSV format</li>
          <li><strong className="text-gray-300">Art. 21</strong> — Right to object: opt out of processing based on legitimate interests</li>
        </ul>
        <p>Submit data subject requests to <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:text-blue-300 underline">{CONTACT_EMAIL}</a>. We respond within 30 days.</p>
      </div>
    ),
  },
  {
    id: 'breach',
    title: '10. Personal Data Breach Notification',
    content: (
      <div className="space-y-3">
        <p>In the event of a personal data breach, TRAVLR will:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li>Notify the Controller without undue delay and within 72 hours of becoming aware</li>
          <li>Provide information about the nature of the breach, categories and approximate number of data subjects affected, and likely consequences</li>
          <li>Describe measures taken or proposed to address the breach</li>
          <li>Cooperate with the Controller in any required notifications to supervisory authorities or data subjects</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'dpo',
    title: '11. Data Protection Officer',
    content: (
      <p>
        {COMPANY} has designated a Data Protection Officer (DPO) who can be contacted at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:text-blue-300 underline">{CONTACT_EMAIL}</a>.
        The DPO is responsible for overseeing data protection strategy and implementation to ensure compliance with GDPR requirements.
      </p>
    ),
  },
  {
    id: 'termination',
    title: '12. Termination and Data Deletion',
    content: (
      <p>
        Upon termination of the Service agreement, TRAVLR will, at the Controller&apos;s choice, delete or return all personal data and delete existing copies within 90 days, unless applicable law requires retention. A written certification of deletion is available upon request.
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

export default function GDPRDataProcessingPage() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to App
        </Link>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
            GDPR
          </div>
          <h1 className="text-3xl font-bold text-white">GDPR Data Processing Agreement</h1>
          <p className="text-gray-500 text-sm">
            Effective date: <span className="text-gray-300">{EFFECTIVE_DATE}</span> &nbsp;·&nbsp; {COMPANY}
          </p>
          <p className="text-gray-400 text-sm leading-relaxed pt-2">
            This Data Processing Agreement (DPA) governs how TRAVLR processes personal data on your behalf in compliance with the EU General Data Protection Regulation (GDPR) and related data protection laws.
          </p>
        </div>

        {/* GDPR quick stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Breach Notification', value: '72 hours', sub: 'From awareness to Controller', color: 'text-red-400' },
            { label: 'DSR Response', value: '30 days', sub: 'For data subject requests', color: 'text-blue-400' },
            { label: 'Data Deletion', value: '90 days', sub: 'After contract termination', color: 'text-emerald-400' },
          ].map(stat => (
            <div key={stat.label} className="p-4 rounded-xl bg-[#161b27] border border-[#2a3142] text-center">
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs font-semibold text-gray-300 mt-1">{stat.label}</p>
              <p className="text-xs text-gray-600 mt-0.5">{stat.sub}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {SECTIONS.map(section => (
            <AccordionSection key={section.id} section={section} />
          ))}
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-gray-600 pt-4 border-t border-[#2a3142]">
          <Link href="/terms-of-service" className="hover:text-gray-400 transition-colors">Terms of Service</Link>
          <Link href="/privacy-policy" className="hover:text-gray-400 transition-colors">Privacy Policy</Link>
          <Link href="/tcpa-compliance" className="hover:text-gray-400 transition-colors">TCPA Compliance</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-gray-400 transition-colors">{CONTACT_EMAIL}</a>
        </div>
      </div>
    </div>
  );
}
