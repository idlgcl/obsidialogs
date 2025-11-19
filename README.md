# Idealogs Plugin for Obsidian

Insert, view, and annotate Idealogs articles directly from Obsidian.

## Features

### Article Suggestions

- Type `[[@` to get article suggestions from Idealogs
- Select an article to create a WritingLink

### WritingLinks and WritingView

- WritingLinks (`[[@ArticleId]]`) open articles in a dedicated WritingView panel
- Click any WritingLink to view the target article content
- WritingView displays rendered markdown with syntax highlighting

### Annotations System

#### Notes

- Create notes that link text in your markdown to specific passages in Idealogs articles
- Notes can have source context (text around the WritingLink) or be standalone
- Navigate between multiple notes on the same line with Prev/Next buttons
- Create new notes with the "New Note" button

#### Comments

- Annotate inline comments in your markdown
- Link comment text to specific passages in target articles
- Comments are detected automatically when your cursor is inside them

### Validation

- Annotations are automatically validated when files are modified
- Validates that source text (start, display, end) still exists in the document
- Updates sourceText and lineIndex when content changes
- Invalid annotations are marked with validation errors

### Reading Mode Features

- Valid annotations appear with **bold sourceDisplay** text
- Click bold text to open the target article and flash the referenced passage
- WritingLinks for notes without source data also flash their target text

### Flash Highlighting

- Target text is highlighted with a yellow flash animation
- Automatically scrolls the target text into view
- Flash appears when:
  - Loading a saved note/comment in the form
  - Clicking Prev/Next to navigate notes
  - Clicking annotated text in reading mode

### Automatic File Management

- Idealogs files (Ix, Fx) are fetched automatically
- Files open in read-only mode
- Automatic cleanup when files are no longer in view

## How to Use

### Creating a Note

1. Type text followed by a WritingLink: `Some context text [[@Tx123]]`
2. Click the WritingLink to open the NoteForm
3. Fill in the target text fields (Start, End, Display)
4. Click "Save" to create the annotation

### Creating a Comment

1. Write a comment in your markdown (This. Is a comment:)
2. Place your cursor inside the comment
3. The CommentForm will appear automatically
4. Select a target article and fill in the target text fields
5. Click "Save" to create the annotation

### Viewing Annotations in Reading Mode

1. Switch to reading mode (Cmd/Ctrl + E)
2. Valid annotations will show bold sourceDisplay text
3. Click the bold text to view the target and flash the referenced passage

## Network Usage

This plugin connects to the Idealogs API to:

- Fetch article suggestions
- Retrieve article content
- Validate article references
