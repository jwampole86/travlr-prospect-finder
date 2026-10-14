import type { ContractKind, ContractTemplateDef } from '../types';
import { HOMEOWNER_MANAGEMENT } from './homeowner';
import { COHOST_PARTNER } from './cohost';
import { AGENT_CONTRACTOR } from './agent';
import { VENDOR_SERVICE } from './vendor';

export const CONTRACT_TEMPLATES: ContractTemplateDef[] = [HOMEOWNER_MANAGEMENT, COHOST_PARTNER, AGENT_CONTRACTOR, VENDOR_SERVICE];
export const TEMPLATE_BY_KIND = Object.fromEntries(CONTRACT_TEMPLATES.map((t) => [t.kind, t])) as Record<ContractKind, ContractTemplateDef>;
