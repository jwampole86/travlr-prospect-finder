// npx tsx scripts/sms-campaign-report.ts --batch=2026-10-12-verified   (needs the usual .env values exported; NODE_PATH stubs server-only)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { buildCampaignReport } from '@/lib/services/smsCampaignReport';
const batch = process.argv.find(a => a.startsWith('--batch='))?.split('=')[1];
if (!batch) throw new Error('--batch=<name> is required');
buildCampaignReport(getSupabaseAdmin(), batch).then(r => console.log(JSON.stringify(r, null, 1))).catch(e => { console.error(e); process.exit(1); });
