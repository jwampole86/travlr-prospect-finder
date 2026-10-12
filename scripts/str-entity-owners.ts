/**
 * Looks up businesses and trusts that own matched homes in the state business registry (where the state publishes one).
 *
 *   npx tsx scripts/str-entity-owners.ts          (dry run)
 *   npx tsx scripts/str-entity-owners.ts --go
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { lookupEntityOwners } from '@/lib/services/strEntity';

const GO = process.argv.includes('--go');
lookupEntityOwners(getSupabaseAdmin(), { limit: 200, write: GO })
  .then(r => console.log(r, GO ? 'saved' : 'DRY RUN: nothing written'))
  .catch(e => { console.error(e); process.exit(1); });
