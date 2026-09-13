/**
 * Centralized VAYO product brand configuration.
 * VAYO is the SaaS platform; TRAVLR Vacation Homes is a customer organization using it.
 * Import from here instead of hard-coding brand strings across components.
 */

export const BRAND = {
  name: 'VAYO',
  legalProductName: 'VAYO',
  tagline: 'AI-Powered Growth for Property Managers',
  shortTagline: 'Growth & Operations Intelligence',
  description: 'The AI-powered growth and operations platform for vacation rental and property management companies.',
  valueProposition: 'Find more high-value homeowners and turn them into management contracts.',
  logo: '/assets/images/vayo-logo.png',
  logoMark: '/assets/images/vayo-logo.png',
  favicon: '/favicon.ico',
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://prospect.staytrvlr.com',
  supportEmail: 'support@travlr.com',
} as const;

export const BRAND_COLORS = {
  midnight: '#050A16',
  deepNavy: '#071A38',
  vayoBlue: '#087BFF',
  electricBlue: '#169CFF',
  iceBlue: '#EAF6FF',
  softBackground: '#F3F8FD',
  white: '#FFFFFF',
  darkText: '#101827',
  mutedText: '#53657A',
} as const;
