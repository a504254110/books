# Book summaries workspace

Single source of project instructions: **Codex**, **Cursor**, and other agents that follow [AGENTS.md](https://agents.md/) load this file from the repository root. Edit only this file when changing policy.

## Layout

- Optional vault dashboard: `Home.md` at the vault root for homepage / Dataview navigation.
- Use `books/<slug>/` (lowercase, hyphens). Put inputs in `books/<slug>/source/` (PDF, `.txt`, `.md` extracts).
- Outputs: `book-overview.md` at the book root; optional `chapters/NN-topic.md` (zero-padded). Keep a short `README.md` per book (title, author, status).
- Default to English for all project files.
- This repository is single-owner and share-oriented. Keep the tracked tree focused on reader-facing content and shared Obsidian configuration, not on agent work products.
- Detailed English explainer notes are allowed under `books/<slug>/explainers-en/` when they are explicitly linked from English chapter summaries and exist to help readers understand one difficult concept more deeply without overloading the main chapter note.
- Exception: concept-level Chinese explainer notes are allowed under `books/<slug>/explainers-zh/` when they are explicitly linked from English chapter summaries and exist only to help Chinese readers understand a specific concept more deeply.
- Do not store temporary plans, implementation notes, migration checklists, or design drafts in tracked `docs/` paths. Put those local work files under `_private/plans/` instead.

## PDFs and grounding

- **Open distribution:** Do not commit commercial book PDFs or full-text machine extracts (e.g. page-level JSON dumps). Git-ignore them under `books/<slug>/source/`; keep only reader-authored notes and pointers. See `books/<slug>/source/README.md` for the pattern.
- PDFs in `source/` are not reliable text for the model unless the user provides extracts, pastes, or companion text files.
- **Do not invent** quotes, statistics, or “the author says” claims. **Do not fabricate** detailed per-chapter content when only an unextracted PDF exists.
- If sources are thin: write or refresh `book-overview.md` and end with **Chapter coverage** (what is missing vs stubbed). Label **Inferred (weak)** vs **Stated in text** when needed.

## Author’s examples (required emphasis)

- Under **Key concepts**, always include **Author’s examples**: the author’s stories, studies, cases, or thought experiments, not generic analogies.
- When text is available, add a pointer (`ch.`, `p.`, or `source/file`). Otherwise mark **Needs verification**.
- In chapter notes, keep examples attached to the concept they support. Do not place all examples in a separate top-level section unless the note has no meaningful concept breakdown.
- After each major example, explain what the example proves. Do not leave examples as unprocessed anecdotes.
- Do not refer to examples by label alone when a first-time reader would not recognize them. Write examples as self-contained mini-scenes, not shorthand such as `the package example` or `the turkey example`.
- In `Example`, restate the concrete setup of the scene in 1-2 sentences so a reader who has not read the chapter can still understand why the example matters.
- In `Why this example matters`, make the contrast explicit. Prefer formulations like `A is not just B; the difference is ...` or `This matters because ...`, instead of assuming the reader already remembers the source context.
- Default to ESL-friendly plain English. Keep Taleb's key vocabulary when it matters, but explain it with short sentences, common words, and direct contrasts.
- Avoid elegant but compressed phrasing when a simpler sentence would be easier for a second-language reader to understand.

## Obsidian-first reading model

- Assume the vault is read primarily in Obsidian `Reading view`, with `Outline`, `Page Preview`, bookmarks, and Dataview-style dashboards.
- Optimize chapter notes for offsite discussion readiness, not just scan-first reading. A reader who only reads the summaries should be able to speak intelligently with people who finished the full book.
- The first screen should provide a concise top-level summary before the reader opens deeper sections, but it should also surface what the reader should be able to say out loud in conversation.
- If a chapter title depends on a metaphor, symbol, or cultural reference, decode it explicitly on the first screen. A summary-only reader should not need the original chapter to understand what the title is pointing to.
- Keep the visual direction editorial and minimal. Prefer a small semantic palette, strong contrast, stable spacing, and restrained use of decorative effects.
- Prefer an editorial-library look over a generic dashboard look. Entry pages should feel like reading portals with clear routes into the book.
- Hide Obsidian's inline title when notes already carry an in-note `#` heading. Do not rely on duplicated titles.
- Hide in-document properties in normal reading. Metadata should not consume the first screen of a chapter note.
- Prefer stable heading structure over decorative formatting so the right-hand outline remains useful.
- Use minimal front matter for chapter notes. Default to `book`, `chapter`, and `status`. Only add more properties when they are required for queries or automation.
- Treat each concept as a self-contained discussion card: a reader should be able to jump to one concept from the outline and recover the idea, the concrete scene, the lesson from that scene, and the whole-book relevance without rereading the chapter.
- Use native Obsidian callouts sparingly. Prefer `[!info]` for grounding notes and `[!abstract]` for the top-level chapter summary. Avoid emoji-heavy headings or decorative icon spam.
- Prefer continuous-reading navigation over file browsing. Chapter notes should make it easy to move to the previous chapter, `Home.md`, or next chapter without returning to the file explorer.
- Style navigation as a quiet pill bar rather than plain inline prose whenever CSS or note structure allows it.
- Add a short locator bar near the top of each chapter note so the reader can see the book section and chapter position immediately.
- When a concept is likely to be difficult for Chinese readers, prefer a dedicated note under `explainers-zh/` over in-place bilingual blocks in the chapter note.
- When a concept benefits from a slower, more detailed English walkthrough, prefer a dedicated note under `explainers-en/` over making the concept card too long or too dense.
- Link each explainer from the relevant concept card with a normal Obsidian note link so desktop readers get `Page Preview` on hover and mobile readers can tap through cleanly.
- Keep the main chapter note English-first. Do not turn chapter notes into mixed bilingual pages when a linked explainer can provide the same help with less reading noise.
- Each explainer note should link back to the exact concept heading in the source chapter so readers can return to the same place quickly.
- Treat the explainer note as an explanation layer, not a translation layer. The goal is to help the reader truly understand the concept, not to mirror every sentence in the concept card.
- Use the same interaction model for `explainers-en/` and `explainers-zh/`: one concept, one explainer note, one top back link to the exact concept heading, and one light link from the concept card.
- Do not store personal reading progress directly in shared chapter notes. Shared content should remain Git-safe and identical across readers.
- Store personal reading progress in the local data file of the bundled `books-reading-progress` community plugin.
- The plugin's local state file must stay out of Git. Track the plugin code, but ignore `.obsidian/plugins/books-reading-progress/data.json`.
- For chapter-level reading UX, render the progress toggle through the `books-reading-progress` code block so readers can mark progress from the chapter page without modifying the chapter file itself.
- When `Home.md` or other dashboards show chapter status, derive that status from the plugin's local state and present it as a color-coded `Read` / `Unread` state.
- Use a consistent semantic palette across notes:
  - `hero`: entry card for Home or book-level overview pages
  - `abstract`: summary card
  - `info`: grounding card
  - `locator`: chapter position card
  - `concept`: main reading card
  - `status`: reading progress card
  - `note`: reader annotations
  - `route`: guided reading path card
  - `map`: grouped navigation card
- Favor readable line length, generous `h2`/`h3` spacing, and high-contrast body text over compact dashboard density.
- Prefer fewer, sharper concepts over exhaustive coverage. Default to 2-4 primary concepts per chapter; only exceed that when the chapter genuinely contains multiple independent moves that matter in discussion.
- Concept cards must represent genuinely different ideas. If two cards mainly teach the same contrast or make the same move, merge them instead of forcing parallel structure.
- For concept sections, keep numbered headings in the form `### Concept 1: ...`, `### Concept 2: ...`, and so on, so the outline reflects chapter order immediately.
- After each concept heading, place the concept body inside a single callout card. Prefer a dedicated `[!concept]` callout so concept cards have a stable visual identity distinct from `Grounding`.
- Inside each concept card, use the same field order whenever possible: `Claim` → `Example` → `Why this example matters` → `Whole-book connection` → optional `Possible confusion` → optional quiet `Grounding`.
- Keep the jobs of these fields separate:
  - `Claim`: one simple sentence with the main idea only
  - `Example`: one concrete scene, case, or thought experiment from the chapter, not a paraphrased abstraction
  - `Example` may contain more than one tightly linked example when that set makes the contrast clearer or more memorable than a single scene
  - If the example depends on timing, dose, sequence, or contrast between short and long exposure, spell that out in plain English. The reader should not need the source chapter to infer which part is brief, repeated, delayed, or chronic.
  - `Why this example matters`: explain the lesson or contrast inside the example; do not restate the claim in different words
  - `Whole-book connection`: explain where this idea matters later in the book or in discussion of the full argument
  - `Possible confusion`: name one likely misreading, objection, or limit only when it is specific to that concept
- If `Why this example matters` can be replaced by the `Claim` without changing meaning, the card is badly written and should be revised.
- Do not force the same `Possible confusion` into every concept card. If a confusion applies to multiple concepts in the chapter, move it to an optional chapter-level section instead.
- Use an optional `## Common confusions in this chapter` section when a likely misreading belongs to the chapter as a whole rather than to one concept.
- Use exact, discussion-relevant links instead of vague forward links. State what later theme, chapter, or debate the concept feeds.
- `Chapter arc` is optional. Use it only when sequence is itself important to understanding the chapter's move.
- Replace generic `Connections` with a more exact whole-book positioning section.
- Add a final `## Reader notes` section to chapter notes with a collapsed personal-notes callout so reader annotations do not mix with the summary structure.
- Prefer `book-overview.md` as a reading hub, not just a coverage audit. It should include a direct chapter map grouped by the book's internal parts when that materially improves navigation.
- For Chinese explainers, prefer this minimal structure:
  - one top `Back to concept` link
  - one short `核心意思` block
  - one `详细解释` block
  - one `这个例子到底在说明什么` block
- For English explainers, prefer this minimal structure:
  - one top `Back to concept` link
  - one short `Core idea` block
  - one `Detailed explanation` block
  - one `What this example is really showing` block
- Keep English explainers tightly focused on explanation. They should deepen the concept without duplicating the entire chapter note.
- Keep Chinese explainers tightly focused on explanation. Do not add extra sections such as cross-chapter links, discussion prompts, or essay-like digressions unless the user asks for them.

## Status conventions

- Use `status: stub` only when a note is a placeholder or still lacks a grounded chapter pass.
- Use `status: summarized` when a grounded first-pass chapter summary exists and follows the chapter-note template.
- Use `status: reviewed` only after a deliberate cleanup or refinement pass beyond the first grounded summary.
- Avoid leaving completed chapter notes at `drafted`; dashboards should treat finished first-pass notes as `summarized`.

## Templates (shape)

**`book-overview.md`:** Purpose/audience → Core argument → Key concepts (each with Author’s examples) → Optional “how to use” → **Chapter coverage**.

**`chapters/NN-slug.md`:**

- Optional minimal front matter: `book`, `chapter`, `status`
- One short navigation line near the top with previous / home / next links when applicable
- One short locator line or callout near the top with the internal book section and chapter position
- `## Reading status`
- One `books-progress` code block directly under that heading
- Use `mode: chapter` so the plugin can infer the current chapter path automatically
- `## Chapter in one minute`
- Prefer 3 short bullets, not one dense paragraph
- Use this section for orientation: what the chapter is doing, how it is framed, and what the title metaphor means when that is not obvious
- Optional callout under that heading: `[!abstract]`
- `## What you should be able to say out loud`
- Prefer 3-5 bullets written as discussion handles, not recap prose
- Make these bullets more conversational and arguable than `Chapter in one minute`. They should sound like claims a reader could actually use in discussion, not a second compressed summary of the same lines.
- Optional collapsed grounding callout after the top summary: `[!info]- Grounding`
- `## Key distinctions`
- Use explicit contrasts that readers can debate, such as `A vs B`, `surface claim vs real claim`, or `common reading vs Taleb's reading`
- Optional `## Common confusions in this chapter`
- Use 1-3 bullets when one likely misreading applies to multiple concepts and would otherwise be repeated across cards
- Optional `## Chapter arc`
- `## Core concepts`
- For each concept card:
  - `### Concept 1: ...` and continue numbering in order
  - One `[!concept]` callout directly under the heading
  - `**Claim.**`
  - `**Example.**`
  - `Example` should be self-contained and understandable without having read the original chapter
  - `Example` should name a concrete scene, case, or thought experiment from the chapter rather than a paraphrased abstraction
  - Use multiple tightly linked examples only when they clarify the contrast better than a single example
  - If the example depends on timing, dose, or sequence, explain that sequence directly
  - `**Why this example matters.**`
  - This field should explain the lesson, contrast, or mistake corrected by the example. It should not simply repeat the `Claim`.
  - Prefer short sentences and simple verbs in these fields. Keep the key vocabulary, but make the scene and the contrast easy to understand on first read.
  - `**Whole-book connection.**`
  - Optional `**Possible confusion.**`
  - Optional quiet `**Grounding.**`
- `## Points to debate`
- Add 2-4 bullets on tensions, objections, overreach, or likely disagreement
- `## Why this chapter matters in the whole book`
- Explain the chapter's exact role in the argument of the whole book
- One short navigation line near the bottom with previous / home / next links when applicable
- `## Reader notes`
- Optional collapsed personal-notes callout under that heading
- Optional `## Open questions`

**`explainers-zh/NN-concept-M-slug-zh.md`:**

- One top link back to the exact source concept heading in the English chapter note
- One short heading for the explainer note
- `## 核心意思`
- `## 详细解释`
- `## 这个例子到底在说明什么`
- Use Chinese for the explanation, but keep Taleb's important English technical vocabulary inline when that improves clarity

**`explainers-en/NN-concept-M-slug-en.md`:**

- One top link back to the exact source concept heading in the English chapter note
- One short heading for the explainer note
- `## Core idea`
- `## Detailed explanation`
- `## What this example is really showing`
- Use English for the explanation, but keep the note explanation-first and more detailed than the concept card rather than sentence-by-sentence restatement

## Edits

- Prefer editing existing markdown over creating duplicate summary files. Do not rename book slugs without updating `README.md`.
- For this vault, `docs/plans/` is no longer a tracked destination for local planning notes. Use `_private/plans/` for private design and execution notes.
