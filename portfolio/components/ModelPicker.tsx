"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Brain, Check, ChevronDown, Image, Turtle, Zap, type LucideIcon } from 'lucide-react';
import { CHAT_MODELS, type ChatModelCapability, type ChatModelId } from '@/lib/chatModels';
import {
  getChatModelDisplayName,
  isChatModelFacingIssues,
  refreshChatModelStatus,
  useChatModelStatus,
} from '@/lib/chatModelStatus';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';

const CAPABILITY_DETAILS: Record<ChatModelCapability, { label: string; Icon: LucideIcon; badgeClassName: string }> = {
  fast: {
    label: 'Fast responses',
    Icon: Zap,
    badgeClassName: 'border-amber-700/35 bg-amber-300/20 text-amber-800 dark:border-amber-200/35 dark:text-amber-200',
  },
  image: {
    label: 'Image support',
    Icon: Image,
    badgeClassName: 'border-sky-700/35 bg-sky-300/20 text-sky-800 dark:border-sky-200/35 dark:text-sky-200',
  },
  reasoning: {
    label: 'Strong reasoning',
    Icon: Brain,
    badgeClassName: 'border-violet-700/35 bg-violet-300/20 text-violet-800 dark:border-violet-200/35 dark:text-violet-200',
  },
  slow: {
    label: 'Slower responses',
    Icon: Turtle,
    badgeClassName: 'border-rose-700/35 bg-rose-300/20 text-rose-800 dark:border-rose-200/35 dark:text-rose-200',
  },
};

const MODEL_GROUPS = ['Recommended', 'NVIDIA', 'Local agent'] as const;
const PROVIDER_LABELS = {
  groq: 'Groq',
  nvidia: 'NVIDIA',
  local: 'Local agent',
} as const;
const VIEWPORT_MARGIN = 12;
const LISTBOX_GAP = 8;
const NAVIGATION_MARGIN = 8;
const LOCAL_MODEL_ID = 'qwen-3.5-4b-local';

type ListboxPlacement = 'top' | 'bottom';

interface ModelPickerProps {
  id: string;
  value: ChatModelId;
  onValueChange: (modelId: ChatModelId) => void;
}

function LocalModelHealthDot() {
  return (
    <span
      role="img"
      aria-label="Local model is healthy"
      title="Local model is healthy"
      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20"
    />
  );
}

