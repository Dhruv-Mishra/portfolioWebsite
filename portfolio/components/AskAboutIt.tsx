'use client';

import { useCallback } from 'react';
import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pickAskGreeting, type SiteAskPage } from '@/lib/chatInvocation';
import { openMiniChat } from '@/lib/siteActionEvents';
import { usePathname, useRouter } from 'next/navigation';

interface AskAboutItProps {
  page: SiteAskPage;
  label?: string;
  className?: string;
}

export default function AskAboutIt({ page, label = 'Ask me about it', className }: AskAboutItProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleClick = useCallback(() => {
    const greeting = pickAskGreeting(page);
    if (pathname?.startsWith('/chat')) {
      window.dispatchEvent(new CustomEvent('chat-contextual-greeting', { detail: { greeting } }));
      return;
    }
    openMiniChat({ page, greeting });
    if (pathname === '/chat') router.push('/chat');
  }, [page, pathname, router]);

  return (
    <button
      type="button"
      onClick={handleClick}
      data-clickable
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 font-hand text-sm md:text-base font-bold',
        'text-[var(--c-ink)] underline decoration-dotted underline-offset-4',
        'opacity-70 hover:opacity-100 transition-opacity',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-ink)]',
        className,
      )}
    >
      <MessageCircle size={14} aria-hidden />
      {label}
    </button>
  );
}
