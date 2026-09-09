'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { getPropertyListingUrl } from '@/lib/addressUtils';
import { Copy, ExternalLink, CheckCircle, AlertTriangle, MapPin, MessageSquare, ArrowLeft, Activity } from 'lucide-react';
import { toast } from 'sonner';

interface LeadData {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  source: string;
  listing_url: string | null;
  beds: number | null;
  baths: number | null;
  price: number | null;
}

const SOURCE_HOMEPAGES: Record<string, string> = {
  zillow: 'https://www.zillow.com',
  trulia: 'https://www.trulia.com',
  'realtor.com': 'https://www.realtor.com',
  'apartments.com': 'https://www.apartments.com',
  hotpads: 'https://hotpads.com',
  craigslist: 'https://craigslist.org',
  'facebook marketplace': 'https://www.facebook.com/marketplace/propertyrentals',
  'rent.com': 'https://www.rent.com',
  padmapper: 'https://www.padmapper.com',
  'apartment list': 'https://www.apartmentlist.com',
  dwellsy: 'https://dwellsy.com',
};

function getSourceHomepage(source: string): string {
  const key = Object.keys(SOURCE_HOMEPAGES).find(k =>
    source.toLowerCase().includes(k)
  );
  return key ? SOURCE_HOMEPAGES[key] : `https://www.google.com/search?q=${encodeURIComponent(source + ' rental listings')}`;
}

function getSourceDisplayName(source: string): string {
  const src = source.toLowerCase();
  if (src.includes('zillow')) return 'Zillow';
  if (src.includes('trulia')) return 'Trulia';
  if (src.includes('realtor')) return 'Realtor.com';
  if (src.includes('apartments.com')) return 'Apartments.com';
  if (src.includes('hotpads')) return 'HotPads';
  if (src.includes('craigslist')) return 'Craigslist';
  if (src.includes('facebook')) return 'Facebook Marketplace';
  if (src.includes('rent.com') || src === 'rent') return 'Rent.com';
  if (src.includes('padmapper')) return 'PadMapper';
  if (src.includes('apartment list')) return 'Apartment List';
  if (src.includes('dwellsy')) return 'Dwellsy';
  return source;
}

function buildOutreachMessage(address: string, city: string, state: string, sourceName: string): string {
  const fullAddress = [address, city, state].filter(Boolean).join(', ');
  return `Hi! I came across your listing at ${fullAddress} and wanted to reach out — I'm with TRAVLR Vacation Homes, a property management company. If you're ever curious what ${address} could earn as a managed vacation rental, here's a free instant estimate, no strings attached:\n\nhttps://travlrpro3047.builtwithrocket.new/estimate`;
}

