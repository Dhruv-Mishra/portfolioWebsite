# Agent Guide

Scope: React UI components.

## Component Rules

- Components are PascalCase functional components.
- Add `"use client"` only when a component needs hooks, event handlers, browser APIs, or client-only libraries.
- Use `cn()` for conditional class names and existing Tailwind/CSS variable patterns for styling.
- Keep accessibility intact: semantic controls, keyboard behavior, visible focus states, labels, and reduced-motion-safe animation choices.

## Design Rules

- Preserve the sketchbook aesthetic without exposing hidden interactions in visible helper text.
- Support light and dark themes for new UI.
- Check mobile layouts for text wrapping, touch targets, and `100dvh` behavior.

## Validation

- Run `rtk lint` for component changes.
- Add or update tests only when behavior is shared, stateful, or likely to regress.