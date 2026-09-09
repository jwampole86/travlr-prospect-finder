'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface Portfolio {
  key: string;
  label: string;
  abbr: string;
  /** State abbreviation used to filter leads (e.g. 'CO'). 'all' means no filter. */
  stateCode: string;
  cities: string;
  color: string;
}

// The "All Portfolios" sentinel — always present
const ALL_PORTFOLIO: Portfolio = {
  key: 'all', label: 'All Portfolios', abbr: 'ALL', stateCode: 'all', cities: 'All States', color: 'text-gray-500',
};

// Static fallback list used ONLY when the DB is unreachable.
// This is NOT the source of truth — the DB is.
export const BASE_PORTFOLIOS: Portfolio[] = [
  ALL_PORTFOLIO,
  { key: 'co', label: 'Colorado Portfolio',      abbr: 'CO', stateCode: 'CO', cities: 'Denver / Aspen / Breckenridge / Vail',                  color: 'text-blue-600'    },
  { key: 'ca', label: 'California Portfolio',     abbr: 'CA', stateCode: 'CA', cities: 'Los Angeles / Sherman Oaks / Malibu / Newport Beach',    color: 'text-orange-500'  },
  { key: 'nv', label: 'Nevada Portfolio',         abbr: 'NV', stateCode: 'NV', cities: 'Las Vegas / Henderson',                                  color: 'text-purple-500'  },
  { key: 'wa', label: 'Washington Portfolio',     abbr: 'WA', stateCode: 'WA', cities: 'Seattle / Bellevue / Renton',                            color: 'text-green-600'   },
  { key: 'tx', label: 'Texas Portfolio',          abbr: 'TX', stateCode: 'TX', cities: 'Dallas / Houston',                                       color: 'text-yellow-600'  },
  { key: 'fl', label: 'Florida Portfolio',        abbr: 'FL', stateCode: 'FL', cities: 'Miami',                                                  color: 'text-cyan-500'    },
  { key: 'ut', label: 'Utah Portfolio',           abbr: 'UT', stateCode: 'UT', cities: 'Statewide',                                              color: 'text-red-500'     },
  { key: 'me', label: 'Maine Portfolio',          abbr: 'ME', stateCode: 'ME', cities: 'Statewide',                                              color: 'text-teal-600'    },
  { key: 'or', label: 'Oregon Portfolio',         abbr: 'OR', stateCode: 'OR', cities: 'Statewide',                                              color: 'text-emerald-600' },
  { key: 'ma', label: 'Massachusetts Portfolio',  abbr: 'MA', stateCode: 'MA', cities: 'Statewide',                                              color: 'text-indigo-600'  },
  { key: 'md', label: 'Maryland Portfolio',       abbr: 'MD', stateCode: 'MD', cities: 'Baltimore',                                              color: 'text-rose-600'    },
];

// Keep PORTFOLIOS as an alias for backward compatibility
export const PORTFOLIOS = BASE_PORTFOLIOS;

const PORTFOLIO_COLORS = [
  'text-blue-600', 'text-orange-500', 'text-purple-500', 'text-green-600',
  'text-yellow-600', 'text-cyan-500', 'text-red-500', 'text-teal-600',
  'text-emerald-600', 'text-indigo-600', 'text-rose-600', 'text-amber-600',
  'text-sky-600', 'text-lime-600', 'text-fuchsia-600', 'text-violet-600',
  'text-pink-600', 'text-blue-500', 'text-green-500', 'text-orange-600',
  'text-purple-600', 'text-yellow-500', 'text-cyan-600', 'text-red-600',
  'text-teal-500',
];

const STORAGE_KEY = 'travlr_selected_portfolio';

