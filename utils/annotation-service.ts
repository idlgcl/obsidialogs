import { App, normalizePath } from "obsidian";

// Old annotation format interfaces
interface OldNote {
  src: string;
  src_txt_display: string;
  src_txt_start: string;
  src_txt_end: string;
  src_txt: string;
  target: string;
  target_txt_display: string;
  target_txt_start: string;
  target_txt_end: string;
  target_txt: string;
  isValid?: boolean;
  validationMessage?: string;
  lineIndex?: number;
}

interface OldComment {
  src: string;
  src_txt_display: string;
  src_txt_start: string;
  src_txt_end: string;
  src_txt: string;
  target: string;
  target_txt_display: string;
  target_txt_start: string;
  target_txt_end: string;
  target_txt: string;
  isValid?: boolean;
  validationMessage?: string;
}

interface OldAnnotationsFile {
  notes: Record<string, OldNote>;
  comments: Record<string, OldComment>;
}

export interface MigrationResult {
  migratedFiles: string[];
  errors: string[];
}

export interface Annotation {
  id: string;
  kind: "Note" | "Comment";

  targetId: string;
  targetStart: string;
  targetEnd: string;
  targetDisplay: string;
  targetText: string;

  sourceId: string;
  sourceStart?: string;
  sourceEnd?: string;
  sourceDisplay?: string;
  sourceText?: string;

  // Note only. Fragile.
  lineIndex?: number;
  hexId?: string;

  validationError?: string;
  isValid?: boolean;
}

export interface AnnotationsFile {
  notes: Record<string, Annotation>;
  comments: Record<string, Annotation>;
}

export class AnnotationService {
  private app: App;
  private readonly ANNOTATIONS_FOLDER = ".idealogs/annotations";
  private readonly OLD_MIGRATIONS_FOLDER = ".idealogs/annotations/old";

  constructor(app: App) {
    this.app = app;
  }

  async migrateOldAnnotations(): Promise<MigrationResult> {
    const result: MigrationResult = {
      migratedFiles: [],
      errors: [],
    };

    try {
      // Ensure old migrations folder exists
      await this.ensureOldMigrationsDirectory();

      // Find all .annotations files in the vault
      const files = this.app.vault.getFiles();
      const annotationFiles = files.filter((f) =>
        f.path.endsWith(".annotations")
      );

      if (annotationFiles.length === 0) {
        result.errors.push("No .annotations files found in vault");
        return result;
      }

      for (const file of annotationFiles) {
        try {
          const content = await this.app.vault.read(file);
          const oldData = JSON.parse(content) as OldAnnotationsFile;

          // Convert to new format
          const newData: AnnotationsFile = {
            notes: {},
            comments: {},
          };

          // Migrate notes
          for (const noteId in oldData.notes) {
            const oldNote = oldData.notes[noteId];
            const newNote: Annotation = {
              id: noteId,
              kind: "Note",
              sourceId: oldNote.src,
              sourceStart: oldNote.src_txt_start,
              sourceEnd: oldNote.src_txt_end,
              sourceDisplay: oldNote.src_txt_display,
              sourceText: oldNote.src_txt,
              targetId: oldNote.target,
              targetStart: oldNote.target_txt_start,
              targetEnd: oldNote.target_txt_end,
              targetDisplay: oldNote.target_txt_display,
              targetText: oldNote.target_txt,
              isValid: oldNote.isValid,
              validationError: oldNote.validationMessage,
              lineIndex: oldNote.lineIndex,
            };
            newData.notes[noteId] = newNote;
          }

          // Migrate comments
          for (const commentId in oldData.comments) {
            const oldComment = oldData.comments[commentId];
            const newComment: Annotation = {
              id: commentId,
              kind: "Comment",
              sourceId: oldComment.src,
              sourceStart: oldComment.src_txt_start,
              sourceEnd: oldComment.src_txt_end,
              sourceDisplay: oldComment.src_txt_display,
              sourceText: oldComment.src_txt,
              targetId: oldComment.target,
              targetStart: oldComment.target_txt_start,
              targetEnd: oldComment.target_txt_end,
              targetDisplay: oldComment.target_txt_display,
              targetText: oldComment.target_txt,
              isValid: oldComment.isValid,
              validationError: oldComment.validationMessage,
            };
            newData.comments[commentId] = newComment;
          }

          // Save to old migrations folder
          const baseName = file.name.replace(".annotations", "");
          const newPath = normalizePath(
            `${this.OLD_MIGRATIONS_FOLDER}/${baseName}.json`
          );
          await this.app.vault.adapter.write(
            newPath,
            JSON.stringify(newData, null, 2)
          );

          result.migratedFiles.push(file.path);
        } catch (error) {
          result.errors.push(`Error migrating ${file.path}: ${error.message}`);
        }
      }

      return result;
    } catch (error) {
      result.errors.push(`Migration failed: ${error.message}`);
      return result;
    }
  }

