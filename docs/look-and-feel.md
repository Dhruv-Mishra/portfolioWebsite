# Look and feel

Every visual choice below is a site preference under **Settings > Look and feel**. It is stored with the other site prefs (`dhruv-admin-prefs` in localStorage) and mirrored onto `<html data-*>` before first paint, so switching never flashes or re-renders the page.

| Setting | `<html>` attribute | Options (default first) |
|---|---|---|
| Page in light mode | `data-surface` | Drawing paper, Canvas, Graph |
| Page in dark mode | `data-chalkboard` | Blackboard, Greenboard, Slate |
| Notes and cards | `data-notes` | Paper, Cardboard, Sticky |
| Note edges | `data-torn` | Torn, Clean |
| About page | `data-about` | Pin board, On the page |
| Pin board | `data-pinboard` | Cork, Burlap |
| Opening a note | `data-flight` | Pull the pin, Zoom, Fade |
| Doodles and props | `data-decor` | Some, Lots, None |
| Wear and tear | `data-aging` | Lived-in, Well-worn, Brand new |

## Changing a default

`portfolio/lib/lookPrefs.ts` is the single table behind the store, the boot script, the attributes, and the Settings controls. The first option of each list is the default; reorder it to change the default. Add an option there, a label in `LOOK_CHOICES` (`components/SettingsPanel.tsx`), and its CSS.

## Where the styles live

- `app/look.css`: page surfaces, wear, note materials, torn edges, push pins, the doodle layer, and the page-end flourish.
- `components/about/pinboard.css` and `components/about/PinBoard.tsx`: the board, its notes, and the pin-pull flight.
- `components/projects/projects.css`: project cards and the expanded note.
- `components/SketchbookDoodles.tsx`: the doodles, origami, desk props, and chalk drawings, each tagged by theme (`paper`, `board`, `any`), density tier, and whether it fits on phones.
- `lib/flight.ts`: the card-to-sheet flight shared by pinned notes and project cards.

Textures are CC0 files in `portfolio/public/resources/textures/`; see [textures](textures.md). A texture only downloads once a rule that uses it matches, so a choice that is switched off costs nothing. Reduced motion turns every flight into a fade and stops drifting props.
