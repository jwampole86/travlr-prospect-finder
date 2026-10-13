/**
 * Writes the newsletter issue as standalone HTML files you can open in a browser. Sends nothing.
 *   npx tsx scripts/future-str-preview.ts [--issue=1] [--out=~/Downloads]
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { renderIssue } from '@/lib/services/futureStrNewsletter';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const issue = Number(arg('issue') ?? 1);
const out = (arg('out') ?? path.join(os.homedir(), 'Downloads')).replace(/^~/, os.homedir());

for (const audience of ['homeowner', 'operator'] as const) {
  const mail = renderIssue(issue, audience, { siteUrl: 'https://vayoai.io', unsubscribeUrl: '#unsubscribe', postal: '[VAYO postal address goes here]', brandSite: 'vayoai.io', imageBase: `file://${path.join(process.cwd(), 'public/assets/future-str')}` });
  const file = path.join(out, `VAYO_Newsletter_Issue${issue}_${audience === 'homeowner' ? 'Homeowners' : 'Managers_and_Cleaners'}_PREVIEW.html`);
  fs.writeFileSync(file, mail.html);
  console.log(`${file}\n  subject: ${mail.subject}`);
}
