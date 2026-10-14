import type { ContractTemplateDef } from '../types';

export const VENDOR_SERVICE: ContractTemplateDef = {
  kind: 'vendor_service',
  title: 'Vendor Services Agreement (Cleaning and Turnover)',
  description: 'For cleaners and turnover vendors: scope, standards, pay, insurance, damage reporting and independent-contractor status.',
  signerLabel: 'Vendor',
  maxSigners: 1,
  fields: [
    { key: 'vendorName', label: 'Vendor name (person or business)', group: 'Vendor', required: true },
    { key: 'vendorContact', label: 'Contact person', group: 'Vendor' },
    { key: 'vendorEmail', label: 'Vendor email', group: 'Vendor', required: true },
    { key: 'vendorPhone', label: 'Vendor phone', group: 'Vendor' },
    { key: 'vendorAddress', label: 'Vendor address', group: 'Vendor', required: true },
    { key: 'serviceArea', label: 'Service area', group: 'Scope', required: true },
    { key: 'rates', label: 'Rates', group: 'Pay', type: 'textarea', required: true, help: 'For example: $120 per turnover for a 3-bedroom, $35 per extra bedroom.' },
    { key: 'paymentTerms', label: 'Payment terms', group: 'Pay', default: 'within 15 days of an approved invoice or completed job record', required: true },
    { key: 'insuranceMinimum', label: 'Liability insurance minimum', group: 'Insurance', default: '$1,000,000 per occurrence' },
    { key: 'noticeDays', label: 'Termination notice (days)', group: 'Term', type: 'number', default: '14' },
    { key: 'governingState', label: 'Governing law (state)', group: 'Legal', required: true },
  ],
  bodyHtml: `
<h1>Vendor Services Agreement</h1>
<p class="sub">Cleaning and Turnover &mdash; {{company_name}}</p>

<p>This Vendor Services Agreement (the &ldquo;Agreement&rdquo;) is made between <strong>{{company_name}}</strong>, a {{company_state}} {{company_entity}} with its address at {{company_address}} (the &ldquo;Company&rdquo;), and <strong>{{vendorName}}</strong> of {{vendorAddress}} ({{vendorEmail}}, {{vendorPhone}}) (&ldquo;Vendor&rdquo;). It takes effect on the date the last party signs, as recorded in the DocuSign certificate of completion.</p>

<h2>1. Services</h2>
<p>Vendor will clean and turn over vacation-rental properties the Company manages or co-hosts in {{serviceArea}}, as assigned through the Company&rsquo;s platform (the &ldquo;Services&rdquo;). A turnover includes cleaning every room to the Company&rsquo;s checklist, changing linens, restocking supplies the Company provides, removing trash, checking the property for damage or missing items, and reporting issues with photos. The Company is not required to assign any minimum number of jobs, and Vendor may decline a job before accepting it.</p>

<h2>2. Standards and Timing</h2>
<ol>
<li>Complete each accepted job within the window shown on the job and mark it complete in the platform with the required photos.</li>
<li>Report any damage, safety hazard, lost item, or evidence of a policy violation by guests to the Company on the same day, before leaving the property if possible.</li>
<li>Treat property keys, codes and alarm information as confidential, never share or copy them, and return or delete them when a job ends or this Agreement ends.</li>
<li>Re-clean at Vendor&rsquo;s cost if a job fails the Company&rsquo;s checklist and is reported within twenty-four (24) hours.</li>
</ol>

<h2>3. Pay</h2>
<p>The Company pays Vendor at these rates: {{rates}}. Vendor invoices or the platform job record shows the amounts due, and the Company pays <strong>{{paymentTerms}}</strong>. Rates may change only by written agreement before a job is accepted. Vendor is responsible for all of its own expenses, tools and supplies unless the Company agrees to provide them.</p>

<h2>4. Independent Contractor</h2>
<p>Vendor is an independent contractor and not an employee of the Company. Vendor controls how and when the work is done within the job window, may work for others, supplies its own labor and is solely responsible for its personnel, wages, taxes, workers&rsquo; compensation and licenses. The Company will report payments on IRS Form 1099 where the law requires. If Vendor is a business, it will ensure each person it sends to a property is lawfully authorized to work and has passed any background check the Company reasonably requires.</p>

<h2>5. Insurance</h2>
<p>Vendor will keep commercial general liability insurance of at least <strong>{{insuranceMinimum}}</strong> for the term of this Agreement, plus workers&rsquo; compensation insurance where the law requires, and will give the Company a certificate of insurance on request.</p>

<h2>6. Damage, Loss and Indemnity</h2>
<p>Vendor is responsible for damage to a property or its contents caused by Vendor or its personnel, and will indemnify the Company, the property owner and guests against third-party claims and reasonable legal fees to the extent caused by Vendor&rsquo;s negligence, willful misconduct or breach. The Company will indemnify Vendor to the extent a claim is caused by the Company&rsquo;s negligence or willful misconduct. To the fullest extent the law allows, neither party is liable for indirect or consequential damages.</p>

<h2>7. Non-Solicitation and Confidentiality</h2>
<p>Vendor will not solicit the Company&rsquo;s property owners or guests for Vendor&rsquo;s own services at those properties, outside this Agreement, during its term and for twelve (12) months afterward, to the extent the law permits. Vendor will keep owner, guest and property information confidential and use it only to perform the Services.</p>

<h2>8. Term and Termination</h2>
<p>This Agreement continues until ended. Either party may end it by giving <strong>{{noticeDays}}</strong> days&rsquo; written notice. The Company may end it immediately for theft, serious safety violations, falsified job records, or breach of Section 2 or 7. The Company pays for all approved jobs completed before termination.</p>

<h2>9. General</h2>
<p>This Agreement is governed by the laws of the State of <strong>{{governingState}}</strong>. Notices must be in writing to the addresses above (for the Company: {{company_notice_email}}). It is the entire agreement on its subject and may be changed only in a signed writing. If a provision is unenforceable, the rest remains in effect. Electronic signatures through DocuSign are binding and this Agreement may be signed in counterparts.</p>

<h2>Signatures</h2>
{{signature_blocks}}
`,
};
