# Opening card — GDWEB reference review

Reviewed on 2026-09-22. Opened the user's GDWEB IT/system-development list,
followed four detail pages to their original sites, and inspected browser screenshots.

## Observed references

- **PhysicalWorks** — https://physicalworks.ai/
  A rounded, nearly full-width hero combines its large message and robot scene in
  one frame. Scrolling moves into a separate typographic introduction. Applied:
  give the existing Three.js scene a defined surface next to the introduction,
  so its transparent canvas no longer reads as an unbounded empty half.
- **소이정** — https://www.soijeong.com/
  An orange shop scene fills the opening viewport, with the large message at its
  lower edge. Dismissed the announcement and observed the scene framing change
  with scrolling. Applied: keep one consistent visual identity across the scene
  and controls. Preserve Juho's blue palette and actual portrait; do not copy
  the shop metaphor or artwork. Some scroll commands timed out after moving the
  page; only the resulting screenshots are evidence, not a claim about timing.
- **towards** — https://towards.co.kr/
  Large left-aligned typography, a rotating text-rendered object, and a fine
  header rule. Scrolling changes to a light introduction; the WORK link opens
  an image-and-caption project grid. Applied: clearer scale hierarchy, shared
  alignment, and compact captions. The pointer crosshair was observed but is
  not copied because it would compete with portfolio text.
  Verified work URL: https://towards.co.kr/index#s20260607872b046946a1a
- **나인원랩스** — https://nineonelabs.co.kr/
  Opened from GDWEB. Header rendered, but the main viewport stayed black before
  and after a scroll. Excluded from visual conclusions.

## Changes

The opening card now has a separate portrait rail, a central introduction, and
the adjacent framed 3D scene at desktop widths. Previously the portrait sat
above the introduction in one wide column, opposite another wide canvas.
The portrait keeps its original 312:400 ratio and reaches 248px wide on a full
desktop. Three full-width topic selectors include short, factual work labels;
their progress indicators still use the existing single GSAP clock.

At intermediate widths the portrait moves to a top row; on phones the content
stacks. The existing reader button remains in its own reserved layout row.
No changes to section scrolling, 3D geometry, or the automatic scene clock.

## Verification limits

The reference sites were visually inspected. The local Site preview remains
unavailable in this environment. JavaScript syntax, CSS parsing, packaged GSAP
interaction tests, and HTML/asset checks passed. JSDOM layout uses fixtures:
this is not a rendered 1920x1080 or GPU-pixel verification of the revised Site.
