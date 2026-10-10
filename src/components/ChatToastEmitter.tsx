'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MessageCircle, Send, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { listMyChannels, sendMessage, ChatChannelSummary } from '@/lib/services/chatService';

function ChatReplyToast({
  toastId,
  channelId,
  channelName,
  preview,
}: {
  toastId: string | number;
  channelId: string;
  channelName: string;
  preview: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const body = value.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await sendMessage(channelId, body);
      toast.dismiss(toastId);
    } catch {
      setSending(false);
    }
  }

  function handleOpen() {
    toast.dismiss(toastId);
    router.push(`/team-chat?channel=${channelId}`);
  }

  return (
    <div className="flex flex-col gap-2 w-[320px] p-3 rounded-xl border border-border bg-card shadow-lg">
      <button onClick={handleOpen} className="flex items-start gap-2 text-left">
        <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <MessageCircle size={13} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground truncate">{channelName}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">{preview}</p>
        </div>
      </button>
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          placeholder="Reply…"
          disabled={sending}
          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
        />
        <button
          onClick={handleSend}
          disabled={sending || !value.trim()}
          title="Send reply"
          className="p-1.5 rounded-lg bg-primary text-white disabled:opacity-50 shrink-0"
        >
          {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        </button>
        <button onClick={handleOpen} className="text-[11px] font-medium text-muted-foreground hover:text-foreground underline shrink-0">
          Open
        </button>
      </div>
    </div>
  );
}

/**
 * ChatToastEmitter — mounted once in AppLayout.
 * Pops a live, reply-able toast whenever a teammate sends a new chat message,
 * anywhere in the app (not just while the Team Chat page is open). Suppressed
 * while already viewing /team-chat, since new messages append inline there.
 */
export default function ChatToastEmitter() {
  const { user } = useAuth();
  const pathname = usePathname();
  const supabase = createClient();
  const channelsRef = useRef<Map<string, ChatChannelSummary>>(new Map());
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const refreshChannels = useCallback(async () => {
    try {
      const chans = await listMyChannels();
      channelsRef.current = new Map(chans.map((c) => [c.channel_id, c]));
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (user) refreshChannels();
  }, [user, refreshChannels]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`chat-toasts:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        async (payload) => {
          const msg = payload.new as { id: string; channel_id: string; sender_id: string; body: string };
          if (msg.sender_id === user.id) return;
          // Already live-updating inline on the Team Chat page itself.
          if (pathnameRef.current?.startsWith('/team-chat')) return;

          let chanInfo = channelsRef.current.get(msg.channel_id);
          if (!chanInfo) {
            await refreshChannels();
            chanInfo = channelsRef.current.get(msg.channel_id);
            if (!chanInfo) return; // not a member of this channel
          }

          const displayName = chanInfo.type === 'group' ? (chanInfo.name || 'Group') : (chanInfo.other_user_name || 'New message');

          toast.custom(
            (toastId) => (
              <ChatReplyToast
                toastId={toastId}
                channelId={msg.channel_id}
                channelName={displayName}
                preview={msg.body}
              />
            ),
            { duration: 20000 }
          );
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, supabase, refreshChannels]);

  return null;
}
