export interface ComposerHistoryState {
  messages: readonly string[];
  navigationIndex: number | null;
  draft: string | null;
}

export interface ComposerHistoryNavigationResult {
  state: ComposerHistoryState;
  value: string;
  didNavigate: boolean;
}

const MAX_COMPOSER_HISTORY = 5;

export function canNavigateComposerHistory(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  direction: 'up' | 'down',
): boolean {
  if (selectionStart !== selectionEnd) return false;

  return direction === 'up'
    ? !value.slice(0, selectionStart).includes('\n')
    : !value.slice(selectionEnd).includes('\n');
}

export function createComposerHistoryState(): ComposerHistoryState {
  return {
    messages: [],
    navigationIndex: null,
    draft: null,
  };
}

export function appendComposerHistory(
  state: ComposerHistoryState,
  submittedMessage: string,
): ComposerHistoryState {
  return {
    messages: [...state.messages, submittedMessage].slice(-MAX_COMPOSER_HISTORY),
    navigationIndex: null,
    draft: null,
  };
}

export function resetComposerHistoryNavigation(
  state: ComposerHistoryState,
): ComposerHistoryState {
  if (state.navigationIndex === null && state.draft === null) return state;

  return {
    ...state,
    navigationIndex: null,
    draft: null,
  };
}

export function navigateComposerHistory(
  state: ComposerHistoryState,
  currentValue: string,
  direction: 'up' | 'down',
): ComposerHistoryNavigationResult {
  const newestIndex = state.messages.length - 1;

  if (newestIndex < 0) {
    return { state, value: currentValue, didNavigate: false };
  }

  if (direction === 'up') {
    const navigationIndex = state.navigationIndex === null
      ? newestIndex
      : Math.max(0, state.navigationIndex - 1);

    return {
      state: {
        ...state,
        navigationIndex,
        draft: state.navigationIndex === null ? currentValue : state.draft,
      },
      value: state.messages[navigationIndex],
      didNavigate: true,
    };
  }

  if (state.navigationIndex === null) {
    return { state, value: currentValue, didNavigate: false };
  }

  if (state.navigationIndex < newestIndex) {
    const navigationIndex = state.navigationIndex + 1;
    return {
      state: { ...state, navigationIndex },
      value: state.messages[navigationIndex],
      didNavigate: true,
    };
  }

  return {
    state: {
      ...state,
      navigationIndex: null,
      draft: null,
    },
    value: state.draft ?? currentValue,
    didNavigate: true,
  };
}