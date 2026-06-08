# Idealogs Annotator

An Obsidian companion for the [Idealogs](https://idealogs.org) platform. View, link, and annotate Idealogs articles from your vault — and send your annotations back to Idealogs to see them rendered on the site, **just for you**.

Article kinds are identified by an ID prefix: `Tx` = Writing, `Fx` = Question, `Ix` = Insight.

---

## Features

### Article discovery & linking

- **`[[@` search trigger** — type `[[@` in the editor to open a live article-search modal (debounced search, type filter, pagination, content preview, keyboard navigation).
- **Smart link insertion** — Writing links insert `[[@TxID.a]]` with an auto-incrementing hex sub-ID; Questions/Insights insert `[[@FxID]]` / `[[@IxID]]`. Pasting links rewrites them so every link in a document gets a unique hex ID.

### Viewing articles

- **Writing view** — open an Idealogs article in a side panel rendered from its markdown.
- **Annotated mode** — toggle to overlay both web and your local annotations: annotated words are bolded and expand to inline cards on click; your local annotations are styled distinctly.
- **Citation markers** — Idealogs links render as compact markers: `@Tx` → `[1]`, `[2]`…, `@Fx` → `[?]`, `@Ix` → `[!]`.
- **Flash highlighting** — clicking a annotation marker opens the article, scrolls and briefly highlights the target passage.

### Annotations

- **Comments** — write a `Title. body:` inline comment; placing the cursor inside it auto-populates the Comment form, where you pick a target article and text range.
- **Notes** — click inside a `[[@Tx…]]` link to open the article and a pre-filled Note form anchored to the link's line context.
- **Dual-sided persistence** — annotations are stored as JSON under `.idealogs/annotations/`, written into both the source and target article files; edits reuse a stable UUID.
- **Validation on save** — annotations are re-validated against article content as files change.

### Send to Idealogs ("just for me")

- Push your local annotations to Idealogs and see them rendered on the site — **visible only to you**, scoped by a per-account owner token.
- A management page on Idealogs (your profile → **Obsidian Integration**) lists what you've sent, with links back into your vault notes.

### File management

- Clicking an `@Fx` / `@Ix` link downloads the article into your vault and tracks it; tracked files are auto-trashed after a configurable delay once closed (reopening cancels deletion).

---

## Getting started

1. Install and enable **Idealogs Annotator** from Obsidian's Community Plugins.
2. (Optional, for the sync workflow) Add your owner token — see below.

---

## Guide: send annotations to Idealogs

This is the workflow for authoring annotations in Obsidian and viewing them on the Idealogs site.

1. **Get your owner token.** On Idealogs, go to your profile → the **Obsidian Integration** tab and copy the **Owner token**. It's tied to your account and is the same in every browser you sign into.
2. **Paste it into Obsidian.** Settings → **Idealogs Annotator** → **Local Annotations** → paste into **Idealogs owner token**. (Sending is blocked until this is set.)
3. **Create annotations** as usual:
   - A **comment** is a `Title. body:` line. Put your cursor inside it, fill in the Comment form (target article + text range), and save.
   - A **note** is created by clicking inside a `[[@Tx…]]` link and filling in the Note form.
4. **Sync.** Run the command palette command **"Sync local annotations to Idealogs"**. You'll get a confirmation notice (e.g. `✓ Synced 3 annotations to Idealogs`).
5. **View on Idealogs.** Open the annotated article — your annotations appear on the **bolded words** (click to reveal), with your own sorted to the top. Each one links back to its source note in your vault. Manage everything from the **Obsidian Integration** tab.

> Annotations are private to you: they're kept out of the public article view and surfaced only to your account.

---

## Settings

- **Idealogs owner token** — paste from the Idealogs site to enable syncing.
- **Auto-delete delay** — how long downloaded Idealogs files linger before being trashed (2–5s).
- **Clear API cache** — drop cached article/annotation responses.
- **Enable logs** — opt-in in-memory logging with copy/clear buttons.
- **Migrate old annotations** — convert legacy `.annotations` files into the current JSON schema.

---

## Commands

- **Sync local annotations to Idealogs** — sends every local annotation in your vault to Idealogs (requires the owner token).

---

## Development

```bash
npm install
npm run dev     # esbuild watch (writes main.js)
npm run build   # type-check + minified production build
npm test        # jest
```

Backend endpoints (`API_ENDPOINT`, `ANNOTATION_ENDPOINT`) are injected at build time via esbuild from `.env` in development.

> After changing source, rebuild **and reload the plugin in Obsidian** (toggle it off/on) — Obsidian runs the built `main.js`, so a stale build silently runs old code.
