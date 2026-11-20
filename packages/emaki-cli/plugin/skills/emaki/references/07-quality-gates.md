# Quality gates

Every gate ends with evidence the owner can see: a contact sheet, a page screenshot, a validation report, a video.
Never report something as done that has not been looked at. Use the `visual-reviewer` and `fact-checker` agents for
an independent pass before showing the owner.

## Gate A · Outline approved
Catalogue complete; pilot chosen; locales, stack, media scope and roles recorded in `project/decisions.md`.

## Gate B · Theme verified (on the pilot)
- Brand: logo, colours, fonts, tone match the brief; text contrast ≥ 4.5:1 (3:1 for large text).
- The article page, story index and player render in every launch locale at 375, 768, 1280 px widths; no
  horizontal scroll; dark mode if in scope.
- One scene of each kind shown in landscape, portrait and figure.

## Gate C · Approach approved (the pilot story, end to end)
- Item card fulfilled: the one message is clear in 10 seconds; the punchline is the last thing seen and heard.
- Scene grammar (04-scene-authoring.md) holds; motion is calm; beats land on words.
- Layout: nothing overlaps or clips in either orientation; connectors meet edges at centres; repeated cards are the
  same size; text has room in the longest locale.
- Accuracy: every claim traced to a source; illustrative data labelled.
- Video (if in scope): durations, loudness, captions, covers per the delivery checklist.
The pilot's decisions become the **style guide** (`project/style-guide.md`) every later story follows.

## Gate D · Each story (batch build)
1. `emaki validate <slug>` passes.
2. Contact sheet in each locale reviewed by Claude against the checklist below; fixes applied; sheet re-made.
3. Article page screenshot (desktop + mobile) in the default locale.
4. The owner reviews in the review sheet; changes go through the feedback loop until approved.

### Per-scene checklist
- [ ] Head says the idea in ≤ 9 words; sub ≤ 20 words.
- [ ] The picture shows the idea without the words.
- [ ] Nothing overlaps, clips, or crowds an edge (40 px margin), in landscape and portrait.
- [ ] Connectors attach at edge centres; alignment and spacing are even; sizes consistent.
- [ ] Final frame holds ≥ 1.5 s; the frame at the cover time is the punchline card.
- [ ] Text fits in every locale; diacritics render correctly in the display face.
- [ ] Colour use: one accent for what matters; success colour for what's right; no meaning by colour alone.

## Gate E · Release
- Site builds; every published story prerendered per locale; links, hreflang, sitemap, og images.
- Accessibility: keyboard (player: ←/→, space, M, V, C), focus visible, captions, `prefers-reduced-motion` (figures show
  the final frame, the player doesn't autoplay), alt text for covers, language attributes.
- Performance: pages ≤ 200 KB JS before media; figures start only when visible; videos lazy-loaded.
