// Classifies a short-link request so link-preview and security scanners are not counted as homeowner clicks.

const BOT_UA = /bot|crawler|spider|preview|facebookexternalhit|facebot|twitterbot|slackbot|whatsapp|telegram|discord|linkedin|skypeuri|google-?(?:read|inspection|favicon)|bingpreview|yahoo.?link|embedly|quora link|pinterest|vkshare|w3c_validator|headlesschrome|python-requests|curl\/|wget|go-http-client|axios|node-fetch|okhttp\/|java\/|libwww|proofpoint|mimecast|barracuda|symantec|trendmicro|mcafee|zscaler|cloudflare-?(?:healthchecks|diagnostics)|datadog|pingdom|uptime/i;

export interface ClickInfo {
  isBot: boolean;
  botReason: string | null;
  device: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  os: string;
  browser: string;
}

export function classifyClick(userAgent: string | null, headers: { get(name: string): string | null }): ClickInfo {
  const ua = (userAgent ?? '').trim();
  const purpose = `${headers.get('purpose') ?? ''} ${headers.get('sec-purpose') ?? ''} ${headers.get('x-purpose') ?? ''}`.toLowerCase();
  let botReason: string | null = null;
  if (!ua) botReason = 'no_user_agent';
  else if (BOT_UA.test(ua)) botReason = 'bot_user_agent';
  else if (/prefetch|preview/.test(purpose)) botReason = 'prefetch';

  const device = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua) ? 'tablet'
    : /iPhone|iPod|Android.*Mobile|Mobile/i.test(ua) ? 'mobile'
    : /Windows|Macintosh|X11|CrOS|Linux/i.test(ua) ? 'desktop' : 'unknown';
  const os = /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows'
    : /Macintosh|Mac OS X/i.test(ua) ? 'macOS' : /CrOS/i.test(ua) ? 'ChromeOS' : /Linux/i.test(ua) ? 'Linux' : 'unknown';
  const browser = /Edg\//i.test(ua) ? 'Edge' : /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /FxiOS|Firefox/i.test(ua) ? 'Firefox'
    : /CriOS|Chrome/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : 'unknown';
  return { isBot: botReason !== null, botReason, device, os, browser };
}

const decode = (v: string | null) => { try { return v ? decodeURIComponent(v) : null; } catch { return v; } };

/** Coarse location from the hosting platform's headers (country / region / city). No IP address is kept. */
export function geoFromHeaders(headers: { get(name: string): string | null }) {
  return {
    country: headers.get('x-vercel-ip-country'),
    region: headers.get('x-vercel-ip-country-region'),
    city: decode(headers.get('x-vercel-ip-city')),
  };
}
