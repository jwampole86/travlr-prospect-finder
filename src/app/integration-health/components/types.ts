import type React from 'react';

export type ApiStatus = 'operational' | 'degraded' | 'down' | 'unknown';

export interface IntegrationMeta {
  id: string;
  name: string;
  category: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  fallbackEnabled: boolean;
  fallbackMode: 'simulation' | 'cache' | 'none';
  endpoint: string;
  notes: string;
}

export interface ApiIntegration extends IntegrationMeta {
  status: ApiStatus;
  lastCheckedAt: string | null;
  latencyMs: number | null;
  message: string | null;
  envKeySet: boolean;
}

export interface LiveIntegrationResult {
  configured: boolean;
  status: ApiStatus;
  message: string;
  latencyMs?: number;
}
