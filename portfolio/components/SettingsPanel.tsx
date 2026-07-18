"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
  Activity,
  AudioLines,
  Bot,
  Brush,
  GitBranch,
  Image as ImageIcon,
  Mic2,
  Palette,
  Sparkles,
  Sticker,
  TriangleAlert,
  Volume2,
} from 'lucide-react';
import { useSitePrefsApi, type SitePrefKey } from '@/hooks/useSitePrefs';
import {
  setSoundsMutedImperative,
  useDiscoActive,
  useSoundsMuted,
} from '@/hooks/useStickers';
import { useVoiceBackendPref, type VoiceBackendPref } from '@/lib/voiceBackendPref';
import { useVoiceOutputPref, type VoiceOutputPref } from '@/lib/voiceOutputPref';
import { soundManager } from '@/lib/soundManager';
import {
  runThemeSelection,
  type ThemeSelection,
} from '@/lib/themeToggleAction';
import { classifyBuildChannel, type BuildChannelInfo } from '@/lib/buildChannel';
import {
  getExperimentalFeaturesReturnUrl,
  getExperimentalToggleIntent,
} from '@/lib/experimentalFeatures';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { TapeStrip } from '@/components/ui/TapeStrip';
import { ModelPicker } from '@/components/ModelPicker';
import { getChatModel, type ChatModelId } from '@/lib/chatModels';
import {
  CHAT_HISTORY_STORAGE_KEYS,
  clearChatHistoryStorage,
  dispatchChatModelSwitchClear,
  useChatModelPref,
} from '@/lib/chatModelPref';

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;
const getClientHostnameSnapshot = () => window.location.hostname;
const getServerHostnameSnapshot = () => '';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemeSelection; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const MOTION_OPTIONS = [
  { value: 'system', label: 'Follow device' },
  { value: 'reduced', label: 'Reduce motion' },
  { value: 'full', label: 'Always animate' },
] as const;

const VOICE_OPTIONS: ReadonlyArray<{ value: VoiceBackendPref; label: string }> = [
  { value: 'native', label: 'Native' },
  { value: 'whisper', label: 'Whisper' },
];

const VOICE_OUTPUT_OPTIONS: ReadonlyArray<{ value: VoiceOutputPref; label: string }> = [
  { value: 'device', label: 'Device TTS' },
  { value: 'server', label: 'Server custom' },
];

interface SettingsGroupProps {
  title: string;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  children: ReactNode;
}

function SettingsGroup({ title, icon: Icon, children }: SettingsGroupProps) {
  return (
    <fieldset className="border-b-2 border-dashed border-[var(--c-grid)]/30 px-1 py-7 last:border-b-0 md:px-3 md:py-8">
      <legend className="flex items-center gap-2 px-1 font-hand text-xl font-bold text-[var(--c-heading)] md:text-2xl">
        <Icon size={21} aria-hidden />
        {title}
      </legend>
      <div className="mt-4 space-y-3">{children}</div>
    </fieldset>
  );
}

interface SegmentedChoiceProps<T extends string> {
  name: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

function SegmentedChoice<T extends string>({
  name,
  value,
  options,
  onChange,
}: SegmentedChoiceProps<T>) {
  return (
    <div className="grid auto-cols-fr grid-flow-col overflow-hidden rounded-md border-2 border-[var(--c-ink)]/25 bg-[var(--c-paper)]/55">
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            'relative flex min-h-11 cursor-pointer items-center justify-center border-r border-[var(--c-ink)]/20 px-3 py-2 text-center font-hand text-base last:border-r-0 md:text-lg',
            value === option.value
              ? 'bg-[var(--c-heading)] text-[var(--c-paper)]'
              : 'text-[var(--c-ink)] hover:bg-[var(--c-ink)]/5',
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onClick={() => onChange(option.value)}
            onChange={() => undefined}
            className="peer sr-only"
          />
          <span className="absolute inset-1 rounded-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-amber-500" />
          <span className="relative">{option.label}</span>
        </label>
      ))}
    </div>
  );
}

