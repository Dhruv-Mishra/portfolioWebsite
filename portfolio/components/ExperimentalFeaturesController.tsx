"use client";

import { useEffect, useRef } from 'react';
import { setSitePref, useSitePrefs } from '@/hooks/useSitePrefs';
import {
  readExperimentalFeaturesHistoryState,
  reconcileExperimentalFeatures,
} from '@/lib/experimentalFeatures';

export default function ExperimentalFeaturesController(): null {
  const { experimentalFeatures } = useSitePrefs();
  const returnRecoveryHandled = useRef(false);

  useEffect(() => {
    const result = reconcileExperimentalFeatures({
      enabled: experimentalFeatures,
      location: window.location,
      historyState: readExperimentalFeaturesHistoryState(window.history),
      returnRecoveryHandled: returnRecoveryHandled.current,
      setEnabled: (enabled) => setSitePref('experimentalFeatures', enabled),
      replaceHistory: (state, cleanPath) => {
        window.history.replaceState(state, '', cleanPath);
      },
      navigate: (destination) => window.location.assign(destination),
    });
    if (result === 'return-handoff' || result === 'return-recovery') {
      returnRecoveryHandled.current = true;
    }
  }, [experimentalFeatures]);

  return null;
}