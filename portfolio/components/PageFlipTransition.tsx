"use client";

import { ViewTransition, type ReactNode } from 'react';
import './page-flip.css';

const PAGE_TURN_MAP = {
  'page-forward': 'sketchbook-turn-forward',
  'page-back': 'sketchbook-turn-back',
  default: 'none',
} as const;

export default function PageFlipTransition({
  children,
  pathname,
}: {
  children: ReactNode;
  pathname: string;
}) {
  return (
    <ViewTransition key={pathname} enter={PAGE_TURN_MAP} exit={PAGE_TURN_MAP} default="none">
      {children}
    </ViewTransition>
  );
}