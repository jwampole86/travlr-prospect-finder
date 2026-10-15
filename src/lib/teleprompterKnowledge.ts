import { TRAVLR_PROOF_POINTS } from '@/lib/callScripts';
import { TRUST_ITEMS, TRUST_AFFILIATIONS, TRUST_STORY, WHY_INTRO, WHY_ITEMS } from '@/lib/homeownerTrust';

/**
 * Everything the live teleprompter may say about TRAVLR itself. It is assembled from the approved call scripts and the
 * website-sourced trust content, so there is one source of truth. Add a fact here only if it is true and approved.
 * Prices, fee percentages, contract length and revenue promises are deliberately absent: the agent offers them in writing.
 */
export const TRAVLR_KNOWLEDGE = `ABOUT TRAVLR
${TRAVLR_PROOF_POINTS.map(p => `- ${p}`).join('\n')}
- ${TRUST_STORY}
- ${WHY_INTRO}
- Credentials (public, verifiable on staytrvlr.com): ${TRUST_ITEMS.map(t => t.title).join('; ')}. Affiliations: ${TRUST_AFFILIATIONS}.

WHAT WE DO FOR OWNERS (approved wording)
${WHY_ITEMS.map(i => `- ${i.title}: ${i.withUs}`).join('\n')}

THE TWO WAYS TO WORK WITH US
- Co-host: we handle pricing, marketing and guest messaging on the owner's existing listing.
- Full management: we also take on operations, housekeeping and maintenance, and can add concierge services such as private chefs and in-home spa.
- Owners get transparent owner-portal reporting, and the next steps are a free revenue estimate, a short questionnaire, a written proposal, then an agreement signed through DocuSign.

WHAT THE AGENT MUST NEVER STATE (offer to send it in writing instead)
- Any fee percentage, price, payout split, minimum term, cancellation terms or other contract term.
- Any guaranteed revenue, occupancy or rent. Estimates are estimates from public data, not promises.
- Anything about a market, city rule, permit or tax that is not in the lead profile. Say you will confirm and follow up.`;
