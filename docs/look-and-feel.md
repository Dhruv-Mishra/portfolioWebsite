# Look and feel

Every visual choice below is a site preference in the **Settings > Customization** drawer, next to the paper stock (the four colour sheets), paper grain, tape, sketch outlines, page flip and motion. They are stored with the other site prefs (`dhruv-admin-prefs` in localStorage) and mirrored onto `<html data-*>` before first paint, so switching never flashes or re-renders the page. Old `/settings#look` and `#appearance` links open the drawer.

| Setting | `<html>` attribute | Options (default first) |
|---|---|---|
| Page in light mode | `data-surface` | Canvas, Drawing paper, Graph |
| Page in dark mode | `data-chalkboard` | Greenboard, Blackboard, Slate |
| Notes | `data-notes` | Paper, Cardboard, Sticky |
| Project cards | `data-cards` | Cardboard, Same as notes |
| Note edges | `data-torn` | Torn, Clean |
| About page | `data-about` | Pin board, On the page |
| Pin board | `data-pinboard` | Cork, Burlap |
| Experience photos | `data-timeline` | Wire mesh (binder clips), On a line (twine and pegs) |
| Opening a note | `data-flight` | Unfasten (pull the pin, peel the tape, open the peg, then fly), Zoom, Fade |
| Doodles and props | `data-decor` | Lots, Some, None |
| Wear and tear | `data-aging` | Lived-in, Well-worn, Brand new |

The theme itself defaults to dark (the green chalkboard); light mode opens on the canvas. Visitors can still pick light or system in Settings.

## Changing a default

`portfolio/lib/lookPrefs.ts` is the single table behind the store, the boot script, the attributes, and the Settings controls. The first option of each list is the default; reorder it to change the default. Add an option there, a label in `MATERIAL_CHOICES` or `WEAR_CHOICES` (`components/SettingsPanel.tsx`), and its CSS. `CUSTOMIZATION_KEYS` (`hooks/useSitePrefs.ts`) lists what Reset customization puts back.

Only the chosen options cost anything: each texture is a CSS `url()` that downloads once a rule using it matches, and the page flip code loads only when it is turned on.

## Where the styles live

- `app/look.css`: page surfaces, wear, note materials, torn edges, push pins, the doodle layer, and the page-end flourish.
- `components/about/pinboard.css` and `components/about/PinBoard.tsx`: the board and its notes.
- `components/ExperienceTimeline.tsx` and `components/about/timeline.css`: the experience photos, the twine or mesh they hang on, and their open sheet.
- `components/ui/Flyout.tsx` and `flyout.css`: the shared open-a-note dialog for the board and the photos.
- `lib/fasteners.ts`: how a pin, a strip of tape, or a peg lets go and takes hold again.
- `lib/flight.ts`: the card-to-sheet flight shared by notes, photos, and project cards.
- `components/projects/projects.css`: project cards and the expanded note.
- `components/SketchbookDoodles.tsx`: the line-sketch doodles, origami, and chalk drawings, each tagged by theme (`paper`, `board`, `any`), density tier, and whether it fits on phones.
Textures are CC0 files in `portfolio/public/resources/textures/`; see [textures](textures.md). A texture only downloads once a rule that uses it matches, so a choice that is switched off costs nothing. Reduced motion turns every flight into a fade and stops drifting props.
