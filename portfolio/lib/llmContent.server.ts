// lib/llmContent.server.ts — Build-time markdown bundles for LLM/AI crawlers.
//
// Implements the de-facto /llms.txt convention (https://llmstxt.org) plus
// per-page `.md` mirrors so that crawlers, agents, and search-augmented LLMs
// (ChatGPT search, Perplexity, Claude web, Google AI Overviews, etc.) can
// ingest the portfolio's substance without parsing JS-hydrated HTML.
//
// All exports are pure: they read `content/facts/**` from disk via the
// existing fact loader. Consumers MUST be `force-static` route handlers so
// the strings bake into the standalone build at compile time and downstream
// edges (nginx proxy_cache + Cloudflare) cache the response indefinitely
// per URL — no Accept-header content negotiation, so no Vary cache pitfalls.

import 'server-only';
import path from 'node:path';

import { loadFacts } from '@/lib/factLoader';
import type { Fact, FactCategory } from '@/lib/factTypes';
import { experienceTimelineEntries } from '@/lib/experienceTimeline';
import { SITE, PERSONAL_LINKS, PROJECT_LINKS } from '@/lib/links';

const FACTS_DIR = path.resolve(process.cwd(), 'content', 'facts');

let cachedFacts: readonly Fact[] | null = null;

function getFacts(): readonly Fact[] {
  if (!cachedFacts) cachedFacts = loadFacts(FACTS_DIR);
  return cachedFacts;
}

