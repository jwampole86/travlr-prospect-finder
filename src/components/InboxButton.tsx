'use client';

import React from 'react';
import { Inbox } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useChatUnreadCount } from '@/lib/hooks/useChatUnreadCount';

/** Quick-access button to Team Chat, mirrors BellButton's style/placement. */
export default function InboxButton() {
  const router = useRouter();
  const count = useChatUnreadCount();
  return (
    <button
      onClick={() => router.push('/team-chat')}
      className="relative flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
      title="Team Chat"
      aria-label="Open Team Chat"
    >
      <Inbox size={16} />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-danger text-[9px] font-bold text-white flex items-center justify-center leading-none">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