interface PortfolioContextValue {
  selectedPortfolio: Portfolio;
  setSelectedPortfolio: (p: Portfolio) => void;
  /** Convenience: the stateCode to filter by, or 'all' for no filter */
  activeStateCode: string;
  /** Filter an array of leads by the currently selected portfolio */
  filterLeadsByPortfolio: <T extends { state?: string }>(leads: T[]) => T[];
  /** All portfolios including dynamically created ones */
  visiblePortfolios: Portfolio[];
  /** All configured portfolios (excluding 'all') — use .length for dynamic count */
  configuredPortfolios: Portfolio[];
  /** Set the list of portfolio keys an agent is assigned to */
  setAgentAssignedPortfolios: (keys: string[]) => void;
  /** Reload portfolios from DB */
  refreshPortfolios: () => Promise<void>;
  /** True while the initial DB load is in progress */
  portfoliosLoading: boolean;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [selectedPortfolio, setSelectedPortfolioState] = useState<Portfolio>(ALL_PORTFOLIO);
  const [agentAssignedKeys, setAgentAssignedKeys] = useState<string[] | null>(null);
  // Start with the static fallback; replaced by DB data as soon as it loads
  const [allPortfolios, setAllPortfolios] = useState<Portfolio[]>(BASE_PORTFOLIOS);
  const [portfoliosLoading, setPortfoliosLoading] = useState(true);

  // Load ALL active portfolios from DB — this is the single source of truth
  const refreshPortfolios = useCallback(async () => {
    try {
      setPortfoliosLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('portfolio_registry')
        .select('state_code, state_name, portfolio_key, portfolio_label, is_active')
        .eq('is_active', true)
        .order('state_name');

      if (error || !data || data.length === 0) {
        // DB unavailable or empty — keep static fallback
        return;
      }

      // Build the full portfolio list from DB records
      const dbPortfolios: Portfolio[] = data.map((r: Record<string, unknown>, i: number) => ({
        key: String(r.portfolio_key),
        label: String(r.portfolio_label),
        abbr: String(r.state_code),
        stateCode: String(r.state_code),
        cities: 'Statewide',
        color: PORTFOLIO_COLORS[i % PORTFOLIO_COLORS.length],
      }));

      // Always put "All Portfolios" first
      setAllPortfolios([ALL_PORTFOLIO, ...dbPortfolios]);
    } catch {
      // DB unreachable — keep static fallback silently
    } finally {
      setPortfoliosLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPortfolios();
  }, [refreshPortfolios]);

  // Rehydrate selected portfolio from localStorage after DB loads
  useEffect(() => {
    if (portfoliosLoading) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const found = allPortfolios.find(p => p.key === stored);
        if (found) setSelectedPortfolioState(found);
      }
    } catch {
      // localStorage unavailable
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfoliosLoading]);

  const setSelectedPortfolio = useCallback((p: Portfolio) => {
    setSelectedPortfolioState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p.key);
    } catch {
      // ignore
    }
  }, []);

  const setAgentAssignedPortfolios = useCallback((keys: string[]) => {
    setAgentAssignedKeys(keys);
  }, []);

  // Portfolios visible to this user
  const visiblePortfolios = agentAssignedKeys !== null
    ? allPortfolios.filter(p => p.key === 'all' || agentAssignedKeys.includes(p.key))
    : allPortfolios;

  // Configured portfolios (excluding 'all') — dynamic count, never hardcoded
  const configuredPortfolios = allPortfolios.filter(p => p.key !== 'all');

  const filterLeadsByPortfolio = useCallback(
    <T extends { state?: string }>(leads: T[]): T[] => {
      if (selectedPortfolio.stateCode === 'all') return leads;
      return leads.filter(l => l.state === selectedPortfolio.stateCode);
    },
    [selectedPortfolio]
  );

  return (
    <PortfolioContext.Provider
      value={{
        selectedPortfolio,
        setSelectedPortfolio,
        activeStateCode: selectedPortfolio.stateCode,
        filterLeadsByPortfolio,
        visiblePortfolios,
        configuredPortfolios,
        setAgentAssignedPortfolios,
        refreshPortfolios,
        portfoliosLoading,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio must be used inside PortfolioProvider');
  return ctx;
}
