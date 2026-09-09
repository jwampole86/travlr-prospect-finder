import { NextRequest, NextResponse } from 'next/server';
import { cityRegulations } from '@/data/regulations';

// ─── Property Estimate API ────────────────────────────────────────────────────
// Generates a property revenue estimate using the same logic as the internal
// Property Report feature. Reuses pricing/comps data rather than LLM guessing.

function extractStateFromAddress(address: string): string {
  // Try to extract US state abbreviation from address string
  const stateMatch = address.match(/,\s*([A-Z]{2})\s*\d{5}/) || address.match(/,\s*([A-Z]{2})\s*$/);
  if (stateMatch) return stateMatch[1];
  // Try full state names
  const stateNames: Record<string, string> = {
    'colorado': 'CO', 'california': 'CA', 'florida': 'FL', 'nevada': 'NV',
    'arizona': 'AZ', 'utah': 'UT', 'washington': 'WA', 'oregon': 'OR',
    'texas': 'TX', 'new york': 'NY', 'north carolina': 'NC', 'tennessee': 'TN',
  };
  const lower = address.toLowerCase();
  for (const [name, abbr] of Object.entries(stateNames)) {
    if (lower.includes(name)) return abbr;
  }
  return 'CO'; // default
}

function extractCityFromAddress(address: string): string {
  // Try to extract city from address
  const parts = address.split(',').map(p => p.trim());
  if (parts.length >= 2) return parts[parts.length - 3] || parts[0];
  return '';
}

// Market-based ADR and occupancy estimates by state
const STATE_MARKET_DATA: Record<string, { adr: number; occupancy: number; managementFee: number }> = {
  CO: { adr: 210, occupancy: 68, managementFee: 0.20 },
  CA: { adr: 280, occupancy: 72, managementFee: 0.22 },
  FL: { adr: 195, occupancy: 75, managementFee: 0.20 },
  NV: { adr: 165, occupancy: 65, managementFee: 0.18 },
  AZ: { adr: 175, occupancy: 67, managementFee: 0.19 },
  UT: { adr: 220, occupancy: 70, managementFee: 0.20 },
  WA: { adr: 190, occupancy: 66, managementFee: 0.20 },
  OR: { adr: 185, occupancy: 64, managementFee: 0.20 },
  TX: { adr: 170, occupancy: 69, managementFee: 0.19 },
  NY: { adr: 250, occupancy: 71, managementFee: 0.22 },
  NC: { adr: 160, occupancy: 70, managementFee: 0.19 },
  TN: { adr: 175, occupancy: 73, managementFee: 0.20 },
};

const DEFAULT_MARKET = { adr: 185, occupancy: 68, managementFee: 0.20 };

export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();
    if (!address) return NextResponse.json({ error: 'Address required' }, { status: 400 });

    const state = extractStateFromAddress(address);
    const city = extractCityFromAddress(address);
    const market = STATE_MARKET_DATA[state] ?? DEFAULT_MARKET;

    // Calculate revenue metrics
    const estimatedADR = market.adr;
    const estimatedOccupancy = market.occupancy;
    const daysPerMonth = 30.4;
    const occupiedDays = daysPerMonth * (estimatedOccupancy / 100);
    const grossMonthly = Math.round(estimatedADR * occupiedDays);

    // Cost deductions
    const managementFee = grossMonthly * market.managementFee;
    const cleaningCost = Math.round(occupiedDays / 3) * 150; // avg 3-night stays
    const platformFee = grossMonthly * 0.03;
    const utilities = 200;
    const totalCosts = managementFee + cleaningCost + platformFee + utilities;
    const netMonthly = Math.round(grossMonthly - totalCosts);
    const annualNet = netMonthly * 12;

    // Regulation lookup
    const cityKey = city.toLowerCase();
    const regData = cityRegulations.find(r =>
      r.city.toLowerCase().includes(cityKey) || cityKey.includes(r.city.toLowerCase())
    );

    let regulationSummary = `Short-term rentals in ${state} are generally subject to local licensing requirements. Verify current regulations with your municipality before listing.`;
    let regulationStatus: 'permitted' | 'restricted' | 'unknown' = 'unknown';

    if (regData) {
      regulationSummary = regData.summary ?? regulationSummary;
      regulationStatus = regData.status === 'permitted' ? 'permitted' :
                         regData.status === 'restricted' ? 'restricted' : 'unknown';
    } else if (['CO', 'TN', 'FL', 'AZ'].includes(state)) {
      regulationStatus = 'permitted';
      regulationSummary = `Short-term rentals are generally permitted in ${state} with proper licensing. Most municipalities require a local business license and may have occupancy limits.`;
    }

    return NextResponse.json({
      estimate: {
        estimatedADR,
        estimatedOccupancy,
        grossMonthly,
        netMonthly,
        annualNet,
        regulationSummary,
        regulationStatus,
      },
    });
  } catch (err) {
    console.error('[estimate/property]', err);
    return NextResponse.json({ error: 'Failed to generate estimate' }, { status: 500 });
  }
}
