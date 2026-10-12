// Public contact options shown to homeowners. Phone and instant booking appear only when configured.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'info@staytrvlr.com';
export const CONTACT_PHONE = process.env.NEXT_PUBLIC_CONTACT_PHONE || null;
export const WEBSITE_URL = 'https://staytrvlr.com';
export const WEBSITE_LABEL = 'staytrvlr.com';
export const BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL || null;

export function telHref(phone: string): string {
  return 'tel:' + phone.replace(/[^\d+]/g, '');
}
