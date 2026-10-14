export type ContractKind = 'homeowner_management' | 'cohost_partner' | 'agent_contractor' | 'vendor_service';

export interface ContractField {
  key: string;
  label: string;
  group: string;
  type?: 'text' | 'number' | 'select' | 'textarea';
  required?: boolean;
  default?: string;
  options?: string[];
  help?: string;
}

export interface ContractTemplateDef {
  kind: ContractKind;
  title: string;
  description: string;
  /** Who signs opposite TRAVLR. */
  signerLabel: string;
  maxSigners: number;
  fields: ContractField[];
  /** HTML with {{field}} merge tags and a {{signature_blocks}} marker. */
  bodyHtml: string;
}

export interface CompanyProfile {
  legal_name: string;
  entity_type: string;
  state_of_organization: string;
  address: string;
  signer_name: string;
  signer_title: string;
  signer_email: string;
  notice_email: string;
}

export const EMPTY_COMPANY: CompanyProfile = { legal_name: '', entity_type: '', state_of_organization: '', address: '', signer_name: '', signer_title: '', signer_email: '', notice_email: '' };

/** Company fields that must be filled before a contract can be sent for real. */
export const COMPANY_REQUIRED: Array<keyof CompanyProfile> = ['legal_name', 'entity_type', 'state_of_organization', 'address', 'signer_name', 'signer_title', 'signer_email', 'notice_email'];
