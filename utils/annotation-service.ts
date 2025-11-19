import { App, normalizePath } from "obsidian";

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

  constructor(app: App) {
    this.app = app;
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

  async validateNote(
    annotation: Annotation
  ): Promise<{
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

      // Calculate lineIndex from the link position
      const expectedLink = `[[@${annotation.targetId}]]`;
      const linkIndex = sourceContent.indexOf(expectedLink);
      let lineIndex: number | undefined;
      if (linkIndex !== -1) {
        const textBeforeLink = sourceContent.substring(0, linkIndex);
        lineIndex = textBeforeLink.split("\n").length - 1;
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