export function ModelPicker({ id, value, onValueChange }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeModelId, setActiveModelId] = useState<ChatModelId>(value);
  const [placement, setPlacement] = useState<ListboxPlacement>('bottom');
  const [listboxMaxHeight, setListboxMaxHeight] = useState(0);
  const modelStatus = useChatModelStatus();
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Partial<Record<ChatModelId, HTMLDivElement>>>({});
  const listboxId = useId();
  const selectedModel = CHAT_MODELS.find((model) => model.id === value);
  const activeIndex = CHAT_MODELS.findIndex((model) => model.id === activeModelId);
  const selectedModelIsHealthyLocal = selectedModel?.id === LOCAL_MODEL_ID && modelStatus.local?.healthy;

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeModelId]?.focus();
  }, [activeModelId, open]);

  useLayoutEffect(() => {
    if (!open) return;

    const updateListboxPlacement = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      const pickerRect = pickerRef.current?.getBoundingClientRect();
      if (!triggerRect || !pickerRect) return;

      const navigationRect = document.querySelector<HTMLElement>('nav[aria-label="Main navigation"]')?.getBoundingClientRect();
      const usableViewportTop = Math.max(VIEWPORT_MARGIN, (navigationRect?.bottom ?? 0) + NAVIGATION_MARGIN);
      const availableAbove = Math.min(triggerRect.top, pickerRect.top) - usableViewportTop - LISTBOX_GAP;
      const availableBelow = window.innerHeight - pickerRect.bottom - VIEWPORT_MARGIN - LISTBOX_GAP;
      const nextPlacement: ListboxPlacement = availableAbove > availableBelow ? 'top' : 'bottom';
      const availableSpace = nextPlacement === 'top' ? availableAbove : availableBelow;

      setPlacement(nextPlacement);
      setListboxMaxHeight(Math.max(0, Math.floor(availableSpace)));
    };

    updateListboxPlacement();
    window.addEventListener('resize', updateListboxPlacement);
    return () => window.removeEventListener('resize', updateListboxPlacement);
  }, [open]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const closePicker = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const openPicker = () => {
    setActiveModelId(value);
    setOpen(true);
    void refreshChatModelStatus();
  };

  const selectModel = (modelId: ChatModelId) => {
    onValueChange(modelId);
    closePicker();
  };

  const moveActiveOption = (nextIndex: number) => {
    const boundedIndex = Math.max(0, Math.min(nextIndex, CHAT_MODELS.length - 1));
    setActiveModelId(CHAT_MODELS[boundedIndex].id);
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActiveOption(activeIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveActiveOption(activeIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        moveActiveOption(0);
        break;
      case 'End':
        event.preventDefault();
        moveActiveOption(CHAT_MODELS.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        selectModel(activeModelId);
        break;
      case 'Tab':
        closePicker(false);
        break;
      case 'Escape':
        event.preventDefault();
        closePicker();
        break;
      default:
        break;
    }
  };

  return (
    <div ref={pickerRef} className="relative mt-1">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => (open ? closePicker(false) : openPicker())}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-sm border-2 border-dashed border-[var(--c-ink)]/30 bg-[var(--c-paper)] px-3 py-2 text-left font-hand text-base text-[var(--c-heading)] shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-ink)] md:text-lg"
      >
        <span className="flex min-w-0 flex-1 items-start gap-2">
          <span className="min-w-0">
            <span className="block break-words font-bold leading-tight">{getChatModelDisplayName(selectedModel, modelStatus.local)}</span>
            <span className="block break-words text-sm leading-snug text-[var(--c-ink)]/60">{selectedModel?.group} · {selectedModel ? PROVIDER_LABELS[selectedModel.provider] : null}</span>
          </span>
          {selectedModelIsHealthyLocal ? <LocalModelHealthDot /> : null}
        </span>
        <ChevronDown className={cn('shrink-0 transition-transform', open && 'rotate-180')} size={20} aria-hidden />
      </button>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 font-hand text-xs text-[var(--c-ink)]/65" aria-label="Model capability legend">
        {Object.entries(CAPABILITY_DETAILS).map(([capability, detail]) => {
          const { Icon } = detail;
          return (
            <Tooltip key={capability} label={detail.label}>
              <button
                type="button"
                aria-label={detail.label}
                title={detail.label}
                className={cn('inline-flex h-7 w-7 items-center justify-center rounded-sm border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-ink)]', detail.badgeClassName)}
              >
                <Icon size={14} aria-hidden />
                <span className="sr-only">{detail.label}</span>
              </button>
            </Tooltip>
          );
        })}
      </div>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Conversation model"
          style={{ maxHeight: `${listboxMaxHeight}px` }}
          className={cn(
            'absolute z-30 w-full overflow-x-clip overflow-y-auto rounded-sm border-2 border-dashed border-[var(--c-ink)]/35 bg-[var(--c-paper)] py-1 shadow-lg ruler-scrollbar',
            placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          {MODEL_GROUPS.map((group) => (
            <div key={group} role="group" aria-label={group} className="px-1">
              <p className="px-3 pb-1 pt-2 font-code text-[10px] uppercase text-[var(--c-ink)]/50">{group}</p>
              {CHAT_MODELS.filter((model) => model.group === group).map((model) => {
                const modelIsHealthyLocal = model.id === LOCAL_MODEL_ID && modelStatus.local?.healthy;
                const modelHasIssues = isChatModelFacingIssues(model.id, modelStatus);

                return (
                  <div
                  key={model.id}
                  ref={(element) => {
                    if (element) optionRefs.current[model.id] = element;
                  }}
                  role="option"
                  tabIndex={model.id === activeModelId ? 0 : -1}
                  aria-selected={model.id === value}
                  onClick={() => selectModel(model.id)}
                  onKeyDown={handleOptionKeyDown}
                  className={cn(
                    'flex min-h-12 cursor-pointer items-center gap-3 border-l-4 border-t border-l-transparent border-t-dashed border-[var(--c-ink)]/18 px-3 py-2 font-hand outline-none transition-colors first:border-t-0',
                    model.id === value && 'border-l-emerald-600 bg-emerald-500/10 shadow-[inset_3px_0_0_rgba(5,150,105,0.7)] dark:border-l-emerald-300',
                    model.id === activeModelId && 'bg-[var(--c-ink)]/5',
                    'focus-visible:bg-[var(--c-ink)]/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--c-ink)]',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-base font-bold leading-tight text-[var(--c-heading)]">{getChatModelDisplayName(model, modelStatus.local)}</span>
                    <span className="block break-words text-sm leading-snug text-[var(--c-ink)]/60">{PROVIDER_LABELS[model.provider]} · {model.quality}</span>
                    {modelHasIssues ? <span className="block text-sm font-bold leading-snug text-rose-700 dark:text-rose-300">Facing issues</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1" aria-label={model.capabilities.map((capability) => CAPABILITY_DETAILS[capability].label).join(', ')}>
                    {model.capabilities.map((capability) => {
                      const { Icon, label, badgeClassName } = CAPABILITY_DETAILS[capability];
                      return (
                        <span key={capability} className="group relative inline-flex">
                          <span title={label} className={cn('inline-flex h-6 w-6 items-center justify-center rounded-sm border', badgeClassName)}>
                            <Icon size={13} aria-hidden />
                            <span className="sr-only">{label}</span>
                          </span>
                          <span
                            role="tooltip"
                            className="pointer-events-none absolute left-1/2 top-full z-40 mt-1 w-max max-w-28 -translate-x-1/2 border border-[var(--c-ink)]/30 bg-[var(--c-paper)] px-1.5 py-1 text-center font-hand text-[11px] font-bold leading-tight text-[var(--c-ink)] opacity-0 shadow-[1px_2px_4px_rgba(0,0,0,0.18)] transition-opacity group-hover:opacity-100"
                          >
                            {label}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                  {model.id === value ? <Check className="shrink-0 text-emerald-700 dark:text-emerald-300" size={18} aria-label="Selected" /> : null}
                  {modelIsHealthyLocal ? <LocalModelHealthDot /> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}