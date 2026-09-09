'use client';

import React, { useState, useCallback, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import EmailTemplateEditor from './components/EmailTemplateEditor';
import EmailTemplateList from './components/EmailTemplateList';
import { createClient } from '@/lib/supabase/client';
import { Plus, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { sortByCadence } from '@/lib/cadenceSteps';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  cadence_step?: number;
  portfolio?: string;
  created_at?: string;
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const supabase = createClient();

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('email_templates').select('*').order('category');
      if (data) setTemplates(sortByCadence(data as EmailTemplate[]));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  function handleNew() {
    setEditing(null);
    setCreating(true);
  }

  function handleEdit(tpl: EmailTemplate) {
    setEditing(tpl);
    setCreating(true);
  }

  async function handleSave(tpl: Omit<EmailTemplate, 'id' | 'created_at'> & { id?: string }) {
    try {
      if (tpl.id) {
        const { error } = await supabase.from('email_templates').update({
          name: tpl.name, subject: tpl.subject, body: tpl.body, category: tpl.category,
        }).eq('id', tpl.id);
        if (error) throw error;
        toast.success('Template updated');
      } else {
        const { error } = await supabase.from('email_templates').insert({
          name: tpl.name, subject: tpl.subject, body: tpl.body, category: tpl.category,
        });
        if (error) throw error;
        toast.success('Template saved');
      }
      setCreating(false);
      setEditing(null);
      loadTemplates();
    } catch {
      toast.error('Failed to save template');
    }
  }

  async function handleDelete(id: string) {
    try {
      await supabase.from('email_templates').delete().eq('id', id);
      toast.success('Template deleted');
      loadTemplates();
    } catch {
      toast.error('Failed to delete template');
    }
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Mail size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-foreground">Email Templates</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">5-step cadence templates with automatic variable resolution</p>
            </div>
          </div>
          <button
            onClick={handleNew}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            <Plus size={15} />
            <span>New Template</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {creating ? (
            <EmailTemplateEditor
              template={editing}
              onSave={handleSave}
              onCancel={() => { setCreating(false); setEditing(null); }}
            />
          ) : (
            <EmailTemplateList
              templates={templates}
              loading={loading}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onNew={handleNew}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
