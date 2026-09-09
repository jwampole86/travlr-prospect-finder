'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ArrowLeft, AlertTriangle, CheckCircle, Phone, MessageSquare, Shield } from 'lucide-react';

const EFFECTIVE_DATE = 'August 18, 2026';
const COMPANY = 'TRAVLR Inc.';
const CONTACT_EMAIL = 'compliance@travlr.com';

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: 'overview',
    title: '1. What is TCPA?',
    content: (
      <div className="space-y-3">
        <p>
          The Telephone Consumer Protection Act (TCPA), 47 U.S.C. § 227, is a federal law enacted in 1991 that restricts telemarketing communications and the use of automated telephone equipment. The TCPA is enforced by the Federal Communications Commission (FCC) and through private rights of action.
        </p>
        <p>
          Violations carry statutory damages of <strong className="text-gray-300">$500–$1,500 per violation</strong> (per message or call), making TCPA compliance critical for any business conducting outreach at scale.
        </p>
      </div>
    ),
  },
  {
    id: 'scope',
    title: '2. What the TCPA Covers',
    content: (
      <div className="space-y-3">
        <p>The TCPA applies to:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li>Autodialed calls and texts to mobile phones</li>
          <li>Prerecorded or artificial voice calls to any phone</li>
          <li>Unsolicited fax advertisements</li>
          <li>Calls to numbers on the National Do-Not-Call (DNC) Registry</li>
        </ul>
        <p className="mt-2">
          The TRAVLR platform&apos;s SMS and voice features use Twilio, which constitutes an Automatic Telephone Dialing System (ATDS) under many interpretations. Users must obtain proper consent before using these features.
        </p>
      </div>
    ),
  },
  {
    id: 'consent',
    title: '3. Consent Requirements',
    content: (
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <p className="text-amber-300 text-xs font-semibold uppercase tracking-wide mb-2">Prior Express Written Consent Required</p>
          <p className="text-gray-400 text-sm">
            For autodialed or prerecorded marketing texts and calls to mobile numbers, you must obtain <strong className="text-gray-300">prior express written consent</strong> that clearly authorizes the specific type of communication.
          </p>
        </div>
        <div>
          <p className="font-semibold text-gray-300 mb-2">Valid consent must:</p>
          <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
            <li>Be in writing (electronic signatures qualify)</li>
            <li>Clearly authorize autodialed/prerecorded calls or texts</li>
            <li>Identify the specific company that will contact the consumer</li>
            <li>Not be a condition of purchase</li>
            <li>Include a clear disclosure of what the consumer is consenting to</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-gray-300 mb-2">Consent records must include:</p>
          <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
            <li>Date and time of consent</li>
            <li>Method of consent (web form, signed document, verbal recording)</li>
            <li>Exact language shown to the consumer</li>
            <li>IP address or other identifying information</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    id: 'opt-out',
    title: '4. Opt-Out and STOP Handling',
    content: (
      <div className="space-y-3">
        <p>
          You must honor opt-out requests immediately and permanently. The TRAVLR platform automatically handles the following opt-out keywords per CTIA guidelines:
        </p>
        <div className="flex flex-wrap gap-2 my-3">
          {['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].map(kw => (
            <span key={kw} className="px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-mono font-semibold">{kw}</span>
          ))}
        </div>
        <p>When a recipient sends any of these keywords:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li>The lead is immediately flagged as opted-out in the system</li>
          <li>All future SMS sends to that number are blocked</li>
          <li>An opt-out confirmation message is sent automatically</li>
          <li>The opt-out event is logged in the audit trail with timestamp</li>
        </ul>
        <p className="mt-2">
          <strong className="text-gray-300">You must not</strong> attempt to re-enroll opted-out contacts without new, explicit consent. Doing so violates the TCPA and platform policy.
        </p>
      </div>
    ),
  },
  {
    id: 'calling-hours',
    title: '5. Calling Hours and Quiet Hours',
    content: (
      <div className="space-y-3">
        <p>The TCPA restricts telemarketing calls to:</p>
        <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20 text-center">
          <p className="text-blue-300 font-semibold text-lg">8:00 AM – 9:00 PM</p>
          <p className="text-gray-500 text-xs mt-1">Local time of the called party</p>
        </div>
        <p>The TRAVLR platform enforces quiet hours based on the lead&apos;s local time zone. Outreach scheduled outside these hours will be queued and sent at the next permitted time.</p>
        <p>Some states have stricter requirements (e.g., Florida: 8 AM – 8 PM). Always check state-specific rules for your target market.</p>
      </div>
    ),
  },
  {
    id: 'dnc',
    title: '6. Do-Not-Call (DNC) Compliance',
    content: (
      <div className="space-y-3">
        <p>You are responsible for:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li>Scrubbing contact lists against the National DNC Registry before outreach</li>
          <li>Maintaining an internal DNC list and honoring opt-outs within 30 days</li>
          <li>Registering with the FTC if you make more than a de minimis number of telemarketing calls</li>
          <li>Complying with state DNC registries (many states have their own)</li>
        </ul>
        <p>The TRAVLR platform provides DNC flagging and opt-out management tools, but does not automatically scrub against the National DNC Registry. You must perform this scrubbing independently or through a compliant third-party service.</p>
      </div>
    ),
  },
  {
    id: 'platform-tools',
    title: '7. TRAVLR Compliance Tools',
    content: (
      <div className="space-y-3">
        <p>The TRAVLR platform provides the following compliance features:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          {[
            { icon: MessageSquare, label: 'STOP keyword auto-handling', desc: 'Automatic opt-out processing for all standard keywords' },
            { icon: Shield, label: 'Compliance Audit Log', desc: 'Full audit trail of all outreach with timestamps and consent status' },
            { icon: Phone, label: 'Quiet hours enforcement', desc: 'Automatic time-zone-aware scheduling within permitted hours' },
            { icon: CheckCircle, label: 'Pre-send compliance checklist', desc: 'Mandatory review before bulk SMS campaigns' },
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
        <p className="text-xs text-gray-500 mt-2">
          These tools assist with compliance but do not constitute legal advice. Consult qualified legal counsel for your specific situation.
        </p>
      </div>
    ),
  },
  {
    id: 'user-responsibility',
    title: '8. Your Responsibility',
    content: (
      <div className="space-y-3">
        <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-red-300 text-sm">
              <strong>TRAVLR is a technology platform, not a legal compliance service.</strong> You are solely responsible for ensuring your use of the platform complies with TCPA and all applicable laws.
            </p>
          </div>
        </div>
        <p>By using TRAVLR&apos;s outreach features, you represent and warrant that:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
          <li>You have obtained all required consents before sending messages</li>
          <li>You maintain records of consent that can be produced in litigation</li>
          <li>You have implemented procedures to honor opt-out requests</li>
          <li>You have scrubbed contact lists against applicable DNC registries</li>
          <li>You are not using the platform to contact consumers who have previously opted out</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'contact',
    title: '9. Compliance Questions',
    content: (
      <p>
        For compliance-related questions, contact our compliance team at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:text-blue-300 underline">{CONTACT_EMAIL}</a>.
        For legal advice, consult a qualified attorney specializing in telecommunications law.
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

export default function TCPACompliancePage() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to App
        </Link>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
            Compliance
          </div>
          <h1 className="text-3xl font-bold text-white">TCPA Compliance</h1>
          <p className="text-gray-500 text-sm">
            Effective date: <span className="text-gray-300">{EFFECTIVE_DATE}</span> &nbsp;·&nbsp; {COMPANY}
          </p>
          <p className="text-gray-400 text-sm leading-relaxed pt-2">
            The Telephone Consumer Protection Act (TCPA) governs how you may use TRAVLR&apos;s SMS and voice outreach features. This page explains your obligations and how the platform helps you stay compliant.
          </p>
        </div>

        {/* Quick reference */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Calling Hours', value: '8 AM – 9 PM', sub: 'Local time of recipient', color: 'text-blue-400' },
            { label: 'Opt-Out Window', value: '≤ 10 days', sub: 'To honor DNC requests', color: 'text-emerald-400' },
            { label: 'Violation Fine', value: '$500–$1,500', sub: 'Per message/call', color: 'text-red-400' },
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
          <Link href="/gdpr-data-processing" className="hover:text-gray-400 transition-colors">GDPR Data Processing</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-gray-400 transition-colors">{CONTACT_EMAIL}</a>
        </div>
      </div>
    </div>
  );
}