function factsByCategory(category: FactCategory): readonly Fact[] {
  return getFacts()
    .filter((f) => f.category === category)
    .slice()
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

function joinFactBodies(facts: readonly Fact[]): string {
  return facts.map((f) => f.text.trim()).join('\n\n');
}

function buildExperienceTimelineMarkdown(): string {
  return experienceTimelineEntries.map((entry) => {
    const lines: string[] = [
      `### ${entry.title} — ${entry.organization}`,
      ``,
      `- Category: ${entry.category}`,
      `- Dates: ${entry.dateLabel}`,
      `- Location: ${entry.location}`,
      `- Summary: ${entry.summary}`,
      `- Impact: ${entry.impact}`,
      `- Tools: ${entry.tools.join(', ')}`,
      ``,
      `Highlights:`,
      ...entry.highlights.map((highlight) => `- ${highlight}`),
    ];

    return lines.join('\n');
  }).join('\n\n');
}

const SUMMARY = `Dhruv Mishra — Software Engineer at Microsoft (M365 Shell). CS & Applied Math, IIIT Delhi. Codeforces Expert. Builds high-performance, production-grade systems across Android, distributed services, and developer tooling.`;

/**
 * /llms.txt — curated index per llmstxt.org spec. Lists the canonical .md
 * surfaces in priority order. Kept short so it fits comfortably in any LLM
 * context window.
 */
export function buildLlmsTxt(): string {
  const url = SITE.url;
  return [
    `# ${SITE.name}`,
    ``,
    `> ${SUMMARY}`,
    ``,
    `This file follows the llms.txt convention (https://llmstxt.org). Each link below is a clean-markdown mirror of a page on this site, intended for ingestion by AI agents, search crawlers, and retrieval-augmented LLMs.`,
    ``,
    `## Primary`,
    ``,
    `- [About Dhruv](${url}/about.md): Background, role at Microsoft, education, and what he works on.`,
    `- [Resume](${url}/resume.md): Work history, achievements, skills, and education in markdown.`,
    `- [Projects](${url}/projects.md): Engineering and research projects with stack, scope, and outcomes.`,
    `- [Site overview](${url}/index.md): One-page summary of who Dhruv is and what this site contains.`,
    ``,
    `## Full corpus`,
    ``,
    `- [Full markdown corpus](${url}/llms-full.txt): Every fact from the site concatenated into one document for single-shot ingestion.`,
    ``,
    `## Links`,
    ``,
    `- [GitHub](${PERSONAL_LINKS.github})`,
    `- [LinkedIn](${PERSONAL_LINKS.linkedin})`,
    `- [Codeforces](${PERSONAL_LINKS.codeforces})`,
    `- [Resume PDF](${url}${PERSONAL_LINKS.resume})`,
    `- [Portfolio source](${PROJECT_LINKS.portfolio})`,
    ``,
    `## Optional`,
    ``,
    `- [Sitemap](${url}/sitemap.xml): Machine-readable URL index of the HTML site.`,
    ``,
  ].join('\n');
}

/**
 * /llms-full.txt — every fact concatenated, grouped by category, with
 * stable headings so an LLM can locate sections by string match.
 */
export function buildLlmsFullTxt(): string {
  const sections: { title: string; category: FactCategory }[] = [
    { title: 'Identity', category: 'core' },
    { title: 'Resume', category: 'resume' },
    { title: 'Projects', category: 'projects' },
    { title: 'Personal', category: 'personal' },
    { title: 'Site', category: 'site' },
  ];

  const parts: string[] = [
    `# ${SITE.name} — Full Markdown Corpus`,
    ``,
    `> ${SUMMARY}`,
    ``,
    `Source: ${SITE.url}. This document concatenates every curated fact from the site for ingestion by AI crawlers and retrieval pipelines. Sections are ordered by relevance for hiring / collaboration evaluation.`,
    ``,
  ];

  for (const { title, category } of sections) {
    const facts = factsByCategory(category);
    if (facts.length === 0) continue;
    parts.push(`## ${title}`, '');
    parts.push(joinFactBodies(facts));
    parts.push('');
  }

  return parts.join('\n');
}

/** /index.md — homepage equivalent. */
export function buildIndexMarkdown(): string {
  const identity = factsByCategory('core');
  return [
    `# ${SITE.name}`,
    ``,
    `> ${SUMMARY}`,
    ``,
    `Site: ${SITE.url}`,
    ``,
    `## About`,
    ``,
    joinFactBodies(identity),
    ``,
    `## Sections`,
    ``,
    `- [About](${SITE.url}/about.md)`,
    `- [Resume](${SITE.url}/resume.md)`,
    `- [Projects](${SITE.url}/projects.md)`,
    `- [Full corpus](${SITE.url}/llms-full.txt)`,
    ``,
    `## Contact`,
    ``,
    `- GitHub: ${PERSONAL_LINKS.github}`,
    `- LinkedIn: ${PERSONAL_LINKS.linkedin}`,
    `- Email: ${PERSONAL_LINKS.email.replace(/^mailto:/, '')}`,
    ``,
  ].join('\n');
}

/** /about.md — identity + headline resume context. */
export function buildAboutMarkdown(): string {
  const identity = factsByCategory('core');
  const resume = factsByCategory('resume');
  return [
    `# About ${SITE.name}`,
    ``,
    `Source: ${SITE.url}/about`,
    ``,
    `## Who`,
    ``,
    joinFactBodies(identity),
    ``,
    `## Current and past work`,
    ``,
    joinFactBodies(resume),
    ``,
    `## Detailed experience timeline`,
    ``,
    buildExperienceTimelineMarkdown(),
    ``,
    `## Links`,
    ``,
    `- GitHub: ${PERSONAL_LINKS.github}`,
    `- LinkedIn: ${PERSONAL_LINKS.linkedin}`,
    `- Codeforces: ${PERSONAL_LINKS.codeforces}`,
    `- Resume PDF: ${SITE.url}${PERSONAL_LINKS.resume}`,
    ``,
  ].join('\n');
}

/** /resume.md — resume facts only. */
export function buildResumeMarkdown(): string {
  const resume = factsByCategory('resume');
  return [
    `# ${SITE.name} — Resume`,
    ``,
    `Source: ${SITE.url}/resume`,
    `Resume PDF: ${SITE.url}${PERSONAL_LINKS.resume}`,
    ``,
    joinFactBodies(resume),
    ``,
  ].join('\n');
}

/** /projects.md — project catalog. */
export function buildProjectsMarkdown(): string {
  const projects = factsByCategory('projects');
  return [
    `# ${SITE.name} — Projects`,
    ``,
    `Source: ${SITE.url}/projects`,
    ``,
    joinFactBodies(projects),
    ``,
  ].join('\n');
}