  private async ensureOldMigrationsDirectory(): Promise<void> {
    const folderPath = normalizePath(this.OLD_MIGRATIONS_FOLDER);

    if (!(await this.app.vault.adapter.exists(folderPath))) {
      // Ensure parent directories exist
      const idealogsFolderPath = normalizePath(".idealogs");
      if (!(await this.app.vault.adapter.exists(idealogsFolderPath))) {
        await this.app.vault.createFolder(idealogsFolderPath);
      }

      const annotationsFolderPath = normalizePath(this.ANNOTATIONS_FOLDER);
      if (!(await this.app.vault.adapter.exists(annotationsFolderPath))) {
        await this.app.vault.createFolder(annotationsFolderPath);
      }

      await this.app.vault.createFolder(folderPath);
    }
  }

  private async ensureAnnotationsDirectory(): Promise<void> {
    const folderPath = normalizePath(this.ANNOTATIONS_FOLDER);

    if (!(await this.app.vault.adapter.exists(folderPath))) {
      const idealogsFolderPath = normalizePath(".idealogs");
      if (!(await this.app.vault.adapter.exists(idealogsFolderPath))) {
        await this.app.vault.createFolder(idealogsFolderPath);
      }

      await this.app.vault.createFolder(folderPath);
    }
  }

  private getAnnotationsFilePath(articleId: string): string {
    const baseFilename = articleId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return normalizePath(`${this.ANNOTATIONS_FOLDER}/${baseFilename}.json`);
  }

  private async loadAnnotations(articleId: string): Promise<AnnotationsFile> {
    await this.ensureAnnotationsDirectory();

    const annotationsPath = this.getAnnotationsFilePath(articleId);

    if (await this.app.vault.adapter.exists(annotationsPath)) {
      try {
        const fileContent = await this.app.vault.adapter.read(annotationsPath);
        const parsed = JSON.parse(fileContent) as AnnotationsFile;
        return parsed;
      } catch (error) {
        console.error(`Error reading annotations file: ${error}`);
        return { notes: {}, comments: {} };
      }
    }

    return { notes: {}, comments: {} };
  }

  private async saveAnnotationsFile(
    articleId: string,
    annotations: AnnotationsFile
  ): Promise<void> {
    const annotationsPath = this.getAnnotationsFilePath(articleId);
    await this.app.vault.adapter.write(
      annotationsPath,
      JSON.stringify(annotations, null, 2)
    );
  }

  async saveAnnotation(annotation: Annotation): Promise<void> {
    await this.ensureAnnotationsDirectory();

    if (!annotation.targetId || !annotation.sourceId) {
      throw new Error("Target and source article IDs are required");
    }

    const collection = annotation.kind === "Comment" ? "comments" : "notes";

    // Save to target article's annotations file
    const targetAnnotations = await this.loadAnnotations(annotation.targetId);
    targetAnnotations[collection][annotation.id] = annotation;
    await this.saveAnnotationsFile(annotation.targetId, targetAnnotations);

    // Save to source article's annotations file
    const sourceAnnotations = await this.loadAnnotations(annotation.sourceId);
    sourceAnnotations[collection][annotation.id] = annotation;
    await this.saveAnnotationsFile(annotation.sourceId, sourceAnnotations);
  }

  async findCommentBySource(
    sourceId: string,
    sourceDisplay: string,
    sourceStart: string,
    sourceEnd: string
  ): Promise<Annotation | null> {
    const annotations = await this.loadAnnotations(sourceId);

    for (const commentId in annotations.comments) {
      const comment = annotations.comments[commentId];
      if (
        comment.sourceDisplay === sourceDisplay &&
        comment.sourceStart === sourceStart &&
        comment.sourceEnd === sourceEnd
      ) {
        return comment;
      }
    }

    return null;
  }

  async findNoteBySource(
    sourceId: string,
    targetId: string,
    lineIndex: number
  ): Promise<Annotation | null> {
    const annotations = await this.loadAnnotations(sourceId);

    for (const noteId in annotations.notes) {
      const note = annotations.notes[noteId];
      if (note.targetId === targetId && note.lineIndex === lineIndex) {
        return note;
      }
    }

    return null;
  }

