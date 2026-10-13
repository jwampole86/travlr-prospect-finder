import type { Audience } from '@/lib/futureStrOptions';

/** The newsletter issues. Pure rendering: no database or secrets, so a preview can be produced anywhere. */
type Block =
  | { t: 'h1'; text: string }
  | { t: 'sub'; text: string }
  | { t: 'p'; text: string }
  | { t: 'label'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'note'; text: string }
  | { t: 'ask'; text: string }
  | { t: 'cta'; text: string };

interface Issue { subject: string; preheader: string; blocks: Block[]; sign: [string, string] }

const ISSUES: Record<number, Record<Audience, Issue>> = {
  1: {
    homeowner: {
      subject: 'The future of vacation rentals is changing. We would love to know what you think.',
      preheader: 'A research invitation, not an announcement: how would you feel about supervised robotic help at your rental?',
      blocks: [
        { t: 'h1', text: 'The Future of Vacation Rentals Is Changing.' },
        { t: 'sub', text: "And we'd love to know what you think." },
        { t: 'p', text: 'Imagine a future where vacation rental properties could be prepared for the next guest with the assistance of intelligent technology.' },
        { t: 'p', text: 'Cleaning teams could work alongside advanced robotics, while AI-powered software helps coordinate inspections, supplies, maintenance, and property turnovers.' },
        { t: 'p', text: "At **VAYO AI**, we're exploring how technology could make vacation rental operations more efficient, consistent, and reliable." },
        { t: 'p', text: "We're especially interested in what this future could mean for homeowners." },
        { t: 'label', text: 'Imagine a property where:' },
        { t: 'ul', items: [
          'Cleaning and turnover tasks are coordinated automatically.',
          'AI helps identify missing supplies or incomplete inspections.',
          'Property managers have better visibility into cleaning quality.',
          'One day, robots could assist human cleaning teams with selected tasks.',
        ] },
        { t: 'note', text: "**This is a vision we're researching, not a service we're announcing today.**" },
        { t: 'p', text: 'Before taking that vision further, we want to hear from the people whose properties would be involved.' },
        { t: 'ask', text: 'Would you feel comfortable having a supervised robot assist with cleaning and preparing your vacation rental?' },
        { t: 'p', text: "We'd love your feedback. It takes about two minutes." },
        { t: 'cta', text: 'Share Your Thoughts' },
        { t: 'p', text: 'Your perspective could help shape the next generation of vacation rental management technology.' },
      ],
      sign: ['VAYO AI', 'Exploring the future of smarter vacation rental operations.'],
    },
    operator: {
      subject: 'Help shape how vacation rental turnovers get done',
      preheader: 'We are researching turnover software with property managers and cleaning companies. Would you share 20 minutes?',
      blocks: [
        { t: 'h1', text: 'Help shape how vacation rental turnovers get done.' },
        { t: 'sub', text: "We'd love to learn from the people who run them." },
        { t: 'p', text: 'Turnovers are where reliability is won or lost: late checkouts, missed tasks, supply gaps, callbacks and guest-ready approvals.' },
        { t: 'p', text: "At **VAYO AI**, we're developing software to coordinate crews, checklists, photo inspections and supplies in one place. We're also researching, carefully and at an early stage, whether supervised robotic help could one day assist with selected tasks." },
        { t: 'note', text: '**Nothing here is available today, and no robotics service is being announced.** We want to understand real turnover work before we build further.' },
        { t: 'label', text: 'We would like to hear:' },
        { t: 'ul', items: [
          'What causes your most expensive delays, callbacks or guest complaints.',
          'Which tools you use today, and what you would want them to do better.',
          'Which tasks you would welcome help with, and which should always stay human.',
        ] },
        { t: 'ask', text: 'Would you share a few minutes of your perspective, and possibly talk with us for 20 minutes?' },
        { t: 'cta', text: 'Share Your Perspective' },
        { t: 'p', text: 'We are looking for a small number of early design partners, and your answers help us decide who to talk to first.' },
      ],
      sign: ['VAYO AI', 'Exploring the future of smarter vacation rental operations.'],
    },
  },
};

