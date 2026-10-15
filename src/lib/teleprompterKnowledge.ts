import { TRAVLR_PROOF_POINTS } from '@/lib/callScripts';
import { TRUST_ITEMS, TRUST_AFFILIATIONS, TRUST_STORY, WHY_INTRO, WHY_ITEMS } from '@/lib/homeownerTrust';

/**
 * Numbers the agent is allowed to say out loud (fee percentage, term length, payout schedule and so on).
 * Leave this empty until a number is approved; while it is empty the assistant offers every figure in writing.
 * Example entry: 'Management fee: 25% of gross booking revenue.'
 */
export const APPROVED_NUMBERS: string[] = [];

/**
 * Everything the live teleprompter may say about TRAVLR itself. It is assembled from the approved call scripts, the
 * website-sourced trust content, the public staytrvlr.com pages (About, Homeowners, Guest Services, Contact) and the structure of the
 * standard Short-Term Rental Management Agreement. Add a fact here only if it is true and approved.
 */
export const TRAVLR_KNOWLEDGE = `ABOUT TRAVLR
${TRAVLR_PROOF_POINTS.map(p => `- ${p}`).join('\n')}
- ${TRUST_STORY}
- ${WHY_INTRO}
- Credentials (public, verifiable on staytrvlr.com): ${TRUST_ITEMS.map(t => t.title).join('; ')}. Affiliations: ${TRUST_AFFILIATIONS}.
- The Wall Street Journal article is "The Short-Term Rental Hosts Spending Big to Trick Out Luxury Homes", which covers how TRAVLR's owners turned a hillside geodome in Palm Desert into a standout luxury short-term rental. Palm Springs Life ran "Book Your Stay at This Geodome in Palm Desert", a tour of TRAVLR's five-bedroom Perch retreat.
- Our story: founders Jen and Spencer took a family vacation to La Quinta, California more than a decade ago, saw how much better group travel could be, left careers in digital marketing and law, and started TRAVLR to combine the space and character of private vacation homes with personalized service, modern technology and resort-style amenities. We started with guests (families, friends, companies on reunions, retreats and weekend getaways) and then built a program for luxury homeowners, an effortless ownership solution.
- We describe ourselves as boutique luxury vacation rental management, with white-glove service, local expertise and personalized guest experiences.
- Contact: phone (949) 539-8862, available 24/7; email info@staytrvlr.com, answered within 24 hours; website staytrvlr.com. The free homeowner revenue estimate is at staytrvlr.com/estimate.

WHERE WE OPERATE
- Our website lists these destinations: the Coachella Valley (Palm Desert, La Quinta, Palm Springs, Indio, Coachella, Bermuda Dunes), plus Aspen, Breckenridge, Vail, Las Vegas, Seattle, Bellevue, Miami, Boston, Dallas and Salt Lake City.
- Our roots and long-running portfolio are in the California desert. Homes shown in our online collection include Big Sky (Montana), Scottsdale and Fountain Hills (Arizona), Breckenridge (Colorado) and Whidbey Island (Washington).
- If a homeowner's city is not on that list, do not say yes or no. Say you will confirm coverage for their exact address and follow up.

THE HOMEOWNER PROGRAM (what we offer owners)
- Maximum revenue: dynamic pricing and premium marketing aimed at strong occupancy and rental income.
- Property protection: comprehensive insurance coverage, thorough guest screening and regular property inspections.
- Full-service management: guest communications, cleaning, maintenance and 24/7 guest support and concierge services.
- Premium positioning: the home joins an exclusive collection of luxury rentals that attracts high-quality guests who respect it.
- Services: professional photography and videography; multi-channel marketing (Airbnb, Vrbo, direct bookings); dynamic pricing optimization; guest screening and verification; 24/7 guest support and concierge; professional cleaning and turnover; regular maintenance and inspections; detailed financial reporting; linen and toiletry management; strategic revenue management.
${WHY_ITEMS.map(i => `- ${i.title}: ${i.withUs}`).join('\n')}

WHAT OUR GUESTS GET (useful when owners ask how we treat their home and guests)
- Local area experts offer complimentary concierge help with restaurant reservations, golf tee times, event tickets, grocery shopping and local recommendations.
- Guests can add services we arrange: private chefs and catering, daily housekeeping, villa pre-stocking, in-home spa and wellness, transportation and airport transfers, and equipment rentals such as ski and bike.
- Standard check-in is after 3 PM and check-out by 11 AM local time. Cancellation terms vary by property and are shown with each reservation.

TWO WAYS TO WORK WITH US
- Co-host: we handle pricing, marketing and guest messaging on the owner's existing listing.
- Full management: we also take on operations, housekeeping and maintenance, and can add concierge services such as private chefs and in-home spa.
- Owners get transparent owner-portal reporting. The steps are a free revenue estimate, a short questionnaire, a written proposal, then an agreement signed through DocuSign.

HOW THE MANAGEMENT AGREEMENT WORKS (standard structure; the specific numbers are set for each owner in the written proposal)
- We are the exclusive manager for short-term and vacation rental use (stays under 30 days) during the term. We cannot sell, mortgage or long-term lease the home.
- There is an initial term that renews for the same length unless either side gives written notice before it ends, and either side can end the agreement with written notice. Confirmed reservations that start within an agreed window after termination are honored.
- Onboarding covers listing creation, photography coordination, pricing set-up and connecting the booking channels. The agreement sets the timeline, and our standard is 30 days.
- Our fee is a percentage of gross booking revenue (nightly rent plus guest fees such as cleaning, not taxes or refundable deposits). The exact percentage is in the proposal.
- Booking-platform fees and payment-processing fees come out of revenue. Cleaning, supplies, utilities, repairs and permits are the owner's operating costs, and we pass vendor costs through at cost with no markup.
- Owners are paid net proceeds on a monthly or bi-weekly schedule, after the guest checks in and funds clear, with an itemized statement for each period in the owner portal.
- We get the owner's approval before any single repair or purchase above an agreed dollar amount, except in a true emergency.
- Owners can stay in their home with advance notice, subject to existing reservations.
- Owners keep insurance that permits rental use with liability coverage, and we ask to be named as additional insured where the policy allows. We tell owners which permits and registrations the home needs, and owners obtain and keep them unless agreed otherwise. We collect and remit occupancy and lodging taxes the booking platform does not, where we are permitted to.
- We carry commercial general liability insurance. If a guest damages the home, we help the owner pursue it through the booking platform's protection programs and guest deposits.
- We never guarantee bookings, occupancy or revenue. Every projection is an estimate.

NUMBERS THE AGENT MAY QUOTE
${APPROVED_NUMBERS.length ? APPROVED_NUMBERS.map(n => `- ${n}`).join('\n') : '- None. Do not state any fee percentage, price, payout split, term length, notice period or dollar threshold. Say the exact figures are in the written proposal and you will send it.'}

WHAT THE AGENT MUST NEVER STATE
- Any guaranteed revenue, occupancy or rent. Estimates are estimates from public data, not promises.
- Anything about a market, city rule, permit or tax that is not in the lead profile. Say you will confirm and follow up.
- Anything about TRAVLR that is not in this knowledge. If asked something not covered, say you will find out and follow up today.`;
