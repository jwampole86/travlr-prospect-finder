import type { ContractTemplateDef } from '../types';

// Fields keep the names the signing portal already uses, so a lead's deal terms map straight in.
export const HOMEOWNER_MANAGEMENT: ContractTemplateDef = {
  kind: 'homeowner_management',
  title: 'Short-Term Rental Management Agreement',
  description: 'Full-service management of an owner\'s vacation rental: marketing, bookings, guest care, turnovers, maintenance coordination, reporting and payouts.',
  signerLabel: 'Owner',
  maxSigners: 4,
  fields: [
    { key: 'homeownerName', label: 'Owner name(s)', group: 'Owner', required: true },
    { key: 'homeownerEmail', label: 'Owner email', group: 'Owner' },
    { key: 'homeownerPhone', label: 'Owner phone', group: 'Owner' },
    { key: 'homeownerMailingAddress', label: 'Owner mailing address', group: 'Owner', required: true },
    { key: 'propertyAddress', label: 'Property address', group: 'Property', required: true },
    { key: 'propertyType', label: 'Property type', group: 'Property', default: 'Single-family home' },
    { key: 'beds', label: 'Bedrooms', group: 'Property', type: 'number' },
    { key: 'baths', label: 'Bathrooms', group: 'Property', type: 'number' },
    { key: 'managementFeePercent', label: 'Management fee (% of Gross Booking Revenue)', group: 'Fees', type: 'number', required: true },
    { key: 'maintenanceApprovalThreshold', label: 'Maintenance pre-approval threshold ($)', group: 'Fees', type: 'number', default: '500' },
    { key: 'payoutSchedule', label: 'Payout schedule', group: 'Fees', type: 'select', options: ['Monthly', 'Bi-Weekly'], default: 'Monthly', required: true },
    { key: 'finalPayoutWindow', label: 'Final payout window (days after termination)', group: 'Fees', type: 'number', default: '30' },
    { key: 'termLengthMonths', label: 'Initial term (months)', group: 'Term', type: 'number', required: true },
    { key: 'renewalNoticePeriod', label: 'Non-renewal notice (days)', group: 'Term', type: 'number', default: '60' },
    { key: 'onboardingTimeline', label: 'Onboarding timeline', group: 'Term', default: '30 days' },
    { key: 'personalUseNoticePeriod', label: 'Owner stay notice (days)', group: 'Owner use', type: 'number', default: '14' },
    { key: 'blackoutNightCap', label: 'Owner stay cap (nights per year)', group: 'Owner use', type: 'number', help: 'Leave blank for no cap.' },
    { key: 'terminationNoticeConvenience', label: 'Termination notice without cause (days)', group: 'Termination', type: 'number', default: '60' },
    { key: 'terminationNoticeCause', label: 'Cure period for breach (days)', group: 'Termination', type: 'number', default: '30' },
    { key: 'postTerminationHonorWindow', label: 'Honor existing bookings for (days after termination)', group: 'Termination', type: 'number', default: '30' },
    { key: 'listingRemovalWindow', label: 'Listing removal window (days)', group: 'Termination', type: 'number', default: '7' },
    { key: 'disputeResolutionMethod', label: 'Dispute resolution', group: 'Legal', type: 'select', options: ['Mediation', 'Arbitration', 'Litigation'], default: 'Mediation', required: true },
    { key: 'governingState', label: 'Governing law (state)', group: 'Legal', required: true },
  ],
  bodyHtml: `
<h1>Short-Term Rental Management Agreement</h1>
<p class="sub">{{company_name}} and the Owner named below</p>

<p>This Short-Term Rental Management Agreement (the &ldquo;Agreement&rdquo;) is made between <strong>{{company_name}}</strong>, a {{company_state}} {{company_entity}} with its address at {{company_address}} (&ldquo;Manager&rdquo;), and the person(s) identified below (&ldquo;Owner&rdquo;). It takes effect on the date the last party signs (the &ldquo;Effective Date&rdquo;), as recorded in the DocuSign certificate of completion.</p>

<h2>1. Parties and Property</h2>
<table>
<tr><th>Owner</th><td>{{homeownerName}}<br>{{homeownerMailingAddress}}<br>{{homeownerEmail}} &middot; {{homeownerPhone}}</td></tr>
<tr><th>Property</th><td>{{propertyAddress}}<br>{{propertyType}} &middot; {{beds}} bedrooms &middot; {{baths}} bathrooms (the &ldquo;Property&rdquo;)</td></tr>
</table>
<p>If more than one person signs as Owner, each represents that they hold an ownership interest in the Property, and their obligations under this Agreement are joint and several.</p>

<h2>2. Appointment</h2>
<p>Owner appoints Manager as the exclusive manager of the Property for short-term and vacation rental use (stays of fewer than thirty (30) days) during the Term, and authorizes Manager to perform the services in Section 4 in Owner&rsquo;s name and on Owner&rsquo;s behalf. Manager is not authorized to sell, mortgage or lease the Property for longer terms, or to bind Owner to any obligation other than as this Agreement allows.</p>

<h2>3. Term and Renewal</h2>
<p>The initial term is <strong>{{termLengthMonths}}</strong> months from the Effective Date (the &ldquo;Term&rdquo;). The Agreement then renews for successive periods of the same length unless either party gives written notice of non-renewal at least <strong>{{renewalNoticePeriod}}</strong> days before the Term ends. Manager will complete onboarding (listing creation, photography coordination, pricing set-up and channel connections) within <strong>{{onboardingTimeline}}</strong> of the Effective Date, provided Owner delivers the access and information described in Section 6 on time.</p>

<h2>4. Manager&rsquo;s Services</h2>
<ol>
<li><strong>Marketing and listing.</strong> Create and maintain listings on the booking platforms Manager selects, and set and adjust nightly rates, minimum stays and availability to pursue strong, sustainable revenue.</li>
<li><strong>Reservations and guests.</strong> Accept and manage bookings, communicate with guests before, during and after stays, apply house rules, and handle ordinary guest requests and complaints.</li>
<li><strong>Turnovers.</strong> Arrange cleaning, linens and restocking between stays, and inspect the Property after turnovers.</li>
<li><strong>Maintenance.</strong> Coordinate routine maintenance and repairs with qualified vendors. Manager will obtain Owner&rsquo;s approval before incurring any single repair or purchase above <strong>&#36;{{maintenanceApprovalThreshold}}</strong>, except in an emergency where delay risks injury or serious damage to the Property, in which case Manager may act and will notify Owner promptly.</li>
<li><strong>Reporting.</strong> Provide Owner with an itemized statement of bookings, revenue, fees and expenses for each payout period and make it available in the owner portal.</li>
<li><strong>Taxes and licensing.</strong> Collect and remit occupancy, lodging and sales taxes that the booking platform does not collect, where Manager is permitted to do so. Manager will tell Owner which permits or registrations the Property requires; Owner is responsible for obtaining and keeping them unless the parties agree otherwise in writing.</li>
</ol>

<h2>5. Fees, Expenses and Payouts</h2>
<ol>
<li><strong>Management fee.</strong> Owner pays Manager <strong>{{managementFeePercent}}%</strong> of Gross Booking Revenue. &ldquo;Gross Booking Revenue&rdquo; means the nightly rent and any fees charged to guests for the stay (including cleaning fees where applicable), excluding taxes collected for remittance, refundable deposits, and platform fees charged to the guest.</li>
<li><strong>Platform and payment fees.</strong> Booking-platform host fees and payment-processing fees are Owner&rsquo;s expense and are deducted from revenue before payout.</li>
<li><strong>Operating expenses.</strong> Owner bears the cost of cleaning, supplies, utilities, repairs, inspections, permits and similar costs of operating the Property. Manager passes through vendor costs at cost, without markup, unless Owner agrees in writing to a different arrangement.</li>
<li><strong>Payouts.</strong> Manager will pay Owner net proceeds (revenue received less the management fee, platform and payment fees, taxes remitted and approved expenses) on a <strong>{{payoutSchedule}}</strong> basis, after the guest&rsquo;s check-in has occurred and funds have cleared. Manager may hold back a reasonable reserve for pending refunds, chargebacks and approved expenses. If expenses exceed revenue in a period, Owner will reimburse the shortfall within fifteen (15) days of written request.</li>
<li><strong>Owner statements and records.</strong> Manager will keep accurate records and give Owner access to them on reasonable request.</li>
</ol>

<h2>6. Owner&rsquo;s Responsibilities</h2>
<ol>
<li>Provide complete and accurate information about the Property, keys or access codes, and any rules of the community, homeowners&rsquo; association or landlord.</li>
<li>Keep the Property safe, insured and in good repair, with working smoke and carbon-monoxide detectors, and maintain homeowner&rsquo;s or short-term rental insurance with liability coverage that permits rental use. Owner will name Manager as an additional insured where the policy allows.</li>
<li>Comply with all laws, permit and license requirements, tax obligations, and association or lease restrictions that apply to renting the Property.</li>
<li>Tell Manager promptly of any dispute, lien, violation notice, or change in ownership or financing that affects the Property.</li>
</ol>

<h2>7. Owner Use</h2>
<p>Owner may stay at the Property by giving Manager at least <strong>{{personalUseNoticePeriod}}</strong> days&rsquo; notice, subject to existing reservations. Owner stays are limited to <strong>{{blackoutNightCap}}</strong> nights per calendar year (if no number is shown, no cap applies). Owner will leave the Property in rentable condition and pay for any extra cleaning.</p>

<h2>8. Termination</h2>
<ol>
<li><strong>Without cause.</strong> Either party may end this Agreement at any time by giving the other at least <strong>{{terminationNoticeConvenience}}</strong> days&rsquo; written notice.</li>
<li><strong>For breach.</strong> Either party may end this Agreement if the other materially breaches it and does not cure the breach within <strong>{{terminationNoticeCause}}</strong> days of written notice describing it. Manager may end this Agreement immediately if the Property cannot lawfully be rented, or if continued operation presents a serious safety risk.</li>
<li><strong>Existing reservations.</strong> Manager will honor confirmed reservations for stays that begin within <strong>{{postTerminationHonorWindow}}</strong> days after termination and will continue to earn the management fee on them. For later reservations, Manager will cooperate to cancel or transfer them in the way that is least harmful to guests, and Owner is responsible for guest refunds and compensation resulting from any cancellation Owner requires.</li>
<li><strong>Wind-down.</strong> Manager will remove or transfer the Property&rsquo;s listings within <strong>{{listingRemovalWindow}}</strong> days after the Term ends, and pay Owner all net proceeds owed within <strong>{{finalPayoutWindow}}</strong> days after the last stay ends. Owner will pay all fees and expenses then due.</li>
</ol>

<h2>9. Independent Contractor; Standard of Care</h2>
<p>Manager acts as an independent contractor and not as Owner&rsquo;s employee, partner or joint venturer. Manager will perform the services with reasonable care and skill and in compliance with applicable law. Manager does not guarantee any level of bookings, occupancy or revenue, and any projection shown to Owner is an estimate only.</p>

<h2>10. Insurance, Liability and Indemnity</h2>
<p>Manager will carry commercial general liability insurance appropriate to its business. Each party will indemnify the other against third-party claims, losses and reasonable legal fees to the extent caused by its own negligence, willful misconduct or breach of this Agreement or of applicable law. Owner is responsible for loss or damage to the Property and its contents that is not caused by Manager&rsquo;s negligence or willful misconduct, including damage by guests, which Manager will help Owner pursue through the booking platform&rsquo;s protection programs and guest deposits. To the fullest extent the law allows, neither party is liable to the other for indirect, consequential or lost-profit damages, and Manager&rsquo;s total liability under this Agreement is limited to the management fees it received in the twelve (12) months before the claim arose, except for fraud, gross negligence or willful misconduct.</p>

<h2>11. Confidentiality and Data</h2>
<p>Each party will keep the other&rsquo;s non-public information confidential and use it only to perform this Agreement. Manager may collect and use guest and booking data as needed to operate the Property and as its privacy policy describes, and will protect it with reasonable safeguards. Manager may use Owner&rsquo;s name and non-identifying performance information in aggregate reporting, but will not use Owner&rsquo;s name or the Property address in marketing without Owner&rsquo;s written consent.</p>

<h2>12. Disputes and Governing Law</h2>
<p>The parties will first try to resolve any dispute through good-faith discussion for thirty (30) days. If that fails, the dispute will be resolved by <strong>{{disputeResolutionMethod}}</strong>. This Agreement is governed by the laws of the State of <strong>{{governingState}}</strong>, without regard to its conflict-of-laws rules. The prevailing party in any proceeding is entitled to its reasonable legal fees.</p>

<h2>13. General</h2>
<p><strong>Notices.</strong> Notices must be in writing and sent to the addresses and email addresses above (for Manager: {{company_notice_email}}). <strong>Entire agreement.</strong> This Agreement is the whole agreement about its subject and replaces earlier discussions; changes must be in writing and signed by both parties. <strong>Assignment.</strong> Neither party may assign this Agreement without the other&rsquo;s written consent, except to a successor to substantially all of its business. <strong>Severability.</strong> If a provision is unenforceable, the rest remains in effect. <strong>Electronic signatures.</strong> The parties agree that electronic signatures through DocuSign are binding, and that this Agreement may be signed in counterparts.</p>

<h2>Signatures</h2>
<p>By signing, each party confirms that it has read and agrees to this Agreement.</p>
{{signature_blocks}}
`,
};
