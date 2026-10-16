export type RuleType =
  | 'ownership_min_confidence'
  | 'market_comp_freshness_days'
  | 'price_anomaly_pct'
  | 'overall_min_confidence'
  | 'field_min_confidence';

export type RuleAction = 'flag' | 'block' | 'notify';
export type RuleSeverity = 'info' | 'warning' | 'critical';
export type RuleFilter = 'ALL' | 'ENABLED' | 'DISABLED';

export interface ConfidenceRule {
  id: string;
  rule_name: string;
  rule_type: RuleType;
  threshold_value: number;
  target_field: string | null;
  action: RuleAction;
  severity: RuleSeverity;
  enabled: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ViolationSummary {
  rule_name: string;
  rule_type: string;
  severity: string;
  count: number;
  last_detected: string;
}

export interface RulesEngineResponse {
  rules: ConfidenceRule[];
  violations: ViolationSummary[];
  totalViolations: number;
  unresolvedViolations: number;
}
