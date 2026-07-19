"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  ExternalLink,
  Home,
  RotateCw,
  Settings,
} from 'lucide-react';
import { TapeStrip } from '@/components/ui/TapeStrip';
import { cn } from '@/lib/utils';

interface MenuPosition {
  x: number;
  y: number;
}

interface ContextMenuState extends MenuPosition {
  linkUrl: string | null;
  pathname: string;
}

interface MenuCommand {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  run: () => void;
  separatorBefore?: boolean;
}

const VIEWPORT_MARGIN = 10;
const MENU_GAP = 4;
const NATIVE_CONTEXT_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  'audio',
  'video',
  'canvas',
  'img',
  'iframe',
  'embed',
  'object',
  'a[download]',
  '[data-native-context-menu]',
].join(',');

function shouldKeepNativeContextMenu(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest(NATIVE_CONTEXT_SELECTOR)) return true;
  const selection = window.getSelection();
  return !!selection && !selection.isCollapsed && selection.toString().trim().length > 0;
}

function getLinkUrl(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLAnchorElement>('a[href]')?.href ?? null;
}

function getKeyboardMenuPosition(target: EventTarget | null): MenuPosition {
  if (target instanceof Element) {
    const rect = target.getBoundingClientRect();
    return { x: rect.left + MENU_GAP, y: rect.bottom + MENU_GAP };
  }
  return { x: VIEWPORT_MARGIN, y: VIEWPORT_MARGIN };
}

export default function DesktopContextMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const keyboardInvokerRef = useRef<HTMLElement | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [position, setPosition] = useState<MenuPosition>({ x: 0, y: 0 });
  const activeMenu = menu?.pathname === pathname ? menu : null;

  const closeMenu = (restoreFocus = false) => {
    setMenu(null);
    if (restoreFocus) keyboardInvokerRef.current?.focus({ preventScroll: true });
    keyboardInvokerRef.current = null;
  };
  const runAndClose = (command: () => void) => {
    closeMenu();
    command();
  };

  const copyText = (text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  };

  const commands: MenuCommand[] = [
    ...(activeMenu?.linkUrl ? [
      {
        id: 'open-link',
        label: 'Open link in new tab',
        icon: ExternalLink,
        run: () => window.open(activeMenu.linkUrl!, '_blank', 'noopener,noreferrer'),
      },
      {
        id: 'copy-link',
        label: 'Copy link',
        icon: Copy,
        run: () => copyText(activeMenu.linkUrl!),
      },
    ] : []),
    {
      id: 'back',
      label: 'Back',
      icon: ArrowLeft,
      run: () => window.history.back(),
      separatorBefore: !!activeMenu?.linkUrl,
    },
    {
      id: 'forward',
      label: 'Forward',
      icon: ArrowRight,
      run: () => window.history.forward(),
    },
    {
      id: 'reload',
      label: 'Reload',
      icon: RotateCw,
      run: () => window.location.reload(),
    },
    {
      id: 'home',
      label: 'Home',
      icon: Home,
      run: () => router.push('/'),
      separatorBefore: true,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      run: () => router.push('/settings'),
    },
    {
      id: 'copy-page-link',
      label: 'Copy page link',
      icon: Copy,
      run: () => copyText(window.location.href),
      separatorBefore: true,
    },
  ];

  useEffect(() => {
    const openFromPointer = (event: MouseEvent) => {
      if (event.shiftKey || shouldKeepNativeContextMenu(event.target)) return;
      event.preventDefault();
      keyboardInvokerRef.current = null;
      const nextMenu = { x: event.clientX, y: event.clientY, linkUrl: getLinkUrl(event.target), pathname };
      setPosition(nextMenu);
      setMenu(nextMenu);
    };
    const openFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
      if (shouldKeepNativeContextMenu(event.target)) return;
      event.preventDefault();
      keyboardInvokerRef.current = event.target instanceof HTMLElement ? event.target : null;
      const nextPosition = getKeyboardMenuPosition(event.target);
      setPosition(nextPosition);
      setMenu({ ...nextPosition, linkUrl: getLinkUrl(event.target), pathname });
    };
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) closeMenu();
    };
    const close = () => closeMenu();

    document.addEventListener('contextmenu', openFromPointer);
    document.addEventListener('keydown', openFromKeyboard);
    document.addEventListener('pointerdown', closeOnPointerDown);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('contextmenu', openFromPointer);
      document.removeEventListener('keydown', openFromKeyboard);
      document.removeEventListener('pointerdown', closeOnPointerDown);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [pathname]);

  useLayoutEffect(() => {
    if (!activeMenu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    setPosition({
      x: Math.max(VIEWPORT_MARGIN, Math.min(activeMenu.x, window.innerWidth - rect.width - VIEWPORT_MARGIN)),
      y: Math.max(VIEWPORT_MARGIN, Math.min(activeMenu.y, window.innerHeight - rect.height - VIEWPORT_MARGIN)),
    });
    itemRefs.current[0]?.focus({ preventScroll: true });
  }, [activeMenu]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % commands.length;
    if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + commands.length) % commands.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = commands.length - 1;
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    itemRefs.current[nextIndex]?.focus();
  };

  if (!activeMenu) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Page actions"
      onKeyDown={handleMenuKeyDown}
      className="fixed z-[10000] w-56 rounded-sm border-2 border-dashed border-[var(--c-ink)]/35 bg-[var(--c-paper)] px-1.5 pb-1.5 pt-3 font-hand text-[var(--c-heading)] shadow-[3px_5px_16px_rgba(0,0,0,0.24)]"
      style={{ left: position.x, top: position.y }}
    >
      <TapeStrip size="sm" className="!-top-2 !h-4 !w-16 rotate-2 opacity-70" />
      <p className="px-2 pb-1 font-code text-[9px] uppercase text-[var(--c-ink)]/45" aria-hidden>
        sketchbook actions
      </p>
      {commands.map((command, index) => {
        const Icon = command.icon;
        return (
          <div
            key={command.id}
            className={cn(command.separatorBefore && 'mt-1 border-t border-dashed border-[var(--c-ink)]/20 pt-1')}
          >
            <button
              ref={(element) => { itemRefs.current[index] = element; }}
              type="button"
              role="menuitem"
              tabIndex={index === 0 ? 0 : -1}
              onClick={() => runAndClose(command.run)}
              className="flex min-h-9 w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm font-bold hover:bg-amber-300/20 focus-visible:bg-amber-300/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-amber-500"
            >
              <Icon size={15} aria-hidden />
              <span>{command.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}