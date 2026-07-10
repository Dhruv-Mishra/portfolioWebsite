"use client";

import { useEffect } from 'react';
import { setSitePref, useSitePrefs } from '@/hooks/useSitePrefs';
import {
  getExperimentalFeaturesHandoff,
  redirectToExperimentalFeatures,
} from '@/lib/experimentalFeatures';

export default function ExperimentalFeaturesController(): null {
  const { experimentalFeatures } = useSitePrefs();

  useEffect(() => {
    const cleanPath = getExperimentalFeaturesHandoff(window.location);
    if (cleanPath) {
      setSitePref('experimentalFeatures', true);
      window.history.replaceState(window.history.state, '', cleanPath);
      return;
    }

    redirectToExperimentalFeatures(
      experimentalFeatures,
      window.location,
      (destination) => window.location.assign(destination),
    );
  }, [experimentalFeatures]);

  return null;
}