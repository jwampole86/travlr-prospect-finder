'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Phone, Mail, CheckSquare, Plus, Clock, CheckCircle2,
  AlertCircle, Trash2, ChevronDown, Calendar, Loader2,
  ListTodo, ArrowRight, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';

interface LeadTask {
  id: string;
  lead_id: string;
  title: string;
  description?: string;
  task_type: 'call' | 'email' | 'todo' | 'follow_up';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  due_date?: string;
  completed_at?: string;
  assigned_to?: string;
  cadence_day?: number;
  sequence_order?: number;
  notes?: string;
  created_at: string;
}

interface LeadTaskBoardProps {
  leadId: string;
  leadName?: string;
}

const TASK_TYPE_CONFIG = {
  call: { label: 'Call', icon: Phone, color: 'text-green-600', bg: 'bg-green-500/10', border: 'border-green-200' },
  email: { label: 'Email', icon: Mail, color: 'text-blue-600', bg: 'bg-blue-500/10', border: 'border-blue-200' },
  todo: { label: 'Task', icon: CheckSquare, color: 'text-purple-600', bg: 'bg-purple-500/10', border: 'border-purple-200' },
  follow_up: { label: 'Follow-up', icon: ArrowRight, color: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-200' },
};

const PRIORITY_CONFIG = {
  low: { label: 'Low', color: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  medium: { label: 'Medium', color: 'text-amber-600', dot: 'bg-amber-500' },
  high: { label: 'High', color: 'text-red-500', dot: 'bg-red-500' },
};

const STATUS_CONFIG = {
  pending: { label: 'Pending', icon: Clock, color: 'text-muted-foreground' },
  in_progress: { label: 'In Progress', icon: AlertCircle, color: 'text-amber-600' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-emerald-600' },
  cancelled: { label: 'Cancelled', icon: RotateCcw, color: 'text-muted-foreground' },
};

const SEQUENCE_TEMPLATES = [
  { day: 1, title: 'Initial outreach call', task_type: 'call' as const, priority: 'high' as const },
  { day: 3, title: 'Follow-up email', task_type: 'email' as const, priority: 'medium' as const },
  { day: 7, title: 'Second call attempt', task_type: 'call' as const, priority: 'medium' as const },
  { day: 14, title: 'Proposal follow-up', task_type: 'follow_up' as const, priority: 'medium' as const },
  { day: 21, title: 'Final check-in', task_type: 'call' as const, priority: 'low' as const },
];

function formatDueDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days}d`;
}

function isDueSoon(dateStr?: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getTime() - now.getTime() < 1000 * 60 * 60 * 48; // within 48h
}

function isOverdue(dateStr?: string): boolean {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < Date.now();
}

export default function LeadTaskBoard({ leadId, leadName }: LeadTaskBoardProps) {
  const supabase = createClient();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<LeadTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSequenceMenu, setShowSequenceMenu] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'completed'>('all');

  // New task form state
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<LeadTask['task_type']>('call');
  const [newPriority, setNewPriority] = useState<LeadTask['priority']>('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newCadenceDay, setNewCadenceDay] = useState('');
  const [saving, setSaving] = useState(false);

  const loadTasks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('lead_tasks')
        .select('*')
        .eq('lead_id', leadId)
        .order('sequence_order', { ascending: true })
        .order('due_date', { ascending: true });
      if (!error && data) setTasks(data as LeadTask[]);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [leadId, supabase]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function handleAddTask() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('lead_tasks').insert({
        lead_id: leadId,
        title: newTitle.trim(),
        task_type: newType,
        priority: newPriority,
        due_date: newDueDate || null,
        notes: newNotes.trim() || null,
        cadence_day: newCadenceDay ? parseInt(newCadenceDay) : null,
        sequence_order: tasks.length,
        created_by: user?.id ?? null,
        status: 'pending',
      });
      if (error) throw error;
      toast.success('Task added');
      setNewTitle(''); setNewType('call'); setNewPriority('medium');
      setNewDueDate(''); setNewNotes(''); setNewCadenceDay('');
      setShowAddForm(false);
      loadTasks();
    } catch {
      toast.error('Failed to add task');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(taskId: string, newStatus: LeadTask['status']) {
    try {
      const updates: Partial<LeadTask> = { status: newStatus };
      if (newStatus === 'completed') updates.completed_at = new Date().toISOString();
      else updates.completed_at = undefined;

      const { error } = await supabase
        .from('lead_tasks')
        .update(updates)
        .eq('id', taskId);
      if (error) throw error;
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
    } catch {
      toast.error('Failed to update task');
    }
  }

  async function handleDeleteTask(taskId: string) {
    try {
      const { error } = await supabase.from('lead_tasks').delete().eq('id', taskId);
      if (error) throw error;
      setTasks(prev => prev.filter(t => t.id !== taskId));
      toast.success('Task removed');
    } catch {
      toast.error('Failed to delete task');
    }
  }

  async function handleAddSequence() {
    setSaving(true);
    setShowSequenceMenu(false);
    try {
      const today = new Date();
      const inserts = SEQUENCE_TEMPLATES.map((tmpl, i) => {
        const dueDate = new Date(today);
        dueDate.setDate(today.getDate() + tmpl.day);
        return {
          lead_id: leadId,
          title: tmpl.title,
          task_type: tmpl.task_type,
          priority: tmpl.priority,
          due_date: dueDate.toISOString(),
          cadence_day: tmpl.day,
          sequence_order: tasks.length + i,
          created_by: user?.id ?? null,
          status: 'pending' as const,
        };
      });
      const { error } = await supabase.from('lead_tasks').insert(inserts);
      if (error) throw error;
      toast.success('5-step follow-up sequence added');
      loadTasks();
    } catch {
      toast.error('Failed to add sequence');
    } finally {
      setSaving(false);
    }
  }

  const filteredTasks = tasks.filter(t => {
    if (activeFilter === 'pending') return t.status === 'pending' || t.status === 'in_progress';
    if (activeFilter === 'completed') return t.status === 'completed';
    return true;
  });

  const pendingCount = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const overdueCount = tasks.filter(t =>
    (t.status === 'pending' || t.status === 'in_progress') && isOverdue(t.due_date)
  ).length;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 bg-muted/30 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-primary"><ListTodo size={15} /></span>
          <span className="text-sm font-semibold text-foreground">Task Board & Follow-up Sequence</span>
          {pendingCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
              {pendingCount}
            </span>
          )}
          {overdueCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white">
              {overdueCount} overdue
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Sequence button */}
          <div className="relative">
            <button
              onClick={() => setShowSequenceMenu(v => !v)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-all"
            >
              <Calendar size={11} />
              Sequence
              <ChevronDown size={10} className={`transition-transform ${showSequenceMenu ? 'rotate-180' : ''}`} />
            </button>
            {showSequenceMenu && (
              <div className="absolute top-full right-0 mt-1 w-64 bg-card border border-border rounded-lg shadow-xl z-50 p-3">
                <p className="text-xs font-semibold text-foreground mb-2">Add Follow-up Sequence</p>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Adds a 5-step cadence: Day 1 call, Day 3 email, Day 7 call, Day 14 follow-up, Day 21 check-in.
                </p>
                <button
                  onClick={handleAddSequence}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-all"
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                  Add 5-Step Sequence
                </button>
              </div>
            )}
          </div>
          {/* Add task button */}
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-all"
          >
            <Plus size={11} />
            Add Task
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Add task form */}
        {showAddForm && (
          <div className="border border-border rounded-xl p-4 bg-muted/20 space-y-3">
            <p className="text-xs font-semibold text-foreground">New Task</p>
            <input
              type="text"
              placeholder="Task title (e.g. Follow-up call with owner)"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground font-medium block mb-1">Type</label>
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value as LeadTask['task_type'])}
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                >
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="todo">Task</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium block mb-1">Priority</label>
                <select
                  value={newPriority}
                  onChange={e => setNewPriority(e.target.value as LeadTask['priority'])}
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium block mb-1">Cadence Day</label>
                <input
                  type="number"
                  placeholder="e.g. 3"
                  value={newCadenceDay}
                  onChange={e => setNewCadenceDay(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                  min="1"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-medium block mb-1">Due Date</label>
              <input
                type="datetime-local"
                value={newDueDate}
                onChange={e => setNewDueDate(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <textarea
              placeholder="Notes (optional)"
              value={newNotes}
              onChange={e => setNewNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddTask}
                disabled={saving || !newTitle.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-all"
              >
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Add Task
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        {tasks.length > 0 && (
          <div className="flex items-center gap-1">
            {(['all', 'pending', 'completed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                  activeFilter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {f === 'all' ? `All (${tasks.length})` : f === 'pending' ? `Active (${pendingCount})` : `Done (${completedCount})`}
              </button>
            ))}
          </div>
        )}

        {/* Task list */}
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-6">
            <ListTodo size={20} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">
              {tasks.length === 0
                ? 'No tasks yet. Add a task or load a follow-up sequence.' :'No tasks in this filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map(task => {
              const typeConfig = TASK_TYPE_CONFIG[task.task_type];
              const priorityConfig = PRIORITY_CONFIG[task.priority];
              const statusConfig = STATUS_CONFIG[task.status];
              const TypeIcon = typeConfig.icon;
              const StatusIcon = statusConfig.icon;
              const overdue = isOverdue(task.due_date) && task.status !== 'completed';
              const dueSoon = isDueSoon(task.due_date) && task.status !== 'completed';

              return (
                <div
                  key={task.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                    task.status === 'completed'
                      ? 'bg-muted/20 border-border opacity-60'
                      : overdue
                      ? 'bg-red-500/5 border-red-200'
                      : dueSoon
                      ? 'bg-amber-500/5 border-amber-200' :'bg-card border-border hover:border-primary/30'
                  }`}
                >
                  {/* Type icon */}
                  <div className={`w-7 h-7 rounded-lg ${typeConfig.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    <TypeIcon size={13} className={typeConfig.color} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-xs font-semibold text-foreground leading-tight ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Priority dot */}
                        <span className={`w-1.5 h-1.5 rounded-full ${priorityConfig.dot}`} title={`${priorityConfig.label} priority`} />
                        {/* Status toggle */}
                        <select
                          value={task.status}
                          onChange={e => handleStatusChange(task.id, e.target.value as LeadTask['status'])}
                          className="text-[10px] border border-border rounded px-1 py-0.5 bg-background text-foreground focus:outline-none cursor-pointer"
                        >
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                        {/* Delete */}
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[10px] font-medium ${typeConfig.color}`}>{typeConfig.label}</span>
                      {task.cadence_day && (
                        <span className="text-[10px] text-muted-foreground">Day {task.cadence_day}</span>
                      )}
                      {task.due_date && (
                        <span className={`text-[10px] font-medium ${overdue ? 'text-red-500' : dueSoon ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {formatDueDate(task.due_date)}
                        </span>
                      )}
                      {task.completed_at && (
                        <span className="text-[10px] text-emerald-600">
                          ✓ {new Date(task.completed_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {task.notes && (
                      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{task.notes}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
