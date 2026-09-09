'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { LayoutDashboard, DollarSign, Calendar, FileText, MessageSquare, Settings, LogOut, ChevronDown, Home, ChevronLeft, ChevronRight, User, Building2, Shield, Bell, Menu, X, ClipboardCheck } from 'lucide-react';

const navItems = [
  { key: 'hw-dashboard', label: 'Dashboard', href: '/homeowner', icon: LayoutDashboard },
  { key: 'hw-properties', label: 'My Properties', href: '/homeowner/properties', icon: Building2 },
  { key: 'hw-owner-portal', label: 'Listing Compliance & Revenue', href: '/owner-portal', icon: Shield },
  { key: 'hw-onboarding', label: 'Property Setup', href: '/homeowner/onboarding', icon: Home },
  { key: 'hw-str-checklist', label: 'STR-Ready Checklist', href: '/homeowner/str-checklist', icon: ClipboardCheck },
  { key: 'hw-revenue', label: 'Revenue & Financials', href: '/homeowner/revenue', icon: DollarSign },
  { key: 'hw-bookings', label: 'Bookings', href: '/homeowner/bookings', icon: Calendar },
  { key: 'hw-documents', label: 'Documents', href: '/homeowner/documents', icon: FileText },
  { key: 'hw-requests', label: 'Special Requests', href: '/homeowner/requests', icon: MessageSquare },
  { key: 'hw-notifications', label: 'Notifications', href: '/homeowner/notifications', icon: Bell },
  { key: 'hw-profile', label: 'My Profile', href: '/homeowner/profile', icon: User },
  { key: 'hw-settings', label: 'Account Settings', href: '/homeowner/settings', icon: Settings },
];

interface PropertyOption {
  id: string;
  lead_id: string;
  label: string;
  abbr: string;
}

export default function HomeownerSidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const supabase = createClient();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [propertyOpen, setPropertyOpen] = useState(false);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [activeProperty, setActiveProperty] = useState<PropertyOption | null>(null);

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Owner';
  const userInitials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: propLinks } = await supabase
        .from('property_homeowners')
        .select('id, lead_id, leads(property_address, city, state)')
        .eq('homeowner_user_id', user.id);

      if (propLinks && propLinks.length > 0) {
        const mapped: PropertyOption[] = propLinks.map((pl: any) => {
          const addr = pl.leads?.property_address || pl.lead_id;
          const abbr = addr.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
          return {
            id: pl.id,
            lead_id: pl.lead_id,
            label: addr,
            abbr,
          };
        });
        setProperties(mapped);
        setActiveProperty(mapped[0]);
      }
    };
    load();
  }, [user, supabase]);

  async function handleSignOut() {
    try { await signOut(); } catch {}
  }

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border h-[60px] overflow-hidden">
        <AppLogo src="/assets/images/EFB407B4-CD49-4BC9-9A8E-9894DB058712-1786579880495.PNG" size={28} />
        {(!collapsed || isMobile) && (
          <div className="flex flex-col leading-none min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">TRAVLR</span>
            <span className="text-xs text-muted-foreground truncate">Owner Portal</span>
          </div>
        )}
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="ml-auto p-1 rounded-lg hover:bg-muted transition-all">
            <X size={16} className="text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Property Switcher */}
      {(!collapsed || isMobile) && properties.length > 0 && (
        <div className="mx-3 mt-3 mb-1 relative">
          <button
            onClick={() => setPropertyOpen(v => !v)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/60 border border-border hover:bg-muted transition-all"
          >
            <Home size={13} className="text-primary shrink-0" />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-medium text-foreground truncate">{activeProperty?.label || 'Select Property'}</p>
            </div>
            <ChevronDown size={11} className={`text-muted-foreground shrink-0 transition-transform ${propertyOpen ? 'rotate-180' : ''}`} />
          </button>
          {propertyOpen && properties.length > 1 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
              {properties.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setActiveProperty(p); setPropertyOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted transition-all ${activeProperty?.id === p.id ? 'bg-primary/5' : ''}`}
                >
                  <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                    {p.abbr}
                  </div>
                  <p className="text-xs font-medium text-foreground truncate">{p.label}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto scrollbar-thin">
        {(!collapsed || isMobile) && (
          <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">My Portal</p>
        )}
        {navItems.map(item => {
          const ItemIcon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.key}
              href={item.href}
              title={collapsed && !isMobile ? item.label : undefined}
              className={`group flex items-center gap-3 px-2 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <ItemIcon size={16} className="shrink-0" />
              {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2 py-3 border-t border-border space-y-0.5">
        <div className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-muted cursor-pointer transition-all">
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-white text-xs font-semibold shrink-0">
            {userInitials}
          </div>
          {(!collapsed || isMobile) && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground truncate">{displayName}</p>
              <p className="text-[10px] text-muted-foreground truncate">Homeowner</p>
            </div>
          )}
          {(!collapsed || isMobile) && (
            <button onClick={handleSignOut} title="Sign out" className="p-1 rounded text-muted-foreground hover:text-danger hover:bg-danger/10 transition-all shrink-0">
              <LogOut size={13} />
            </button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button — visible only on small screens */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-40 md:hidden flex items-center justify-center w-9 h-9 rounded-lg bg-card border border-border shadow-sm hover:bg-muted transition-all"
        aria-label="Open navigation"
      >
        <Menu size={16} className="text-foreground" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-card transition-transform duration-300 ease-in-out md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: 260 }}
      >
        <SidebarContent isMobile={true} />
      </aside>

      {/* Desktop sidebar */}
      <aside
        className="relative hidden md:flex flex-col border-r border-border bg-card transition-all duration-300 ease-in-out shrink-0"
        style={{ width: collapsed ? 64 : 240 }}
      >
        <SidebarContent isMobile={false} />

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-[70px] w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-150 z-10"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>
    </>
  );
}