interface SettingToggleProps {
  label: string;
  detail?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

function SettingToggle({
  label,
  detail,
  checked,
  disabled = false,
  onChange,
}: SettingToggleProps) {
  return (
    <label
      className={cn(
        'flex min-h-11 items-center justify-between gap-4 py-1 font-hand',
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-base leading-tight text-[var(--c-heading)] md:text-lg">
          {label}
        </span>
        {detail ? (
          <span className="mt-0.5 block text-sm leading-snug text-[var(--c-ink)]/55">
            {detail}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full border-2 border-dashed transition-colors',
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber-500',
          checked
            ? 'border-emerald-700/70 bg-emerald-500/35 dark:border-emerald-300/70'
            : 'border-[var(--c-ink)]/35 bg-[var(--c-paper)]',
        )}
      >
        <span
          className={cn(
            'absolute top-[3px] h-4 w-4 rounded-full bg-[var(--c-ink)] shadow-sm transition-transform',
            checked ? 'translate-x-[25px]' : 'translate-x-[3px]',
          )}
        />
      </span>
    </label>
  );
}

function BuildChannelStatus({
  info,
  destinationUrl,
}: {
  info: BuildChannelInfo | null;
  destinationUrl: string | null;
}) {
  if (!info) {
    return <p className="flex min-h-11 items-center font-hand text-base text-[var(--c-ink)]/55">Checking build...</p>;
  }

  const label = {
    production: 'Production',
    staging: 'Staging',
    local: 'Local build',
    unknown: 'Unrecognized build',
  }[info.channel];

  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 font-hand">
      <p className="text-base text-[var(--c-heading)] md:text-lg">
        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden />
        {label}
      </p>
      {destinationUrl ? (
        <a
          href={destinationUrl}
          className="inline-flex min-h-11 items-center rounded-sm px-2 text-base font-bold text-blue-700 underline decoration-dotted underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:text-blue-300"
        >
          {info.channel === 'production' ? 'Open staging' : 'Return to production'}
        </a>
      ) : null}
    </div>
  );
}

export default function SettingsPanel() {
  const [experimentalDialogOpen, setExperimentalDialogOpen] = useState(false);
  const [pendingModelId, setPendingModelId] = useState<ChatModelId | null>(null);
  const [redirectPending, setRedirectPending] = useState(false);
  const modelCancelRef = useRef<HTMLButtonElement>(null);
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const { theme, setTheme } = useTheme();
  const discoActive = useDiscoActive();
  const soundsMuted = useSoundsMuted();
  const { prefs, setPref } = useSitePrefsApi();
  const { pref: voiceBackend, setPref: setVoiceBackend } = useVoiceBackendPref();
  const { pref: voiceOutput, setPref: setVoiceOutput } = useVoiceOutputPref();
  const { modelId, setModelId } = useChatModelPref();
  const hostname = useSyncExternalStore(
    subscribeToHydration,
    getClientHostnameSnapshot,
    getServerHostnameSnapshot,
  );
  const buildInfo = mounted ? classifyBuildChannel(hostname) : null;
  const buildDestinationUrl = mounted && buildInfo?.channel === 'staging'
    ? getExperimentalFeaturesReturnUrl(window.location)
    : buildInfo?.destinationUrl ?? null;

  const setBooleanPref = (key: SitePrefKey, checked: boolean) => {
    if (key === 'motionPreference') return;
    setPref(key, checked);
  };

  const selectedTheme: ThemeSelection = mounted
    && (theme === 'light' || theme === 'dark' || theme === 'system')
    ? theme
    : 'system';
  const selectedModel = getChatModel(modelId);

  useEffect(() => {
    if (pendingModelId) modelCancelRef.current?.focus();
  }, [pendingModelId]);

  const applyModelSwitch = (nextModelId: ChatModelId) => {
    clearChatHistoryStorage();
    dispatchChatModelSwitchClear();
    setModelId(nextModelId);
    setPendingModelId(null);
  };

  const handleModelChange = (nextModelId: ChatModelId) => {
    if (nextModelId === modelId) return;
    if (hasPersistedChatMessages()) {
      setPendingModelId(nextModelId);
      return;
    }
    applyModelSwitch(nextModelId);
  };

  const handleExperimentalChange = (nextEnabled: boolean) => {
    const intent = getExperimentalToggleIntent(prefs.experimentalFeatures, nextEnabled);
    if (intent === 'confirm-enable') {
      setExperimentalDialogOpen(true);
    } else if (intent === 'disable') {
      setPref('experimentalFeatures', false);
    }
  };

  const confirmExperimentalFeatures = () => {
    setRedirectPending(buildInfo?.channel === 'production');
    setPref('experimentalFeatures', true);
    setExperimentalDialogOpen(false);
  };

  return (
    <div className="relative mx-auto w-full max-w-3xl px-4 pb-20 pt-14 md:px-8 md:pt-12">
      <div className="pointer-events-none absolute left-2 top-10 h-24 w-1 -rotate-2 bg-rose-400/55 md:left-5" aria-hidden />
      <header className="relative px-1 text-center">
        <TapeStrip size="sm" className="-top-5 rotate-2 opacity-75 md:-top-6" />
        <p className="font-code text-[10px] uppercase text-[var(--c-ink)]/45">site preferences</p>
        <h1 className="mt-1 font-hand text-4xl font-bold text-[var(--c-heading)] md:text-6xl">
          Settings
        </h1>
        <div className="mx-auto mt-2 h-1 w-36 -rotate-1 rounded-full bg-amber-400/70" aria-hidden />
      </header>

      {!mounted ? (
        <p className="sr-only" role="status" aria-live="polite">
          Loading saved settings...
        </p>
      ) : null}
      <div
        className={cn(
          'mt-8 border-y-2 border-dashed border-[var(--c-grid)]/45',
          !mounted && 'invisible',
        )}
        aria-busy={!mounted}
        aria-hidden={!mounted || undefined}
        inert={!mounted || undefined}
      >
        <SettingsGroup title="Theme" icon={Palette}>
          <SegmentedChoice
            name="theme"
            value={selectedTheme}
            options={THEME_OPTIONS}
            onChange={(nextTheme) => runThemeSelection({
              discoActive,
              theme: nextTheme,
              setTheme,
            })}
          />
        </SettingsGroup>

        <SettingsGroup title="AI model" icon={Bot}>
          <label className="block font-hand text-base text-[var(--c-heading)] md:text-lg" htmlFor="chat-model">
            Conversation model
          </label>
          <ModelPicker
            id="chat-model"
            value={modelId}
            onValueChange={handleModelChange}
          />
          {selectedModel ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-[var(--c-ink)]/20 pt-3 font-hand text-sm text-[var(--c-ink)]/75 md:text-base">
              <span>{selectedModel.provider === 'groq' ? 'Groq' : 'NVIDIA'}</span>
              <span className="inline-flex items-center gap-1 rounded-sm border border-[var(--c-ink)]/20 px-2 py-0.5">
                <ImageIcon size={14} aria-hidden />
                {selectedModel.supportsImages ? 'Vision' : 'Text'}
              </span>
              <span className="rounded-sm border border-[var(--c-ink)]/20 px-2 py-0.5">{selectedModel.quality}</span>
              {'isRecommended' in selectedModel && selectedModel.isRecommended ? (
                <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300">
                  <Sparkles size={14} aria-hidden /> Recommended
                </span>
              ) : null}
              {'caveat' in selectedModel && selectedModel.caveat ? <span className="basis-full text-sm text-rose-700 dark:text-rose-300">{selectedModel.caveat}</span> : null}
            </div>
          ) : null}
        </SettingsGroup>

        <SettingsGroup title="Sound and touch" icon={AudioLines}>
          <SettingToggle
            label="Sound effects"
            checked={!soundsMuted}
            onChange={(enabled) => {
              const muted = !enabled;
              setSoundsMutedImperative(muted);
              soundManager.setMuted(muted);
              if (enabled) soundManager.play('button-click');
            }}
          />
          <SettingToggle
            label="Haptics"
            checked={prefs.hapticsEnabled}
            onChange={(checked) => setBooleanPref('hapticsEnabled', checked)}
          />
        </SettingsGroup>

        <SettingsGroup title="Motion" icon={Activity}>
          <SegmentedChoice
            name="motion"
            value={prefs.motionPreference}
            options={MOTION_OPTIONS}
            onChange={(motionPreference) => setPref('motionPreference', motionPreference)}
          />
          <p className="font-hand text-sm text-[var(--c-ink)]/55">
            Always animate overrides your device&apos;s reduced-motion preference.
          </p>
          <SettingToggle
            label="Enhance Immersion"
            detail="Use page turns between pages."
            checked={prefs.enhanceImmersion}
            onChange={(checked) => setBooleanPref('enhanceImmersion', checked)}
          />
        </SettingsGroup>

        <SettingsGroup title="Stickers" icon={Sticker}>
          <SettingToggle
            label="Earn stickers"
            checked={prefs.stickersEnabled}
            onChange={(checked) => setBooleanPref('stickersEnabled', checked)}
          />
          <SettingToggle
            label="Sticker toasts"
            checked={prefs.stickerToastsEnabled}
            disabled={!prefs.stickersEnabled}
            onChange={(checked) => setBooleanPref('stickerToastsEnabled', checked)}
          />
        </SettingsGroup>

        <SettingsGroup title="Voice input" icon={Mic2}>
          <SegmentedChoice
            name="voice-backend"
            value={voiceBackend}
            options={VOICE_OPTIONS}
            onChange={setVoiceBackend}
          />
          <p className="font-hand text-sm text-[var(--c-ink)]/55">
            Whisper downloads about 60-170 MB on first use, depending on your browser.
          </p>
        </SettingsGroup>

        <SettingsGroup title="Voice output" icon={Volume2}>
          <SegmentedChoice
            name="voice-output"
            value={voiceOutput}
            options={VOICE_OUTPUT_OPTIONS}
            onChange={setVoiceOutput}
          />
        </SettingsGroup>

        <SettingsGroup title="Appearance" icon={Brush}>
          <SettingToggle
            label="Paper grain"
            checked={prefs.paperGrain}
            onChange={(checked) => setBooleanPref('paperGrain', checked)}
          />
          <SettingToggle
            label="Tape"
            checked={prefs.tapeEffects}
            onChange={(checked) => setBooleanPref('tapeEffects', checked)}
          />
          <SettingToggle
            label="Sketch outlines"
            checked={prefs.sketchOutlines}
            onChange={(checked) => setBooleanPref('sketchOutlines', checked)}
          />
        </SettingsGroup>

        <SettingsGroup title="Experiments" icon={TriangleAlert}>
          <SettingToggle
            label="Enable experimental features"
            detail={redirectPending ? 'Opening the staging build...' : 'Try preview features on the staging build.'}
            checked={prefs.experimentalFeatures}
            disabled={redirectPending}
            onChange={handleExperimentalChange}
          />
        </SettingsGroup>

        <SettingsGroup title="Build channel" icon={GitBranch}>
          <BuildChannelStatus info={buildInfo} destinationUrl={buildDestinationUrl} />
        </SettingsGroup>
      </div>

      <nav className="mt-8 flex justify-center" aria-label="Settings navigation">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center px-3 font-hand text-lg font-bold text-[var(--c-heading)] underline decoration-wavy decoration-rose-400 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
        >
          Back to the sketchbook
        </Link>
      </nav>
      <Modal
        isOpen={pendingModelId !== null}
        onClose={() => setPendingModelId(null)}
        ariaLabelledBy="chat-model-switch-title"
        ariaDescribedBy="chat-model-switch-description"
        className="mt-[var(--c-modal-top)] w-[calc(100%-1.5rem)] max-w-lg border-2 border-dashed border-amber-700/55 bg-[var(--c-paper)] p-6 shadow-xl md:p-8 dark:border-amber-300/55"
        backdropClassName="bg-black/35 dark:bg-black/60"
      >
        <h2 id="chat-model-switch-title" className="font-hand text-2xl font-bold text-[var(--c-heading)] md:text-3xl">
          Switch conversation model?
        </h2>
        <p id="chat-model-switch-description" className="mt-3 font-hand text-base leading-relaxed text-[var(--c-ink)]/75 md:text-lg">
          Chat context and history are model-specific. Switching clears this conversation from this device.
        </p>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={modelCancelRef}
            type="button"
            onClick={() => setPendingModelId(null)}
            className="min-h-11 rounded-sm border-2 border-dashed border-[var(--c-ink)]/35 px-5 py-2 font-hand text-base font-bold text-[var(--c-heading)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => pendingModelId && applyModelSwitch(pendingModelId)}
            className="min-h-11 rounded-sm border-2 border-amber-800/65 bg-amber-400/35 px-5 py-2 font-hand text-base font-bold text-[var(--c-heading)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-amber-200/65 dark:bg-amber-300/20"
          >
            Switch and clear chat
          </button>
        </div>
      </Modal>
      <Modal
        isOpen={experimentalDialogOpen}
        onClose={() => setExperimentalDialogOpen(false)}
        ariaLabelledBy="experimental-features-title"
        ariaDescribedBy="experimental-features-description"
        className="mt-[var(--c-modal-top)] w-[calc(100%-1.5rem)] max-w-lg border-2 border-dashed border-amber-700/55 bg-[var(--c-paper)] p-6 shadow-xl md:p-8 dark:border-amber-300/55"
        backdropClassName="bg-black/35 dark:bg-black/60"
      >
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-1 shrink-0 text-amber-700 dark:text-amber-300" size={26} aria-hidden />
          <div className="min-w-0">
            <h2 id="experimental-features-title" className="font-hand text-2xl font-bold text-[var(--c-heading)] md:text-3xl">
              Open the staging sketchbook?
            </h2>
            <p id="experimental-features-description" className="mt-3 font-hand text-base leading-relaxed text-[var(--c-ink)]/75 md:text-lg">
              Staging can be unstable and may use preview data or features. Enabling this setting saves your choice and opens the same page on staging.
            </p>
          </div>
        </div>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setExperimentalDialogOpen(false)}
            className="min-h-11 rounded-sm border-2 border-dashed border-[var(--c-ink)]/35 px-5 py-2 font-hand text-base font-bold text-[var(--c-heading)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmExperimentalFeatures}
            className="min-h-11 rounded-sm border-2 border-amber-800/65 bg-amber-400/35 px-5 py-2 font-hand text-base font-bold text-[var(--c-heading)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-amber-200/65 dark:bg-amber-300/20"
          >
            Enable and open staging
          </button>
        </div>
      </Modal>
    </div>
  );
}

function hasPersistedChatMessages(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEYS[0]);
    if (!stored) return false;
    const messages = JSON.parse(stored) as Array<{ id?: unknown; content?: unknown }>;
    return Array.isArray(messages) && messages.some((message) => (
      message.id !== 'welcome' && typeof message.content === 'string' && message.content.trim().length > 0
    ));
  } catch {
    return false;
  }
}