'use client';

import { createClient } from '@/lib/supabase/client';

export interface ExportSchedule {
  id: string;
  user_id: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  file_format: 'csv' | 'xlsx';
  columns: string[];
  recipient_emails: string[];
  last_sent_at: string | null;
  next_send_at: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export const ALL_EXPORT_COLUMNS = [
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'ZIP' },
  { key: 'beds', label: 'Beds' },
  { key: 'baths', label: 'Baths' },
  { key: 'price', label: 'Price' },
  { key: 'source', label: 'Source' },
  { key: 'stage', label: 'Stage' },
  { key: 'regulation_status', label: 'Regulation Status' },
  { key: 'prospect_score', label: 'Prospect Score' },
  { key: 'days_on_market', label: 'Days on Market' },
  { key: 'contact_name', label: 'Contact Name' },
  { key: 'contact_phone', label: 'Contact Phone' },
  { key: 'notes', label: 'Notes' },
  { key: 'tags', label: 'Tags' },
  { key: 'estimated_adr', label: 'Est. ADR' },
  { key: 'estimated_occupancy', label: 'Est. Occupancy' },
  { key: 'estimated_gross_monthly', label: 'Est. Gross/Month' },
  { key: 'estimated_net_monthly', label: 'Est. Net/Month' },
  { key: 'created_at', label: 'Created At' },
];

export function computeNextSendAt(frequency: 'daily' | 'weekly' | 'monthly'): string {
  const now = new Date();
  if (frequency === 'daily') {
    now.setDate(now.getDate() + 1);
    now.setHours(8, 0, 0, 0);
  } else if (frequency === 'weekly') {
    now.setDate(now.getDate() + 7);
    now.setHours(8, 0, 0, 0);
  } else {
    now.setMonth(now.getMonth() + 1);
    now.setDate(1);
    now.setHours(8, 0, 0, 0);
  }
  return now.toISOString();
}

export async function loadExportSchedules(userId: string): Promise<ExportSchedule[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('export_schedules')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return (data || []) as ExportSchedule[];
}

export async function createExportSchedule(
  userId: string,
  schedule: Omit<ExportSchedule, 'id' | 'user_id' | 'last_sent_at' | 'created_at' | 'updated_at'>
): Promise<ExportSchedule | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('export_schedules')
    .insert({
      user_id: userId,
      ...schedule,
      next_send_at: computeNextSendAt(schedule.frequency),
    })
    .select()
    .single();
  if (error) return null;
  return data as ExportSchedule;
}

export async function updateExportSchedule(
  id: string,
  updates: Partial<Omit<ExportSchedule, 'id' | 'user_id' | 'created_at'>>
): Promise<void> {
  const supabase = createClient();
  await supabase.from('export_schedules').update(updates).eq('id', id);
}

export async function deleteExportSchedule(id: string): Promise<void> {
  const supabase = createClient();
  await supabase.from('export_schedules').delete().eq('id', id);
}