  async findNotesByLineIndex(
    sourceId: string,
    targetId: string,
    lineIndex: number
  ): Promise<Annotation[]> {
    const annotations = await this.loadAnnotations(sourceId);
    const results: Annotation[] = [];

    for (const noteId in annotations.notes) {
      const note = annotations.notes[noteId];
      if (note.targetId === targetId && note.lineIndex === lineIndex) {
        results.push(note);
      }
    }

    return results;
  }

  async findNoteByHexId(
    sourceId: string,
    targetId: string,
    lineIndex: number,
    hexId: string
  ): Promise<Annotation | null> {
    const annotations = await this.loadAnnotations(sourceId);

    for (const noteId in annotations.notes) {
      const note = annotations.notes[noteId];
      if (
        note.targetId === targetId &&
        // note.lineIndex === lineIndex &&
        note.hexId === hexId
      ) {
        return note;
      }
    }

    return null;
  }

  async getAnnotations(sourceId: string): Promise<AnnotationsFile> {
    return this.loadAnnotations(sourceId);
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  async validateComment(
    annotation: Annotation
  ): Promise<{ isValid: boolean; message?: string; sourceText?: string }> {
    try {
      const sourceId = annotation.sourceId;

      if (!(await this.app.vault.adapter.exists(sourceId))) {
        return {
          isValid: false,
          message: `Source document not found: ${sourceId}`,
        };
      }

      if (
        !annotation.sourceStart ||
        !annotation.sourceEnd ||
        !annotation.sourceDisplay
      ) {
        return {
          isValid: false,
          message: "Missing source text fields",
        };
      }

      const sourceContent = await this.app.vault.adapter.read(sourceId);
      // Remove wiki links for validation
      const content = sourceContent.replace(/\[\[.*?\|?\d*?\]\]/g, "");

      const startRegex = new RegExp(
        `\\b${this.escapeRegExp(annotation.sourceStart)}\\b`
      );
      const startMatch = startRegex.exec(content);

      if (!startMatch) {
        return {
          isValid: false,
          message: `Text Start not found: "${annotation.sourceStart}"`,
        };
      }

      const endRegex = new RegExp(
        `\\b${this.escapeRegExp(annotation.sourceEnd)}(?:\\s|$)`,
        "g"
      );
      const endMatch = endRegex.exec(content);

      if (!endMatch) {
        return {
          isValid: false,
          message: `Text End not found: "${annotation.sourceEnd}"`,
        };
      }

      const startIndex = startMatch.index;
      const endIndex = endMatch.index + annotation.sourceEnd.length;

      if (endIndex < startIndex) {
        return {
          isValid: false,
          message: "Text end appears before text start",
        };
      }

      const boundedText = content.substring(startIndex, endIndex);
      const displayRegex = new RegExp(
        this.escapeRegExp(annotation.sourceDisplay)
      );

      if (!displayRegex.test(boundedText)) {
        return {
          isValid: false,
          message: `Display text "${annotation.sourceDisplay}" not found between start and end`,
        };
      }

      return {
        isValid: true,
        sourceText: boundedText,
      };
    } catch (error) {
      console.error(`Error validating comment: ${error}`);
      return {
        isValid: false,
        message: `Error validating: ${error.message}`,
      };
    }
  }

  async validateNote(annotation: Annotation): Promise<{
    isValid: boolean;
    message?: string;
    sourceText?: string;
    lineIndex?: number;
  }> {
    try {
      const sourceId = annotation.sourceId;

      if (!(await this.app.vault.adapter.exists(sourceId))) {
        return {
          isValid: false,
          message: `Source document not found: ${sourceId}`,
        };
      }

      if (
        !annotation.sourceStart ||
        !annotation.sourceEnd ||
        !annotation.sourceDisplay
      ) {
        return {
          isValid: false,
          message: "Missing source text fields",
        };
      }

      const sourceContent = await this.app.vault.adapter.read(sourceId);

      const startRegex = new RegExp(
        `\\b${this.escapeRegExp(annotation.sourceStart)}\\b`
      );
      const startMatch = startRegex.exec(sourceContent);

      if (!startMatch) {
        return {
          isValid: false,
          message: `Text Start not found: "${annotation.sourceStart}"`,
        };
      }

      const endRegex = new RegExp(this.escapeRegExp(annotation.sourceEnd));
      const endMatch = endRegex.exec(sourceContent);

      if (!endMatch) {
        return {
          isValid: false,
          message: `Text End not found: "${annotation.sourceEnd}"`,
        };
      }

      const startIndex = startMatch.index;
      const endIndex = endMatch.index + annotation.sourceEnd.length;

      if (endIndex < startIndex) {
        return {
          isValid: false,
          message: "Text end appears before text start",
        };
      }

      const boundedText = sourceContent.substring(startIndex, endIndex);

      // Check display text with flexible spacing
      const displayWords = annotation.sourceDisplay.split(/\s+/);
      let displayTextFound = false;

      if (displayWords.length === 1) {
        const singleWordRegex = new RegExp(
          `\\b${this.escapeRegExp(annotation.sourceDisplay)}\\b`
        );
        displayTextFound = singleWordRegex.test(boundedText);
      } else {
        const flexibleSpacingRegex = new RegExp(
          displayWords
            .map((word) => `\\b${this.escapeRegExp(word)}\\b`)
            .join("\\s+")
        );
        displayTextFound = flexibleSpacingRegex.test(boundedText);
      }

      if (!displayTextFound) {
        return {
          isValid: false,
          message: `Display text "${annotation.sourceDisplay}" not found between start and end`,
        };
      }

      // Construct expected link with hex ID
      const expectedLink = `[[@${annotation.targetId}.${annotation.hexId}]]`;

      // Get the line at lineIndex and check if link exists on that line
      const lines = sourceContent.split("\n");
      const lineIndex = annotation.lineIndex;

      if (lineIndex === undefined || lineIndex >= lines.length) {
        return {
          isValid: false,
          message: `Invalid line index: ${lineIndex}`,
        };
      }

      const lineContent = lines[lineIndex];

      if (!lineContent.includes(expectedLink)) {
        return {
          isValid: false,
          message: `Expected link "${expectedLink}" not found on the same line (${
            lineIndex + 1
          }) with source data.`,
        };
      }

      return {
        isValid: true,
        sourceText: boundedText,
        lineIndex,
      };
    } catch (error) {
      console.error(`Error validating note: ${error}`);
      return {
        isValid: false,
        message: `Error validating: ${error.message}`,
      };
    }
  }

  async validateAllAnnotations(sourceId: string): Promise<void> {
    try {
      const annotations = await this.loadAnnotations(sourceId);

      const hasAnnotations =
        Object.keys(annotations.comments).length > 0 ||
        Object.keys(annotations.notes).length > 0;

      if (!hasAnnotations) {
        return;
      }

      // Validate comments
      for (const commentId in annotations.comments) {
        const comment = annotations.comments[commentId];
        const result = await this.validateComment(comment);

        comment.isValid = result.isValid;
        comment.validationError = result.message;

        if (result.isValid && result.sourceText) {
          comment.sourceText = result.sourceText;
        }

        // Update target file annotation
        if (comment.targetId && comment.targetId !== sourceId) {
          const targetAnnotations = await this.loadAnnotations(
            comment.targetId
          );
          if (targetAnnotations.comments[comment.id]) {
            targetAnnotations.comments[comment.id].isValid = comment.isValid;
            targetAnnotations.comments[comment.id].validationError =
              comment.validationError;
            if (result.isValid && result.sourceText) {
              targetAnnotations.comments[comment.id].sourceText =
                result.sourceText;
            }
            await this.saveAnnotationsFile(comment.targetId, targetAnnotations);
          }
        }
      }

      // Validate notes
      for (const noteId in annotations.notes) {
        const note = annotations.notes[noteId];
        const result = await this.validateNote(note);

        note.isValid = result.isValid;
        note.validationError = result.message;

        if (result.isValid) {
          if (result.sourceText) {
            note.sourceText = result.sourceText;
          }
          if (result.lineIndex !== undefined) {
            note.lineIndex = result.lineIndex;
          }
        }

        // Update target file annotation
        if (note.targetId && note.targetId !== sourceId) {
          const targetAnnotations = await this.loadAnnotations(note.targetId);
          if (targetAnnotations.notes[note.id]) {
            targetAnnotations.notes[note.id].isValid = note.isValid;
            targetAnnotations.notes[note.id].validationError =
              note.validationError;
            if (result.isValid) {
              if (result.sourceText) {
                targetAnnotations.notes[note.id].sourceText = result.sourceText;
              }
              if (result.lineIndex !== undefined) {
                targetAnnotations.notes[note.id].lineIndex = result.lineIndex;
              }
            }
            await this.saveAnnotationsFile(note.targetId, targetAnnotations);
          }
        }
      }

      await this.saveAnnotationsFile(sourceId, annotations);
    } catch (error) {
      console.error(`Error in validateAllAnnotations: ${error}`);
    }
  }
}
