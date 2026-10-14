'use client';

import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatChannelSummary {
  channel_id: string;
  type: 'dm' | 'group';
  name: string | null;
  description: string | null;
  other_user_id: string | null;
  other_user_name: string | null;
  other_user_avatar: string | null;
  member_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_name: string | null;
  sender_avatar: string | null;
  body: string;
  metadata: Record<string, unknown> | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface ChatRosterMember {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  app_role: string | null;
  member_role: 'owner' | 'member';
  joined_at: string;
}

export interface TeamDirectoryUser {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  app_role: string | null;
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function listMyChannels(): Promise<ChatChannelSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('list_my_chat_channels');
  if (error) throw error;
  return (data || []) as ChatChannelSummary[];
}

export async function listTeamDirectory(): Promise<TeamDirectoryUser[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('list_chat_team_directory');
  if (error) throw error;
  return (data || []) as TeamDirectoryUser[];
}

export async function listMessages(channelId: string, before?: string, limit = 50): Promise<ChatMessage[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('list_chat_messages', {
    p_channel_id: channelId,
    p_before: before || null,
    p_limit: limit,
  });
  if (error) throw error;
  // RPC returns newest-first (for pagination); callers render oldest-first.
  return ((data || []) as ChatMessage[]).slice().reverse();
}

export async function listChannelRoster(channelId: string): Promise<ChatRosterMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('list_chat_channel_roster', { p_channel_id: channelId });
  if (error) throw error;
  return (data || []) as ChatRosterMember[];
}

export async function getUnreadCount(): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_my_chat_unread_count');
  if (error) throw error;
  return Number(data || 0);
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function createDM(otherUserId: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_dm_channel', { p_other_user_id: otherUserId });
  if (error) throw error;
  return data as string;
}

export async function createGroup(name: string, description: string, memberIds: string[]): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_group_channel', {
    p_name: name,
    p_description: description,
    p_member_ids: memberIds,
  });
  if (error) throw error;
  return data as string;
}

export interface ChatReaction { message_id: string; user_id: string; emoji: string }
export interface ChatSearchHit { id: string; channel_id: string; sender_id: string; sender_name: string | null; body: string; created_at: string }

/** Sends a message and returns the saved row so the caller can replace its optimistic copy. */
export async function sendMessage(channelId: string, body: string, metadata?: Record<string, unknown>): Promise<ChatMessage | null> {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new Error('Not signed in');
  const trimmed = body.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase.from('chat_messages').insert({
    channel_id: channelId,
    sender_id: userRes.user.id,
    body: trimmed,
    ...(metadata ? { metadata } : {}),
  }).select('id,channel_id,sender_id,body,metadata,edited_at,deleted_at,created_at').single();
  if (error) throw error;
  return { ...(data as Omit<ChatMessage, 'sender_name' | 'sender_avatar'>), sender_name: null, sender_avatar: null };
}

export async function listReactions(channelId: string): Promise<ChatReaction[]> {
  const { data, error } = await createClient().from('chat_message_reactions').select('message_id,user_id,emoji').eq('channel_id', channelId).limit(2000);
  if (error) throw error;
  return (data || []) as ChatReaction[];
}

export async function toggleReaction(channelId: string, messageId: string, emoji: string, on: boolean): Promise<void> {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new Error('Not signed in');
  if (on) {
    const { error } = await supabase.from('chat_message_reactions').insert({ channel_id: channelId, message_id: messageId, user_id: userRes.user.id, emoji });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase.from('chat_message_reactions').delete().eq('message_id', messageId).eq('user_id', userRes.user.id).eq('emoji', emoji);
    if (error) throw error;
  }
}

export async function searchMessages(query: string): Promise<ChatSearchHit[]> {
  const { data, error } = await createClient().rpc('search_chat_messages', { p_query: query, p_limit: 25 });
  if (error) throw error;
  return (data || []) as ChatSearchHit[];
}

/** My per-channel state: when I last read it and whether it is muted. */
export async function listMyMemberStates(): Promise<Array<{ channel_id: string; last_read_at: string | null; muted: boolean }>> {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return [];
  const { data, error } = await supabase.from('chat_channel_members').select('channel_id,last_read_at,muted').eq('user_id', userRes.user.id);
  if (error) throw error;
  return (data || []) as Array<{ channel_id: string; last_read_at: string | null; muted: boolean }>;
}

export async function setChannelMuted(channelId: string, muted: boolean): Promise<void> {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new Error('Not signed in');
  const { error } = await supabase.from('chat_channel_members').update({ muted }).eq('channel_id', channelId).eq('user_id', userRes.user.id);
  if (error) throw error;
}

export async function editMessage(messageId: string, newBody: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('chat_messages')
    .update({ body: newBody.trim(), edited_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) throw error;
}

export async function deleteMessage(messageId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('chat_messages')
    .update({ deleted_at: new Date().toISOString(), body: '' })
    .eq('id', messageId);
  if (error) throw error;
}

export async function markChannelRead(channelId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc('mark_chat_channel_read', { p_channel_id: channelId });
  if (error) throw error;
}

export async function addMembersToGroup(channelId: string, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const supabase = createClient();
  const rows = userIds.map((user_id) => ({ channel_id: channelId, user_id, member_role: 'member' as const }));
  const { error } = await supabase.from('chat_channel_members').insert(rows);
  if (error) throw error;
}

export async function leaveChannel(channelId: string): Promise<void> {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new Error('Not signed in');
  const { error } = await supabase
    .from('chat_channel_members')
    .delete()
    .eq('channel_id', channelId)
    .eq('user_id', userRes.user.id);
  if (error) throw error;
}
