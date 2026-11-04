import raw from './knowledge.json';

export interface KnowledgeEntry {
  id: string;
  title: string;
  keywords: string[];
  answer: string;
  source: string;
  route?: string;
  kind: string;
}
export const KNOWLEDGE: { version: string; entries: KnowledgeEntry[] } = raw as { version: string; entries: KnowledgeEntry[] };
