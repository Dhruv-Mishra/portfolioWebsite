"use client";

import { useEffect, useSyncExternalStore } from 'react';
import { isChatModelId, type ChatModel, type ChatModelId } from '@/lib/chatModels';

export const CHAT_MODEL_STATUS_TTL_MS = 30_000;
const MAX_LOCAL_MODEL_NAME_LENGTH = 128;

export interface LocalModelStatus {
  healthy: boolean;
  modelName: string;
}

export interface ChatModelStatusSnapshot {
  local: LocalModelStatus | null;
  configuredUnavailableModelIds: readonly ChatModelId[];
  deploymentCanaryModelIds: readonly ChatModelId[];
  advisoryIssueModelIds: readonly ChatModelId[];
  issueModelIds: readonly ChatModelId[];
}

const EMPTY_CHAT_MODEL_STATUS: ChatModelStatusSnapshot = {
  local: null,
  configuredUnavailableModelIds: [],
  deploymentCanaryModelIds: [],
  advisoryIssueModelIds: [],
  issueModelIds: [],
};

type StatusRecord = Record<string, unknown>;

let snapshot = EMPTY_CHAT_MODEL_STATUS;
let fetchedAt = 0;
let inFlightRequest: Promise<ChatModelStatusSnapshot> | null = null;
const listeners = new Set<() => void>();

function isRecord(value: unknown): value is StatusRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseModelId(value: unknown): ChatModelId | null {
  return typeof value === 'string' && isChatModelId(value) ? value : null;
}

function parseModelIdList(value: unknown): ChatModelId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(parseModelId).filter((modelId): modelId is ChatModelId => modelId !== null))];
}

function parseLocalModelStatus(value: unknown): LocalModelStatus | null {
  if (!isRecord(value) || typeof value.healthy !== 'boolean' || typeof value.modelName !== 'string') return null;

  const modelName = value.modelName.trim();
  if (modelName.length === 0 || modelName.length > MAX_LOCAL_MODEL_NAME_LENGTH) return null;

  return { healthy: value.healthy, modelName };
}

function isConfiguredUnavailable(value: unknown): boolean {
  if (value === false) return true;
  if (!isRecord(value)) return false;

  return value.available === false || value.configured === false || value.status === 'unavailable';
}

function parseConfiguredUnavailableModelIds(value: unknown): ChatModelId[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (!isRecord(entry) || !isConfiguredUnavailable(entry)) return [];
      const modelId = parseModelId(entry.id);
      return modelId ? [modelId] : [];
    });
  }

  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([id, status]) => {
    const modelId = parseModelId(id);
    return modelId && isConfiguredUnavailable(status) ? [modelId] : [];
  });
}

function isFreshAdvisoryExpiry(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  const expiresAt = Date.parse(value);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function parseAdvisoryIssueModelIds(value: unknown): ChatModelId[] {
  if (!isRecord(value) || !isFreshAdvisoryExpiry(value.expiresAt) || !Array.isArray(value.models)) {
    return [];
  }

  return [...new Set(value.models.flatMap((entry) => {
    if (!isRecord(entry) || (entry.state !== 'degraded' && entry.state !== 'unhealthy')) return [];
    const modelId = parseModelId(entry.id);
    return modelId ? [modelId] : [];
  }))];
}

export function parseChatModelStatusPayload(value: unknown): Omit<ChatModelStatusSnapshot, 'issueModelIds'> | null {
  if (!isRecord(value)) return null;

  const local = parseLocalModelStatus(value.localModelStatus ?? value.local ?? value.localAgent ?? value);
  const models = parseConfiguredUnavailableModelIds(value.models);
  const deploymentCanaryModelIds = parseModelIdList(value.deploymentCanaryModelIds);
  const advisoryIssueModelIds = parseAdvisoryIssueModelIds(value.advisoryHealth);

  if (!local && !Array.isArray(value.models) && !isRecord(value.models)) return null;

  return {
    local,
    configuredUnavailableModelIds: models,
    deploymentCanaryModelIds,
    advisoryIssueModelIds,
  };
}

function emitChange() {
  for (const listener of listeners) listener();
}

function updateSnapshot(next: ChatModelStatusSnapshot) {
  snapshot = next;
  emitChange();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ChatModelStatusSnapshot {
  return snapshot;
}

function getServerSnapshot(): ChatModelStatusSnapshot {
  return EMPTY_CHAT_MODEL_STATUS;
}

export function refreshChatModelStatus(options?: { force?: boolean }): Promise<ChatModelStatusSnapshot> {
  if (!options?.force && Date.now() - fetchedAt < CHAT_MODEL_STATUS_TTL_MS) return Promise.resolve(snapshot);
  if (inFlightRequest) return inFlightRequest;

  const statusUrl = options?.force ? '/api/chat/model-status?fresh=1' : '/api/chat/model-status';
  inFlightRequest = fetch(statusUrl)
    .then(async (response) => {
      if (!response.ok) return null;
      return parseChatModelStatusPayload(await response.json());
    })
    .then((nextStatus) => {
      if (!nextStatus) return snapshot;

      fetchedAt = Date.now();
      const nextSnapshot: ChatModelStatusSnapshot = {
        ...nextStatus,
        issueModelIds: snapshot.issueModelIds,
      };
      updateSnapshot(nextSnapshot);
      return nextSnapshot;
    })
    .catch(() => snapshot)
    .finally(() => {
      inFlightRequest = null;
    });

  return inFlightRequest;
}

export function markChatModelFacingIssues(modelId: ChatModelId): void {
  if (snapshot.issueModelIds.includes(modelId)) return;

  updateSnapshot({
    ...snapshot,
    issueModelIds: [...snapshot.issueModelIds, modelId],
  });
}

export function isChatModelFacingIssues(modelId: ChatModelId, status: ChatModelStatusSnapshot): boolean {
  return status.configuredUnavailableModelIds.includes(modelId)
    || status.advisoryIssueModelIds.includes(modelId)
    || status.issueModelIds.includes(modelId);
}

export function getChatModelDisplayName(
  model: ChatModel | undefined,
  localStatus: LocalModelStatus | null | undefined,
): string {
  if (!model) return '';
  return model.provider === 'local' && localStatus?.healthy ? localStatus.modelName : model.label;
}

export function useChatModelStatus(): ChatModelStatusSnapshot {
  const status = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    void refreshChatModelStatus();
  }, []);

  return status;
}