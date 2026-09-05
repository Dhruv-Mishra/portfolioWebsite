# Low-Risk Improvement Spec

Date: 2026-09-05
Status: Reviewed and implemented with user authorization. Local checks passed;
remote CI cancellation and branch-protection verification remain pending.

## Goal And Constraints

Remove demonstrably unnecessary work without changing the site's appearance,
features, responsiveness, accessibility, or deployment safety. No optimization is
literally risk-free; the targets below have explicit checks and no intended user
tradeoff. Avoid speculative rewrites and unnecessary new tests.

Preserve the sketchbook design, hidden discovery features, light/dark themes,
mobile behavior, reduced-motion preferences, voice activation, and useful prefetch.
Do not remove CI gates, runtime facts/embeddings, or change deployment workflows.

## 1. Avoid Loading An Inactive Cursor On Touchscreens

Priority: First. Impact: Small, direct reduction in client work on wide touch devices.

Evidence:

- [DeferredEnhancements.tsx](portfolio/components/DeferredEnhancements.tsx#L78)
  decides whether to load the dynamic cursor using only the desktop breakpoint.
- [SketchbookCursor.tsx](portfolio/components/SketchbookCursor.tsx#L40)
  subsequently refuses to initialize unless `(hover: hover) and (pointer: fine)`
  matches. Wide coarse-pointer devices therefore import and mount an inactive
  component.

Proposed change:

- Require both the existing minimum width and the cursor's existing hover/fine
  pointer condition before rendering its dynamic import.
- Keep the media-query change subscription so resizing and capability changes
  update eligibility. Preserve the cursor's internal reduced-motion checks and
  native-cursor fallback. Do not change the other deferred components.

Expected benefit: Avoid the cursor module's loading, evaluation, and inactive DOM
on ineligible devices. Source-file size is not shipped bundle size; byte and memory
savings must be measured from a production build rather than guessed. This is an
idle-loading improvement, not a promised first-paint improvement.

Acceptance:

- In a wide coarse-pointer browser, no cursor-specific chunk is requested solely
  by this loader and no custom cursor markup mounts, including after idle stages.
- On a desktop fine-pointer browser, the cursor still activates at the same stage
  and works in both themes. Narrow screens retain current behavior.
- Capability/viewport transitions and reduced-motion behavior remain correct;
  verify a hybrid-pointer scenario rather than relying on width alone.
- Reuse [desktopContextMenu.contract.test.ts](portfolio/lib/__tests__/desktopContextMenu.contract.test.ts)
  for existing cursor safeguards. It does not currently cover the deferred
  loader's eligibility, so extend that nearby coverage with only a focused
  regression assertion if needed; no new test harness.
- Run app lint, the required Vitest suite for the eligibility logic change, and
  an embedding-skipped production build using the documented repository commands.

## 2. Cancel Superseded CI Runs

Priority: Second. Impact: Avoidable runner usage during successive commits.

Evidence:

- [ci.yml](.github/workflows/ci.yml#L3) runs on pull requests and `dev/lkg` pushes.
- [ci.yml](.github/workflows/ci.yml#L11) defines four independent jobs with no
  workflow-level concurrency policy; an obsolete run can keep installing,
  linting, typechecking, testing, and building after a newer commit arrives.

Proposed change:

- Add workflow-level concurrency with cancellation of superseded runs.
- Group by workflow, event type, and PR number or branch ref. Keep PR and push
  runs distinct so one event cannot cancel a differently triggered required run.
- Preserve all four jobs, job/check names, pinned actions, install validation,
  cache policy, and build lifecycle. Do not touch deployment concurrency.

Expected benefit: Save the remaining runner work of superseded runs. No speedup
is claimed for an isolated run; savings depend on commit cadence and cancellation
timing.

Acceptance And Caveat:

- Validate workflow syntax and confirm all existing jobs and commands remain.
- Confirm branch protection expects results for the latest revision. Older
  revisions will intentionally have cancelled, not completed, checks.
- After an authorized push, two successive revisions on the same PR should
  cancel only the older CI run; the latest must finish all four checks.
- Different PRs/branches and PR-versus-push runs must not cancel each other.
- Do not generate remote commits or run deployments just to validate this spec.

## Not Targeted

- Arbitrary lazy loading or prefetch removal: possible first-interaction latency
  regressions, with no demonstrated net benefit.
- Preference bootstrap consolidation: the pre-paint bootstrap prevents visual
  flashes; avoiding a few repeated attribute writes has insufficient measured
  value for this pass.
- Sharing the six dependency-install blocks: potential maintenance cleanup, but
  no demonstrated runtime saving and a wider CI/deployment change than warranted.
- Dependency removal based on package size alone: installed size is not initial
  browser payload, and dynamically loaded voice/discovery features must stay.
- Merging CI jobs, skipping deploy checks, cross-environment cache sharing, or
  removing embedding generation: meaningful correctness or operational tradeoffs.

## Evidence And Validation Scope

Source review covered startup enhancement loading and its immediate controllers,
CI/install repetition, and build/deployment configuration. This was a quick pass,
not an exhaustive audit of routes, accessibility, API latency, or memory retention.

Live observations on https://whoisdhruv.com:

| Check | Observation |
| --- | --- |
| Home, desktop 1440x1000 | LCP 347 ms; TTFB 157 ms; CLS 0.00 |
| Home trace suggestions | Render-blocking and cache insights each estimated 0 ms paint savings |
| Home accessibility snapshot | Named navigation/controls and skip link present |
| About, light theme, 390x844 touch | Document width 390 px; no broken loaded images; no obvious overlap in viewport screenshot |

The desktop trace was a single unthrottled reload with cache reuse, not a cold
mobile benchmark or field measurement. No INP or meaningful memory baseline was
collected. An initial trace captured `about:blank` and was discarded. These results
do not justify broad first-paint work or a numerical improvement promise.

Production displays v0.48.0, while this checkout's
[package.json](portfolio/package.json#L3) declares v0.47.0. Treat live observations
as a separate production baseline, not proof that the reviewed checkout has
identical deployed code. Verify proposed fixes against this checkout before
comparing deployment measurements.

## Implementation And Validation

Implemented both targets on 2026-09-05. The cursor loader now combines its existing
width breakpoint with the cursor's existing primary hover/fine-pointer condition,
retaining the change subscription and idle stages. One regression case was added
to the existing cursor contract test. CI now cancels superseded runs using a key
containing workflow, event type, and PR number or branch ref.

- App lint passed; all 1,016 Vitest tests passed, including all six cursor/menu
  contract cases. The embedding-skipped production build passed, including
  TypeScript and the prebuild/postbuild lifecycle.
- Production Chromium checks waited for the stage-three prefetch chunk. At
  1440x1000 with a coarse pointer, the fixed loader requested no cursor chunk and
  mounted no cursor markup. A browser-only control restoring the former width-only
  condition requested one cursor chunk and mounted inactive markup. This control
  used the same build with the loader response intercepted, not a separate old
  production build. No byte, memory, or first-paint improvement is claimed.
- Narrow touch at 390x844 also requested no cursor chunk or markup. Desktop light
  and dark checks confirmed pointer tracking and the correct pencil/chalk artwork.
  Screenshots were inspected; checked viewports had no document overflow.
- Resizing across 767/768px removed and restored the cursor. With the existing
  `system` motion preference, OS reduced-motion changes removed the cursor and
  restored the native cursor; reversing the preference restored the custom cursor.
  The existing default `full` preference still overrides OS reduced motion.
- A hybrid simulation kept the viewport at 1440px and simulated simultaneous
  touch/mouse availability while Chromium's native primary pointer changed from
  coarse to fine and back. The cursor loaded only for the fine/hover primary
  pointer and unmounted when it became coarse. Physical hybrid hardware was not
  tested.
- CI YAML parsed successfully. A structured comparison confirmed that every
  existing job, command, action pin, cache setting, trigger, and permission remained
  unchanged. Grouping checks confirmed revision sharing and separation across
  PRs, branches, event types, and workflows.

No commits, pushes, deployments, or branch-protection changes were made. Verify
branch protection and actual older-run cancellation on the next authorized PR
push; local checks cannot establish remote policy or runner behavior.