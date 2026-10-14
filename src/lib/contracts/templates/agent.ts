import type { ContractTemplateDef } from '../types';

export const AGENT_CONTRACTOR: ContractTemplateDef = {
  kind: 'agent_contractor',
  title: 'Independent Contractor Agreement (Acquisition Agent)',
  description: 'For agents who find and sign homeowners: commission terms, outreach and texting standards, confidentiality and independent-contractor status.',
  signerLabel: 'Agent',
  maxSigners: 1,
  fields: [
    { key: 'agentName', label: 'Agent name', group: 'Agent', required: true },
    { key: 'agentEmail', label: 'Agent email', group: 'Agent', required: true },
    { key: 'agentAddress', label: 'Agent mailing address', group: 'Agent', required: true },
    { key: 'markets', label: 'Markets or territory', group: 'Scope', type: 'textarea', default: 'As assigned by the Company from time to time' },
    { key: 'commissionBasis', label: 'Commission basis', group: 'Commission', type: 'select', options: ['Percentage of first-month net revenue', 'Flat amount per signed agreement'], default: 'Percentage of first-month net revenue', required: true },
    { key: 'commissionRate', label: 'Commission rate (%)', group: 'Commission', type: 'number', default: '10', help: 'Used when the basis is a percentage.' },
    { key: 'commissionFlat', label: 'Flat commission ($)', group: 'Commission', type: 'number', help: 'Used when the basis is a flat amount.' },
    { key: 'payoutTiming', label: 'Payout timing', group: 'Commission', default: 'monthly, for commissions earned in the prior calendar month', required: true },
    { key: 'noticeDays', label: 'Termination notice (days)', group: 'Term', type: 'number', default: '14' },
    { key: 'disputeResolutionMethod', label: 'Dispute resolution', group: 'Legal', type: 'select', options: ['Mediation', 'Arbitration', 'Litigation'], default: 'Mediation', required: true },
    { key: 'governingState', label: 'Governing law (state)', group: 'Legal', required: true },
  ],
  bodyHtml: `
<h1>Independent Contractor Agreement</h1>
<p class="sub">Acquisition Agent &mdash; {{company_name}}</p>

<p>This Independent Contractor Agreement (the &ldquo;Agreement&rdquo;) is made between <strong>{{company_name}}</strong>, a {{company_state}} {{company_entity}} with its address at {{company_address}} (the &ldquo;Company&rdquo;), and <strong>{{agentName}}</strong> of {{agentAddress}} ({{agentEmail}}) (&ldquo;Agent&rdquo;). It takes effect on the date the last party signs, as recorded in the DocuSign certificate of completion.</p>

<h2>1. Engagement</h2>
<p>The Company engages Agent, and Agent agrees, to identify, contact and help sign homeowners who may want the Company&rsquo;s vacation-rental management or co-hosting services, in the markets described here: {{markets}}. Agent works only on leads the Company assigns or approves through its platform.</p>

<h2>2. Independent Contractor</h2>
<p>Agent is an independent contractor, not an employee, partner or agent of the Company with authority to bind it. Agent controls the manner and means of the work, sets their own hours, supplies their own tools and equipment except for platform access the Company provides, and is responsible for their own taxes, licenses, insurance and expenses. Agent is not entitled to employee benefits, and the Company will report payments on IRS Form 1099 where the law requires. Agent must not make promises, quote guaranteed revenue, or negotiate terms beyond the Company&rsquo;s approved offer and agreement templates.</p>

<h2>3. Commission</h2>
<ol>
<li><strong>Basis.</strong> Agent earns a commission of <strong>{{commissionBasis}}</strong>. If the basis is a percentage, the rate is <strong>{{commissionRate}}%</strong> of the first month&rsquo;s estimated net revenue recorded for the property in the Company&rsquo;s platform at signing. If it is a flat amount, the amount is <strong>&#36;{{commissionFlat}}</strong> per signed agreement.</li>
<li><strong>When earned.</strong> A commission is earned when a homeowner (or co-host owner) signed up through a lead assigned to Agent has fully signed the Company&rsquo;s agreement through DocuSign, and the Company has countersigned it. A commission is not earned on a lead another agent was assigned, or on a lead the homeowner opted out of contact for.</li>
<li><strong>Payment.</strong> The Company pays earned commissions <strong>{{payoutTiming}}</strong>, after deducting any amount Agent owes the Company.</li>
<li><strong>Clawback.</strong> If a homeowner cancels within the first thirty (30) days for a reason traceable to Agent&rsquo;s misrepresentation, the Company may deduct the related commission from later payments.</li>
<li><strong>Records.</strong> Commission records are shown in the Company&rsquo;s platform. Agent may ask in writing for a correction within sixty (60) days of a payment.</li>
</ol>

<h2>4. Outreach Standards</h2>
<p>Agent will follow the Company&rsquo;s outreach rules and all laws that apply to calling, texting and emailing, including the Telephone Consumer Protection Act and state equivalents. Without limit:</p>
<ul>
<li>Send texts only between 9:00 a.m. and 8:00 p.m. in the recipient&rsquo;s local time, and never send the same person more than one first-touch text.</li>
<li>Honor every opt-out at once (for example STOP) and record it in the platform. Never contact a person who has opted out or who is on a do-not-call list.</li>
<li>Describe the Company&rsquo;s services accurately. Do not promise income, occupancy or rates; any estimate must be labeled as an estimate.</li>
<li>Use only the Company&rsquo;s approved templates and scripts for first contact unless the Company approves a change.</li>
</ul>

<h2>5. Confidentiality and Data</h2>
<p>Lead lists, owner contact information, pricing, scoring models, scripts and platform data are the Company&rsquo;s confidential information. Agent will use them only for work under this Agreement, will not copy, export or share them, and will return or delete them when the engagement ends. These duties continue for three (3) years after termination, and for as long as the information remains a trade secret. Agent will tell the Company promptly of any suspected data loss or misuse.</p>

<h2>6. Non-Solicitation</h2>
<p>For twelve (12) months after the engagement ends, Agent will not use the Company&rsquo;s confidential information to solicit any homeowner who is a Company client, or any Company vendor or employee, for a competing management or co-hosting service, to the extent the law permits this restriction where Agent works.</p>

<h2>7. Intellectual Property</h2>
<p>The Company owns its platform, data, templates and marketing materials. Any materials Agent creates for the Company in the course of this engagement belong to the Company, and Agent assigns to the Company all rights in them. Agent keeps their own pre-existing materials and tools.</p>

<h2>8. Term and Termination</h2>
<p>This Agreement continues until ended. Either party may end it by giving <strong>{{noticeDays}}</strong> days&rsquo; written notice, and the Company may end it immediately if Agent breaches Sections 4, 5 or 6 or acts unlawfully. Commissions earned before termination remain payable under Section 3.</p>

<h2>9. Liability</h2>
<p>Each party will indemnify the other against third-party claims and reasonable legal fees to the extent caused by its own negligence, willful misconduct, or breach of this Agreement or the law. To the fullest extent the law allows, neither party is liable for indirect or consequential damages.</p>

<h2>10. Disputes and General Terms</h2>
<p>The parties will first try to resolve any dispute through good-faith discussion for thirty (30) days; if that fails, it will be resolved by <strong>{{disputeResolutionMethod}}</strong>. This Agreement is governed by the laws of the State of <strong>{{governingState}}</strong>. Notices must be in writing to the addresses above (for the Company: {{company_notice_email}}). This is the entire agreement on its subject and may be changed only in a signed writing. If a provision is unenforceable, the rest remains in effect. Electronic signatures through DocuSign are binding and this Agreement may be signed in counterparts.</p>

<h2>Signatures</h2>
{{signature_blocks}}
`,
};
