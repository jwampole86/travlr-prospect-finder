import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { DS_ENV } from '@/lib/services/docusignService';
import { applyDefaults, companyMissing, missingFields, renderContract } from '@/lib/contracts/render';
import { EMPTY_COMPANY, type CompanyProfile, type ContractField, type ContractKind, type ContractTemplateDef } from '@/lib/contracts/types';

export interface StoredTemplate extends ContractTemplateDef {
  id: string;
  version: number;
  status: 'draft' | 'active' | 'retired';
  legalReview: 'pending' | 'approved';
  reviewNotes: string | null;
  reviewedAt: string | null;
}

type Row = { id: string; kind: ContractKind; version: number; title: string; description: string; signer_label: string; max_signers: number; fields: ContractField[]; body_html: string; status: StoredTemplate['status']; legal_review: StoredTemplate['legalReview']; review_notes: string | null; reviewed_at: string | null };

const toTemplate = (r: Row): StoredTemplate => ({
  id: r.id, kind: r.kind, version: r.version, title: r.title, description: r.description, signerLabel: r.signer_label, maxSigners: r.max_signers,
  fields: r.fields, bodyHtml: r.body_html, status: r.status, legalReview: r.legal_review, reviewNotes: r.review_notes, reviewedAt: r.reviewed_at,
});

export async function getTemplate(opts: { kind: ContractKind; id?: string | null }): Promise<StoredTemplate | null> {
  const q = getSupabaseAdmin().from('contract_templates').select('*');
  const { data } = opts.id ? await q.eq('id', opts.id).maybeSingle<Row>() : await q.eq('kind', opts.kind).eq('status', 'active').maybeSingle<Row>();
  return data ? toTemplate(data) : null;
}

export async function listActiveTemplates(): Promise<StoredTemplate[]> {
  const { data } = await getSupabaseAdmin().from('contract_templates').select('*').eq('status', 'active').order('kind');
  return ((data ?? []) as Row[]).map(toTemplate);
}

export async function getCompanyProfile(): Promise<CompanyProfile> {
  const { data } = await getSupabaseAdmin().from('contract_company_profile').select('legal_name, entity_type, state_of_organization, address, signer_name, signer_title, signer_email, notice_email').eq('id', 1).maybeSingle();
  return { ...EMPTY_COMPANY, ...(data ?? {}) };
}

export type Prepared =
  | { ok: true; html: string; template: StoredTemplate; subject: string; company: CompanyProfile }
  | { ok: false; status: number; error: string };

/** Validates a contract request against its stored template and company profile, and renders the document to send. */
export async function prepareContract(input: { kind: ContractKind; templateId?: string | null; values: Record<string, string>; signers: Array<{ name: string }> }): Promise<Prepared> {
  const template = await getTemplate({ kind: input.kind, id: input.templateId });
  if (!template) return { ok: false, status: 404, error: 'No active template for this contract type. Run the template seed.' };
  if (input.signers.length < 1 || input.signers.length > template.maxSigners) return { ok: false, status: 400, error: `This contract takes 1 to ${template.maxSigners} signer(s)` };

  const values = applyDefaults(template.fields, input.values);
  const missing = missingFields(template.fields, values);
  if (missing.length) return { ok: false, status: 422, error: `Missing required terms: ${missing.join(', ')}` };

  const company = await getCompanyProfile();
  if (DS_ENV === 'production') {
    const gaps = companyMissing(company);
    if (gaps.length) return { ok: false, status: 422, error: `Company details are incomplete (${gaps.join(', ')}). Fill them in under Contracts before sending real agreements.` };
    if (template.legalReview !== 'approved') return { ok: false, status: 403, error: `The ${template.title} template has not been approved by counsel yet. Approve it under Contracts after legal review.` };
  }

  const html = renderContract(template, values, company, input.signers, { draft: template.legalReview !== 'approved' });
  return { ok: true, html, template, company, subject: `${template.title} — ${company.legal_name || 'TRAVLR'}: please review and sign` };
}