export default function FallbackContactPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params?.leadId as string;

  const [lead, setLead] = useState<LeadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [logged, setLogged] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    if (!leadId) return;
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('leads')
          .select('id, address, city, state, zip, source, listing_url, beds, baths, price')
          .eq('id', leadId)
          .single();
        if (error || !data) throw error;
        setLead(data as LeadData);
      } catch {
        // Mock fallback for development
        setLead({
          id: leadId,
          address: '1234 Ocean View Dr',
          city: 'Miami',
          state: 'FL',
          zip: '33101',
          source: 'Trulia',
          listing_url: null,
          beds: 3,
          baths: 2,
          price: 3200,
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [leadId]);

  // Log fallback contact page usage to activity timeline
  useEffect(() => {
    if (!lead || logged) return;
    const logUsage = async () => {
      try {
        await supabase.from('activity_events').insert({
          lead_id: lead.id,
          event_type: 'fallback_contact_page_used',
          description: `Fallback Contact Page opened — listing URL unavailable for ${lead.source} source.`,
          metadata: {
            source: lead.source,
            address: lead.address,
            timestamp: new Date().toISOString(),
          },
          created_at: new Date().toISOString(),
        });
        setLogged(true);
      } catch {
        // Non-blocking
      }
    };
    logUsage();
  }, [lead, logged]);

  const handleCopyAddress = async () => {
    if (!lead) return;
    const fullAddress = [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ');
    try {
      await navigator.clipboard.writeText(fullAddress);
      setCopiedAddress(true);
      toast.success('Address copied to clipboard');
      setTimeout(() => setCopiedAddress(false), 2500);
    } catch {
      toast.error('Could not copy — please copy manually');
    }
  };

  const handleCopyMessage = async () => {
    if (!lead) return;
    const msg = buildOutreachMessage(lead.address, lead.city, lead.state, lead.source);
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedMessage(true);
      toast.success('Message copied to clipboard');
      setTimeout(() => setCopiedMessage(false), 2500);
    } catch {
      toast.error('Could not copy — please copy manually');
    }
  };

  const handleOpenSourceSite = () => {
    if (!lead) return;
    const homepage = getSourceHomepage(lead.source);
    window.open(homepage, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="space-y-3 w-full max-w-md">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted/40 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!lead) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <AlertTriangle size={32} className="text-destructive mx-auto mb-3" />
            <p className="text-foreground font-semibold">Lead not found</p>
            <button onClick={() => router.back()} className="mt-4 text-sm text-primary underline">
              Go back
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const fullAddress = [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ');
  const sourceName = getSourceDisplayName(lead.source);
  const outreachMessage = buildOutreachMessage(lead.address, lead.city, lead.state, lead.source);
  const searchUrl = getPropertyListingUrl(null, lead.address, lead.city, lead.state, lead.zip, lead.source);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Back nav */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          Back to lead record
        </button>

        {/* Status banner */}
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              We couldn&apos;t confirm a direct link to this listing.
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Use the tools below to find it manually on {sourceName} and reach out to the homeowner.
            </p>
          </div>
        </div>

        {/* Property info */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <MapPin size={16} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{lead.address}</p>
              <p className="text-xs text-muted-foreground">{[lead.city, lead.state, lead.zip].filter(Boolean).join(', ')}</p>
              <div className="flex items-center gap-3 mt-1.5">
                {lead.beds && (
                  <span className="text-[11px] text-muted-foreground">{lead.beds} bed</span>
                )}
                {lead.baths && (
                  <span className="text-[11px] text-muted-foreground">{lead.baths} bath</span>
                )}
                {lead.price && (
                  <span className="text-[11px] text-muted-foreground">${lead.price.toLocaleString()}/mo</span>
                )}
                <span className="text-[11px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                  via {sourceName}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Step-by-step workflow */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-muted/20">
            <p className="text-sm font-semibold text-foreground">Manual outreach workflow</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Copy address → open {sourceName} → paste &amp; find listing → copy message → paste into contact form
            </p>
          </div>

          <div className="divide-y divide-border">
            {/* Step 1: Copy address */}
            <div className="p-5 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-primary">1</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Copy property address</p>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono bg-muted/40 px-2 py-1 rounded">
                    {fullAddress}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCopyAddress}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shrink-0 ${
                  copiedAddress
                    ? 'bg-green-500/10 text-green-600 border border-green-500/30' :'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {copiedAddress ? (
                  <><CheckCircle size={14} /> Copied!</>
                ) : (
                  <><Copy size={14} /> Copy Address</>
                )}
              </button>
            </div>

            {/* Step 2: Open source site */}
            <div className="p-5 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-primary">2</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Open {sourceName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Paste the address into the search bar to find the listing.
                  </p>
                </div>
              </div>
              <button
                onClick={handleOpenSourceSite}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors shrink-0"
              >
                <ExternalLink size={14} />
                Open {sourceName}
              </button>
            </div>

            {/* Step 3: Copy message */}
            <div className="p-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-primary">3</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Copy outreach message</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Paste this into the listing&apos;s contact/messaging form once you&apos;ve found it.
                  </p>
                </div>
                <button
                  onClick={handleCopyMessage}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shrink-0 ${
                    copiedMessage
                      ? 'bg-green-500/10 text-green-600 border border-green-500/30' :'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                >
                  {copiedMessage ? (
                    <><CheckCircle size={14} /> Copied!</>
                  ) : (
                    <><Copy size={14} /> Copy Message</>
                  )}
                </button>
              </div>

              {/* Message preview */}
              <div className="ml-9 bg-muted/30 border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare size={12} className="text-primary" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    AI-drafted message
                  </span>
                </div>
                <p className="text-xs text-foreground leading-relaxed whitespace-pre-line">
                  {outreachMessage}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Also try address-specific search */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Try address-specific search</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pre-filtered search on {sourceName} for this exact address.
              </p>
            </div>
            <a
              href={searchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors shrink-0"
            >
              <ExternalLink size={14} />
              Search this address
            </a>
          </div>
        </div>

        {/* Activity log note */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity size={12} />
          <span>This fallback page visit has been logged to the Activity Timeline for this lead.</span>
        </div>
      </div>
    </AppLayout>
  );
}
