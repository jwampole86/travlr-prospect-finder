// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import sample from './sample-data.json';

/** Sample data shared by the demo dashboard and the offline demo brain. The live brain reads the server gateway instead. */
export const KNOWLEDGE_VERSION: string = sample.version;

export interface KbEntry {
  keywords: string[];
  answer: string;
  source: string;
}

export const KNOWLEDGE: KbEntry[] = sample.knowledge;

export const MOCK_LEADS = sample.leads;
