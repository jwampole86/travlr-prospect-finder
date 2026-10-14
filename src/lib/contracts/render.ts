import type { CompanyProfile, ContractField, ContractTemplateDef } from './types';
import { COMPANY_REQUIRED } from './types';

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const BLANK = '____________';

/** Text DocuSign uses to place signature and date fields; hidden in the document itself. */
export const ANCHORS = {
  sign: (n: number | string) => `[SIGN_HERE_${n}]`,
  date: (n: number | string) => `[DATE_HERE_${n}]`,
  companySign: '[COMPANY_SIGN_HERE]',
  companyDate: '[COMPANY_DATE_HERE]',
};
const hidden = (text: string) => `<span style="color:#ffffff;font-size:1px;line-height:1px">${text}</span>`;

export function companyMissing(company: CompanyProfile): string[] {
  return COMPANY_REQUIRED.filter((k) => !company[k]?.trim());
}

export function applyDefaults(fields: ContractField[], values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) out[f.key] = (values[f.key] ?? '').toString().trim() || f.default || '';
  return out;
}

export function missingFields(fields: ContractField[], values: Record<string, string>): string[] {
  return fields.filter((f) => f.required && !values[f.key]?.trim()).map((f) => f.label);
}

function signatureBlocks(def: ContractTemplateDef, signers: Array<{ name: string }>, company: CompanyProfile): string {
  const rows = signers.map((s, i) => `
    <div class="sig"><p><strong>${esc(def.signerLabel)}${signers.length > 1 ? ` ${i + 1}` : ''}:</strong> ${esc(s.name)}</p>
    <p>Signature: ${hidden(ANCHORS.sign(i + 1))}<span class="line"></span> &nbsp; Date: ${hidden(ANCHORS.date(i + 1))}<span class="line short"></span></p></div>`).join('');
  return `${rows}
    <div class="sig"><p><strong>${esc(company.legal_name || '[COMPANY]')}</strong><br>By: ${esc(company.signer_name || '[AUTHORIZED SIGNER]')}, ${esc(company.signer_title || '[TITLE]')}</p>
    <p>Signature: ${hidden(ANCHORS.companySign)}<span class="line"></span> &nbsp; Date: ${hidden(ANCHORS.companyDate)}<span class="line short"></span></p></div>`;
}

export interface RenderOptions {
  /** Shown as a banner while the template has not been approved by counsel. */
  draft: boolean;
}

/** Fills a template. Values are HTML-escaped; unset optional fields print as a blank line. */
export function renderContract(def: ContractTemplateDef, rawValues: Record<string, string>, company: CompanyProfile, signers: Array<{ name: string }>, options: RenderOptions): string {
  const values = applyDefaults(def.fields, rawValues);
  const company_map: Record<string, string> = {
    company_name: company.legal_name, company_entity: company.entity_type, company_state: company.state_of_organization,
    company_address: company.address, company_signer: company.signer_name, company_signer_title: company.signer_title, company_notice_email: company.notice_email,
  };
  const body = def.bodyHtml
    .replace('{{signature_blocks}}', signatureBlocks(def, signers, company))
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
      const v = key in company_map ? company_map[key] : values[key];
      return v?.trim() ? `<span class="v">${esc(v)}</span>` : `<span class="v blank">${BLANK}</span>`;
    });

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(def.title)}</title>
<style>
body{font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.55;color:#111;margin:36px 44px}
h1{font-size:19px;text-align:center;margin:0 0 4px}h2{font-size:13px;margin:20px 0 6px;text-transform:uppercase;letter-spacing:.03em}
p{margin:6px 0;text-align:justify}ol,ul{margin:6px 0 6px 18px;padding:0}li{margin:3px 0}
.sub{text-align:center;color:#444;margin-bottom:14px}.v{font-weight:bold}.blank{font-weight:normal}
table{width:100%;border-collapse:collapse;margin:10px 0}td,th{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top;font-size:11.5px}th{background:#f0f0f0;width:34%}
.draft{border:2px solid #b45309;background:#fffbeb;color:#92400e;padding:8px 10px;margin-bottom:14px;font-family:Arial,sans-serif;font-size:11px;text-align:center}
.sig{margin-top:26px;page-break-inside:avoid}.line{display:inline-block;border-bottom:1px solid #000;width:240px;height:14px}.short{width:110px}
</style></head><body>
${options.draft ? '<div class="draft"><strong>DRAFT FOR REVIEW.</strong> This template has not been approved by counsel and is not for production use.</div>' : ''}
${body}
</body></html>`;
}

/** Sample values so a template can be previewed before a real deal exists. */
export function sampleValues(def: ContractTemplateDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of def.fields) out[f.key] = f.default || (f.options?.[0] ?? (f.type === 'number' ? '10' : `[${f.label}]`));
  return out;
}
