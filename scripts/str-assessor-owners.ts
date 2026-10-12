/**
 * Adds the county owner of record and mailing address to registry-only matches.
 *
 *   npx tsx scripts/str-assessor-owners.ts --limit=40          (dry run)
 *   npx tsx scripts/str-assessor-owners.ts --limit=40 --go
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { enrichAssessorOwners } from '@/lib/services/strAssessor';

const limit = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 40);
enrichAssessorOwners(getSupabaseAdmin(), { limit, write: process.argv.includes('--go') })
  .then(r => console.log(r, process.argv.includes('--go') ? 'saved' : 'DRY RUN: nothing written'))
  .catch(e => { console.error(e); process.exit(1); });
