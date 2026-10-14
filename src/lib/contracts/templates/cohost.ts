import type { ContractTemplateDef } from '../types';

// Fee defaults mirror the sliding co-host fee shown to owners (src/lib/cohostFees.ts).
export const COHOST_PARTNER: ContractTemplateDef = {
  kind: 'cohost_partner',
  title: 'Co-Host Services Agreement',
  description: 'For owners who already host on Airbnb or Vrbo and add us as co-host: we run pricing, guest care and turnovers on their existing listing for a sliding fee.',
  signerLabel: 'Owner',
  maxSigners: 4,
  fields: [
    { key: 'ownerName', label: 'Owner name(s)', group: 'Owner', required: true },
    { key: 'ownerEmail', label: 'Owner email', group: 'Owner' },
    { key: 'ownerPhone', label: 'Owner phone', group: 'Owner' },
    { key: 'ownerMailingAddress', label: 'Owner mailing address', group: 'Owner', required: true },
    { key: 'propertyAddress', label: 'Property address', group: 'Listing', required: true },
    { key: 'listingUrls', label: 'Listing link(s)', group: 'Listing', type: 'textarea', required: true, help: 'Airbnb and/or Vrbo URLs the Owner hosts.' },
    { key: 'termMonths', label: 'Initial term (months)', group: 'Term', type: 'number', default: '12', required: true },
    { key: 'terminationNoticeDays', label: 'Termination notice (days)', group: 'Term', type: 'number', default: '30' },
    { key: 'tier1Limit', label: 'Tier 1 revenue limit ($ per year)', group: 'Fee', type: 'number', default: '100,000' },
    { key: 'tier1Rate', label: 'Tier 1 fee (%)', group: 'Fee', type: 'number', default: '20', required: true },
    { key: 'tier2Limit', label: 'Tier 2 revenue limit ($ per year)', group: 'Fee', type: 'number', default: '200,000' },
    { key: 'tier2Rate', label: 'Tier 2 fee (%)', group: 'Fee', type: 'number', default: '16', required: true },
    { key: 'tier3Rate', label: 'Tier 3 fee (%) above Tier 2', group: 'Fee', type: 'number', default: '12', required: true },
    { key: 'feeSettlement', label: 'How the fee is paid', group: 'Fee', type: 'select', options: ['Monthly invoice', 'Platform payout split'], default: 'Monthly invoice', required: true },
    { key: 'maintenanceApprovalThreshold', label: 'Expense pre-approval threshold ($)', group: 'Fee', type: 'number', default: '500' },
    { key: 'disputeResolutionMethod', label: 'Dispute resolution', group: 'Legal', type: 'select', options: ['Mediation', 'Arbitration', 'Litigation'], default: 'Mediation', required: true },
    { key: 'governingState', label: 'Governing law (state)', group: 'Legal', required: true },
  ],
  bodyHtml: `
<h1>Co-Host Services Agreement</h1>
<p class="sub">{{company_name}} and the Owner named below</p>

<p>This Co-Host Services Agreement (the &ldquo;Agreement&rdquo;) is made between <strong>{{company_name}}</strong>, a {{company_state}} {{company_entity}} with its address at {{company_address}} (&ldquo;Co-Host&rdquo;), and the person(s) identified below (&ldquo;Owner&rdquo;). It takes effect on the date the last party signs, as recorded in the DocuSign certificate of completion.</p>

<h2>1. Owner and Listing</h2>
<table>
<tr><th>Owner</th><td>{{ownerName}}<br>{{ownerMailingAddress}}<br>{{ownerEmail}} &middot; {{ownerPhone}}</td></tr>
<tr><th>Property</th><td>{{propertyAddress}}</td></tr>
<tr><th>Existing listing(s)</th><td>{{listingUrls}} (the &ldquo;Listing&rdquo;)</td></tr>
</table>
<p>Owner confirms that Owner owns, or has the legal right to rent, the Property and is the host of record on the Listing. If more than one person signs as Owner, their obligations are joint and several.</p>

<h2>2. How Co-Hosting Works</h2>
<p>The Listing stays in Owner&rsquo;s name and on Owner&rsquo;s booking-platform account. Owner invites Co-Host as a co-host on the platform with the access needed to perform the services below, and may remove that access at any time by ending this Agreement under Section 6. Owner keeps ownership of the Property, the Listing and its reviews, and guest bookings are contracts between guests and Owner. Co-Host acts as Owner&rsquo;s service provider and not as a landlord, owner or employee.</p>

<h2>3. Co-Host Services</h2>
<ol>
<li><strong>Pricing and calendar.</strong> Set and adjust nightly rates, minimum stays, discounts and availability, and improve the Listing&rsquo;s title, description, photos order and amenities to pursue stronger bookings.</li>
<li><strong>Guest communication.</strong> Respond to inquiries and booking requests, welcome guests, answer questions during stays, and handle ordinary complaints and reviews.</li>
<li><strong>Turnovers and care.</strong> Coordinate cleaning, linens, restocking and inspections between stays, using vendors Owner approves or reasonable local providers.</li>
<li><strong>Maintenance coordination.</strong> Arrange routine repairs with vendors. Co-Host will obtain Owner&rsquo;s approval before committing Owner to any single cost above <strong>&#36;{{maintenanceApprovalThreshold}}</strong>, except in an emergency where delay risks injury or serious damage, in which case Co-Host may act and will notify Owner promptly.</li>
<li><strong>Reporting.</strong> Share a monthly summary of bookings, revenue, fees and expenses.</li>
</ol>
<p>Co-Host may use employees, partners and subcontractors, including other co-hosts, to perform the services, at its own cost. Owner owes only the fee in Section 4 for the services. Co-Host does not guarantee bookings, occupancy or revenue; any estimate it has shared is a projection and not a promise.</p>

<h2>4. Co-Host Fee</h2>
<ol>
<li><strong>Annual Revenue.</strong> &ldquo;Annual Revenue&rdquo; means the booking revenue the Listing earns in each twelve-month period that begins on the Effective Date or its anniversary (a &ldquo;Contract Year&rdquo;): nightly rent and guest-paid cleaning or other host fees for stays, excluding taxes collected for remittance and refundable deposits, and before the platform&rsquo;s host fees. Revenue is counted when the stay is completed.</li>
<li><strong>Sliding fee.</strong> Owner pays Co-Host a fee on Annual Revenue, with each slice charged at its own rate: <strong>{{tier1Rate}}%</strong> of Annual Revenue up to &#36;{{tier1Limit}}; <strong>{{tier2Rate}}%</strong> of Annual Revenue above &#36;{{tier1Limit}} and up to &#36;{{tier2Limit}}; and <strong>{{tier3Rate}}%</strong> of Annual Revenue above &#36;{{tier2Limit}}. The rate for a slice never changes retroactively, so the effective rate falls as the Listing earns more.</li>
<li><strong>Payment.</strong> The fee is settled by <strong>{{feeSettlement}}</strong>. By invoice: Co-Host invoices monthly, calculating the fee year-to-date and crediting amounts already paid, and Owner pays within fifteen (15) days. By platform payout split: Owner sets the co-host payout share on the booking platform at the percentage Co-Host reasonably calculates to match the fee, and the parties true up any difference after each Contract Year.</li>
<li><strong>Expenses.</strong> Cleaning, supplies, repairs, utilities, permits, taxes, insurance and similar costs of operating the Property are Owner&rsquo;s. Co-Host passes through vendor costs at cost, without markup, and Owner pays vendors directly or reimburses Co-Host within fifteen (15) days of an itemized request.</li>
</ol>

<h2>5. Owner&rsquo;s Responsibilities</h2>
<ol>
<li>Keep the Listing active in Owner&rsquo;s name, honor confirmed reservations, and keep payout details current.</li>
<li>Maintain the Property in safe, rentable condition with working smoke and carbon-monoxide detectors, and keep insurance that permits short-term rental with liability coverage.</li>
<li>Obtain and keep every permit, license and registration the Property requires, collect and remit lodging taxes the booking platform does not, and comply with all laws and any association, landlord or lender restrictions. Co-Host will flag requirements it becomes aware of but does not provide legal advice.</li>
<li>Give Co-Host accurate information, access to the Property for turnovers, and timely decisions on approvals.</li>
</ol>

<h2>6. Term and Termination</h2>
<p>The initial term is <strong>{{termMonths}}</strong> months and then renews month to month. Either party may end this Agreement at any time by giving <strong>{{terminationNoticeDays}}</strong> days&rsquo; written notice, or immediately if the other party materially breaches and does not cure within ten (10) days of written notice, or if the Property cannot lawfully be rented. On termination Owner removes Co-Host&rsquo;s platform access, Co-Host stops acting on the Listing, and the fee remains payable on revenue from stays that were booked while this Agreement was in effect and that are completed within sixty (60) days after termination. Sections 4, 7, 8 and 9 survive termination.</p>

<h2>7. Liability and Indemnity</h2>
<p>Co-Host will perform the services with reasonable care and skill and in compliance with applicable law, and will carry commercial general liability insurance appropriate to its business. Each party will indemnify the other against third-party claims, losses and reasonable legal fees to the extent caused by its own negligence, willful misconduct, or breach of this Agreement or of law. Owner is responsible for loss or damage to the Property and its contents that Co-Host did not cause through negligence or willful misconduct, including guest damage, which Co-Host will help Owner pursue through the platform&rsquo;s protection programs. To the fullest extent the law allows, neither party is liable for indirect, consequential or lost-profit damages, and Co-Host&rsquo;s total liability is limited to the fees it received in the twelve (12) months before the claim arose, except for fraud, gross negligence or willful misconduct.</p>

<h2>8. Confidentiality and Data</h2>
<p>Each party keeps the other&rsquo;s non-public information confidential and uses it only for this Agreement. Co-Host may use booking and guest data only to perform the services and as its privacy policy describes, and will protect it with reasonable safeguards. Co-Host will not use Owner&rsquo;s name or the Property address in marketing without written consent.</p>

<h2>9. Disputes, Governing Law and General Terms</h2>
<p>The parties will first try to resolve any dispute through good-faith discussion for thirty (30) days; if that fails, the dispute will be resolved by <strong>{{disputeResolutionMethod}}</strong>. This Agreement is governed by the laws of the State of <strong>{{governingState}}</strong>. Notices must be in writing to the addresses above (for Co-Host: {{company_notice_email}}). This is the entire agreement on its subject and may be changed only in a writing signed by both parties. Neither party may assign it without the other&rsquo;s written consent, except to a successor to substantially all of its business. If a provision is unenforceable, the rest remains in effect. Electronic signatures through DocuSign are binding and this Agreement may be signed in counterparts.</p>

<h2>Signatures</h2>
<p>By signing, each party confirms that it has read and agrees to this Agreement.</p>
{{signature_blocks}}
`,
};