export const ISSUE_NUMBERS = Object.keys(ISSUES).map(Number);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const plain = (s: string) => s.replace(/\*\*/g, '');

export interface RenderOpts { siteUrl: string; unsubscribeUrl: string; postal: string; brandSite?: string; reason?: string }

export function renderIssue(issue: number, audience: Audience, o: RenderOpts) {
  const def = ISSUES[issue]?.[audience];
  if (!def) throw new Error(`No issue ${issue} for ${audience}`);
  const surveyUrl = `${o.siteUrl}/future-of-str?a=${audience}&src=issue${issue}`;
  const reason = o.reason ?? 'You are receiving this because you asked for updates from VAYO AI about the future of vacation rental operations.';
  const brand = o.brandSite ? `<br>${esc(o.brandSite)}` : '';

  const body = def.blocks.map(b => {
    switch (b.t) {
      case 'h1': return `<h1 style="margin:0 0 8px;font:700 27px/1.25 Georgia,serif;color:#12263f;">${inline(b.text)}</h1>`;
      case 'sub': return `<p style="margin:0 0 22px;font:600 17px/1.4 Georgia,serif;color:#1f7ae0;">${inline(b.text)}</p>`;
      case 'p': return `<p style="margin:0 0 16px;">${inline(b.text)}</p>`;
      case 'label': return `<p style="margin:6px 0 8px;font-weight:700;color:#12263f;">${inline(b.text)}</p>`;
      case 'ul': return `<ul style="margin:0 0 18px;padding-left:22px;">${b.items.map(i => `<li style="margin:0 0 6px;">${inline(i)}</li>`).join('')}</ul>`;
      case 'note': return `<div style="margin:6px 0 20px;padding:14px 16px;background:#eaf2ff;border-left:4px solid #1f7ae0;border-radius:6px;">${inline(b.text)}</div>`;
      case 'ask': return `<p style="margin:8px 0 14px;font:700 19px/1.4 Georgia,serif;color:#12263f;">${inline(b.text)}</p>`;
      case 'cta': return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;"><tr><td style="background:#1f7ae0;border-radius:8px;"><a href="${esc(surveyUrl)}" style="display:inline-block;padding:14px 28px;font:700 16px Arial,sans-serif;color:#ffffff;text-decoration:none;">${inline(b.text)}</a></td></tr></table>`;
    }
  }).join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(def.subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f5f9;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(def.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f9;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#12263f;padding:18px 32px;font:700 14px Arial,sans-serif;letter-spacing:1px;color:#ffffff;">VAYO AI <span style="font-weight:400;color:#8fb9ee;">&nbsp;/&nbsp; THE FUTURE OF PROPERTY TURNOVERS</span></td></tr>
<tr><td style="padding:32px 32px 8px;font:16px/1.6 Georgia,serif;color:#1a2230;">
${body}
<p style="margin:26px 0 0;font:700 16px Georgia,serif;color:#12263f;">${esc(def.sign[0])}</p>
<p style="margin:2px 0 24px;font:italic 15px Georgia,serif;color:#5b677a;">${esc(def.sign[1])}${brand}</p>
</td></tr>
<tr><td style="padding:18px 32px 28px;border-top:1px solid #e5e9f0;font:12px/1.55 Arial,sans-serif;color:#6b7686;">${esc(reason)}<br>VAYO AI, ${esc(o.postal)}.<br><a href="${esc(o.unsubscribeUrl)}" style="color:#6b7686;">Unsubscribe</a> at any time and we will stop emailing you.</td></tr>
</table></td></tr></table></body></html>`;

  const text = def.blocks.map(b => {
    switch (b.t) {
      case 'h1': return plain(b.text).toUpperCase();
      case 'ul': return b.items.map(i => `- ${i}`).join('\n');
      case 'cta': return `${plain(b.text)}: ${surveyUrl}`;
      default: return plain(b.text);
    }
  }).join('\n\n') + `\n\n${def.sign[0]}\n${def.sign[1]}\n\n--\n${reason}\nVAYO AI, ${o.postal}.\nUnsubscribe: ${o.unsubscribeUrl}\n`;

  return { subject: def.subject, preheader: def.preheader, html, text };
}
