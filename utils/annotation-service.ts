import { App, normalizePath } from "obsidian";

export interface AnnotationData {
  id: string;
  timestamp: number;
  kind: "COMMENT" | "NOTE" | "TRANSLATION";
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
  target_start_offset: number;
  target_end_offset: number;
  target_display_offset: number;
  isValid?: boolean;
  validationMessage?: string;
}

export interface AnnotationsFile {
  comments: Record<string, AnnotationData>;
  notes: Record<string, AnnotationData>;
}

export class AnnotationService {
  private app: App;
  private readonly ANNOTATIONS_FOLDER = ".idealogs/annotations";

  constructor(app: App) {
    this.app = app;
  }

  async ensureAnnotationsDirectory(): Promise<void> {
    const folderPath = normalizePath(this.ANNOTATIONS_FOLDER);

    if (!(await this.app.vault.adapter.exists(folderPath))) {
      const idealogsFolderPath = normalizePath(".idealogs");
      if (!(await this.app.vault.adapter.exists(idealogsFolderPath))) {
        await this.app.vault.createFolder(idealogsFolderPath);
      }

      await this.app.vault.createFolder(folderPath);
    }
  }

  getAnnotationsFilePath(targetPath: string): string {
    const baseFilename =
      targetPath.split("/").pop()?.split(".")[0] || "unknown";
    return normalizePath(
      `${this.ANNOTATIONS_FOLDER}/${baseFilename}.annotations`
    );
  }

  async loadAnnotations(targetPath: string): Promise<AnnotationsFile> {
    await this.ensureAnnotationsDirectory();

    const annotationsPath = this.getAnnotationsFilePath(targetPath);

    if (await this.app.vault.adapter.exists(annotationsPath)) {
      try {
        const fileContent = await this.app.vault.adapter.read(annotationsPath);
        return JSON.parse(fileContent);
      } catch (error) {
        console.error(`Error reading annotations file: ${error}`);
        return { comments: {}, notes: {} };
      }
    }

    return { comments: {}, notes: {} };
  }

  async saveComment(commentData: {
    commentId: string;
    textDisplay: string;
    commentBody: string;
    targetArticle: string;
    targetTextStart: string;
    targetTextEnd: string;
    targetTextDisplay: string;
    targetFullText: string;
    targetStartOffset: number;
    targetEndOffset: number;
    targetDisplayOffset: number;
    sourceFilePath: string;
  }): Promise<string> {
    await this.ensureAnnotationsDirectory();

    if (!commentData.targetArticle || !commentData.sourceFilePath) {
      throw new Error("Target article and source path are required");
    }

    const timestamp = Date.now();

    const srcTxtDisplay = commentData.textDisplay;
    const srcTxtStart = srcTxtDisplay.split(/\s+/)[0] || "";
    const srcTxtEnd = commentData.commentBody.split(/\s+/).pop() || "";
    const srcTxt = `${srcTxtDisplay} ${commentData.commentBody}`;

    const targetTxtDisplay = commentData.targetTextDisplay;
    const targetTxtStart = commentData.targetTextStart;
    const targetTxtEnd = commentData.targetTextEnd;
    const targetTxt = commentData.targetFullText;

    const sourceFilename =
      commentData.sourceFilePath.split("/").pop() || commentData.sourceFilePath;

    const annotationData: AnnotationData = {
      id: commentData.commentId,
      kind: "COMMENT",
      timestamp,
      src: sourceFilename,
      src_txt_display: srcTxtDisplay,
      src_txt_start: srcTxtStart,
      src_txt_end: srcTxtEnd,
      src_txt: srcTxt,
      target: commentData.targetArticle,
      target_txt_display: targetTxtDisplay,
      target_txt_start: targetTxtStart,
      target_txt_end: targetTxtEnd,
      target_txt: targetTxt,
      target_start_offset: commentData.targetStartOffset,
      target_end_offset: commentData.targetEndOffset,
      target_display_offset: commentData.targetDisplayOffset,
    };

    const annotations = await this.loadAnnotations(commentData.targetArticle);

    annotations.comments[commentData.commentId] = annotationData;

    const annotationsPath = this.getAnnotationsFilePath(
      commentData.targetArticle
    );
    await this.app.vault.adapter.write(
      annotationsPath,
      JSON.stringify(annotations, null, 2)
    );

    const sourceAnnotations = await this.loadAnnotations(
      commentData.sourceFilePath
    );
    sourceAnnotations.comments[commentData.commentId] = annotationData;
    const sourceAnnotationsPath = this.getAnnotationsFilePath(
      commentData.sourceFilePath
    );
    await this.app.vault.adapter.write(
      sourceAnnotationsPath,
      JSON.stringify(sourceAnnotations, null, 2)
    );

    return commentData.commentId;
  }

  async saveNote(noteData: {
    noteId: string;
    textStart: string;
    textEnd: string;
    textDisplay: string;
    linkText: string;
    targetArticle: string;
    targetTextStart: string;
    targetTextEnd: string;
    targetTextDisplay: string;
    targetFullText: string;
    targetStartOffset: number;
    targetEndOffset: number;
    targetDisplayOffset: number;
    sourceFilePath: string;
  }): Promise<string> {
    await this.ensureAnnotationsDirectory();

    if (!noteData.targetArticle || !noteData.sourceFilePath) {
      throw new Error("Target article and source path are required");
    }

    const timestamp = Date.now();

    const srcTxtDisplay = noteData.textDisplay;
    const srcTxtStart = noteData.textStart;
    const srcTxtEnd = noteData.textEnd;

    // Read the source file to get the full text range
    let srcTxt = "";
    try {
      const fileContent = await this.app.vault.adapter.read(
        noteData.sourceFilePath
      );

      const linkText = noteData.linkText;

      // IMPORTANT: Find the link first, then work within the SAME LINE only
      const linkIndex = fileContent.indexOf(linkText);
      if (linkIndex === -1) {
        throw new Error("Could not locate link in source file");
      }

      // Find the start and end of the line containing the link
      const lineStart = fileContent.lastIndexOf("\n", linkIndex - 1) + 1;
      const lineEnd = fileContent.indexOf("\n", linkIndex);
      const lineEndPos = lineEnd === -1 ? fileContent.length : lineEnd;

      // Extract the full line
      const line = fileContent.substring(lineStart, lineEndPos);

      // Now find positions within this line
      const linkPosInLine = linkIndex - lineStart;

      // Search backwards within the line to find textDisplay (immediately before link)
      const beforeLinkInLine = line.substring(0, linkPosInLine);
      const displayIndexInLine = beforeLinkInLine.lastIndexOf(srcTxtDisplay);
      if (displayIndexInLine === -1) {
        throw new Error(
          "Could not locate text display before the link on the same line"
        );
      }

      // Search backwards within the line to find textStart (before textDisplay)
      const beforeDisplayInLine = line.substring(0, displayIndexInLine);
      const startIndexInLine = beforeDisplayInLine.lastIndexOf(srcTxtStart);
      if (startIndexInLine === -1) {
        throw new Error("Could not locate text start on the same line");
      }

      // Search forwards within the line to find textEnd (after the link)
      const afterLinkInLine = linkPosInLine + linkText.length;
      const endIndexInLine = line.indexOf(srcTxtEnd, afterLinkInLine);
      if (endIndexInLine === -1) {
        throw new Error(
          "Could not locate text end after the link on the same line"
        );
      }

      // Extract the text range from the line (from textStart to end of textEnd)
      const endPosInLine = endIndexInLine + srcTxtEnd.length;
      srcTxt = line.substring(startIndexInLine, endPosInLine);
    } catch (error) {
      console.error("Error extracting source text range:", error);
      // Fallback to simple concatenation if file reading fails
      if (srcTxtStart === srcTxtDisplay) {
        srcTxt = `${srcTxtDisplay} ${noteData.linkText} ${srcTxtEnd}`;
      } else {
        srcTxt = `${srcTxtStart} ... ${srcTxtDisplay} ${noteData.linkText} ${srcTxtEnd}`;
      }
    }

    const targetTxtDisplay = noteData.targetTextDisplay;
    const targetTxtStart = noteData.targetTextStart;
    const targetTxtEnd = noteData.targetTextEnd;
    const targetTxt = noteData.targetFullText;

    const sourceFilename =
      noteData.sourceFilePath.split("/").pop() || noteData.sourceFilePath;

    const annotationData: AnnotationData = {
      id: noteData.noteId,
      kind: "NOTE",
      timestamp,
      src: sourceFilename,
      src_txt_display: srcTxtDisplay,
      src_txt_start: srcTxtStart,
      src_txt_end: srcTxtEnd,
      src_txt: srcTxt,
      target: noteData.targetArticle,
      target_txt_display: targetTxtDisplay,
      target_txt_start: targetTxtStart,
      target_txt_end: targetTxtEnd,
      target_txt: targetTxt,
      target_start_offset: noteData.targetStartOffset,
      target_end_offset: noteData.targetEndOffset,
      target_display_offset: noteData.targetDisplayOffset,
    };

    const annotations = await this.loadAnnotations(noteData.targetArticle);

    annotations.notes[noteData.noteId] = annotationData;

    const annotationsPath = this.getAnnotationsFilePath(noteData.targetArticle);
    await this.app.vault.adapter.write(
      annotationsPath,
      JSON.stringify(annotations, null, 2)
    );

    const sourceAnnotations = await this.loadAnnotations(
      noteData.sourceFilePath
    );
    sourceAnnotations.notes[noteData.noteId] = annotationData;
    const sourceAnnotationsPath = this.getAnnotationsFilePath(
      noteData.sourceFilePath
    );
    await this.app.vault.adapter.write(
      sourceAnnotationsPath,
      JSON.stringify(sourceAnnotations, null, 2)
    );

    return noteData.noteId;
  }

  async findCommentBySource(
    sourceFilePath: string,
    textDisplay: string,
    textStart: string,
    textEnd: string
  ): Promise<AnnotationData | null> {
    const annotations = await this.loadAnnotations(sourceFilePath);

    for (const commentId in annotations.comments) {
      const comment = annotations.comments[commentId];
      if (
        comment.src_txt_display === textDisplay &&
        comment.src_txt_start === textStart &&
        comment.src_txt_end === textEnd
      ) {
        return comment;
      }
    }

    return null;
  }

  async findNoteBySource(
    sourceFilePath: string,
    linkText: string,
    previousWords: string
  ): Promise<AnnotationData | null> {
    const annotations = await this.loadAnnotations(sourceFilePath);

    for (const noteId in annotations.notes) {
      const note = annotations.notes[noteId];

      const linkIndex = note.src_txt.indexOf(linkText);
      if (linkIndex === -1) {
        continue;
      }

      const beforeLink = note.src_txt.substring(0, linkIndex).trim();
      const previousWordsTrimmed = previousWords.trim();
      const matches = previousWordsTrimmed.endsWith(beforeLink);

      if (matches) {
        return note;
      }
    }

    return null;
  }

  async findNoteByLinkText(
    sourceFilePath: string,
    linkText: string
  ): Promise<AnnotationData | null> {
    const annotations = await this.loadAnnotations(sourceFilePath);

    for (const noteId in annotations.notes) {
      const note = annotations.notes[noteId];

      // Check if this note contains the link text in its source text
      if (note.src_txt.indexOf(linkText) !== -1) {
        return note;
      }
    }

    return null;
  }

  async deleteAnnotation(
    filePath: string,
    annotationId: string,
    type: "comment" | "note"
  ): Promise<void> {
    const annotations = await this.loadAnnotations(filePath);

    if (type === "comment") {
      delete annotations.comments[annotationId];
    } else {
      delete annotations.notes[annotationId];
    }

    const annotationsPath = this.getAnnotationsFilePath(filePath);
    await this.app.vault.adapter.write(
      annotationsPath,
      JSON.stringify(annotations, null, 2)
    );
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  async validateComment(
    annotation: AnnotationData,
    sourceFilePath: string
  ): Promise<{ isValid: boolean; message?: string }> {
    try {
      if (!(await this.app.vault.adapter.exists(sourceFilePath))) {
        return {
          isValid: false,
          message: `Source document not found: ${sourceFilePath}`,
        };
      }

      const sourceContent = await this.app.vault.adapter.read(sourceFilePath);
      const content = sourceContent.replace(/\[\[.*?\|?\d*?\]\]/g, "");

      const startRegex = new RegExp(
        `\\b${this.escapeRegExp(annotation.src_txt_start)}\\b`
      );

      const startMatch = startRegex.exec(content);

      if (!startMatch) {
        return {
          isValid: false,
          message: `Text Start not found in document: "${annotation.src_txt_start}"`,
        };
      }

      const exactEndText = this.escapeRegExp(annotation.src_txt_end);
      const exactEndRegex = new RegExp(`\\b${exactEndText}(?:\\s|$)`, "g");

      const endMatch = exactEndRegex.exec(content);

      if (!endMatch) {
        return {
          isValid: false,
          message: `Text End not found in document: "${annotation.src_txt_end}"`,
        };
      }

      const startIndex = startMatch.index;
      const endIndex = endMatch.index + annotation.src_txt_end.length;

      if (endIndex < startIndex) {
        return {
          isValid: false,
          message: `Text end appears before text start in the document`,
        };
      }

      if (!annotation.src_txt_display.startsWith(annotation.src_txt_start)) {
        return {
          isValid: false,
          message: `Text start "${annotation.src_txt_start}" must be the beginning of text display "${annotation.src_txt_display}"`,
        };
      }

      const boundedText = content.substring(startIndex, endIndex);
      const exactDisplayRegex = new RegExp(
        `${this.escapeRegExp(annotation.src_txt_display)}`
      );

      const displayTextFound = exactDisplayRegex.test(boundedText);

      if (!displayTextFound) {
        return {
          isValid: false,
          message: `Display text "${annotation.src_txt_display}" not found between start and end markers`,
        };
      }

      return { isValid: true };
    } catch (error) {
      console.error(`Error validating annotation: ${error}`);
      return {
        isValid: false,
        message: `Error validating: ${error.message}`,
      };
    }
  }

  async validateNote(
    annotation: AnnotationData,
    sourceFilePath: string
  ): Promise<{ isValid: boolean; message?: string }> {
    try {
      if (!(await this.app.vault.adapter.exists(sourceFilePath))) {
        return {
          isValid: false,
          message: `Source document not found: ${sourceFilePath}`,
        };
      }

      const sourceContent = await this.app.vault.adapter.read(sourceFilePath);

      const startRegex = new RegExp(
        `\\b${this.escapeRegExp(annotation.src_txt_start)}\\b`
      );

      const endRegex = new RegExp(
        `${this.escapeRegExp(annotation.src_txt_end)}`
      );

      const startMatch = startRegex.exec(sourceContent);
      const endMatch = endRegex.exec(sourceContent);

      if (!startMatch) {
        return {
          isValid: false,
          message: `Text Start not found in document: "${annotation.src_txt_start}"`,
        };
      }
      if (!endMatch) {
        return {
          isValid: false,
          message: `Text End not found in document: "${annotation.src_txt_end}"`,
        };
      }

      const startIndex = startMatch.index;
      const endIndex = endMatch.index + annotation.src_txt_end.length;

      if (endIndex < startIndex) {
        return {
          isValid: false,
          message: `Text end appears before text start in the document`,
        };
      }

      const boundedText = sourceContent.substring(startIndex, endIndex);

      const displayWords = annotation.src_txt_display.split(/\s+/);
      let displayTextFound = false;

      if (displayWords.length === 1) {
        const singleWordRegex = new RegExp(
          `\\b${this.escapeRegExp(annotation.src_txt_display)}\\b`
        );
        displayTextFound = singleWordRegex.test(boundedText);
      } else {
        const flexibleSpacingRegex = new RegExp(
          displayWords.map((word) => `\\b${this.escapeRegExp(word)}\\b`).join("\\s+")
        );
        displayTextFound = flexibleSpacingRegex.test(boundedText);
      }

      if (!displayTextFound) {
        return {
          isValid: false,
          message: `Display text "${annotation.src_txt_display}" not found between start and end markers`,
        };
      }

      if (annotation.target) {
        const expectedLinkText = `[[@${annotation.target}]]`;

        const displayTextRegex = new RegExp(
          displayWords.map((word) => `\\b${this.escapeRegExp(word)}\\b`).join("\\s+")
        );
        const displayMatch = displayTextRegex.exec(sourceContent);

        if (displayMatch) {
          const afterDisplayTextPos = displayMatch.index + displayMatch[0].length;
          const textAfterDisplay = sourceContent
            .substring(afterDisplayTextPos, afterDisplayTextPos + 100)
            .trim();

          const linkRegex = new RegExp(
            `^\\s*${this.escapeRegExp(expectedLinkText)}`
          );

          if (!linkRegex.test(textAfterDisplay)) {
            return {
              isValid: false,
              message: `Display text "${annotation.src_txt_display}" is not followed by the expected link "${expectedLinkText}"`,
            };
          }
        }
      }

      return { isValid: true };
    } catch (error) {
      console.error(`Error validating annotation: ${error}`);
      return {
        isValid: false,
        message: `Error validating: ${error.message}`,
      };
    }
  }

  async validateAllAnnotations(filePath: string): Promise<void> {
    try {
      const annotations = await this.loadAnnotations(filePath);

      // Only validate and save if there are annotations to validate
      const hasAnnotations =
        Object.keys(annotations.comments).length > 0 ||
        Object.keys(annotations.notes).length > 0;

      if (!hasAnnotations) {
        return;
      }

      for (const commentId in annotations.comments) {
        const comment = annotations.comments[commentId];
        const { isValid, message } = await this.validateComment(
          comment,
          filePath
        );

        comment.isValid = isValid;
        comment.validationMessage = message;

        if (comment.target && comment.target !== filePath) {
          await this.updateTargetFileAnnotation(comment);
        }
      }

      for (const noteId in annotations.notes) {
        const note = annotations.notes[noteId];
        const { isValid, message } = await this.validateNote(note, filePath);

        note.isValid = isValid;
        note.validationMessage = message;

        if (note.target && note.target !== filePath) {
          await this.updateTargetFileAnnotation(note);
        }
      }

      await this.saveAnnotationsFile(filePath, annotations);
    } catch (error) {
      console.error(`Error in validateAllAnnotations: ${error}`);
    }
  }

  async updateTargetFileAnnotation(annotation: AnnotationData): Promise<void> {
    try {
      const targetPath = annotation.target;
      const targetAnnotations = await this.loadAnnotations(targetPath);

      if (
        annotation.kind === "COMMENT" &&
        targetAnnotations.comments[annotation.id]
      ) {
        targetAnnotations.comments[annotation.id].isValid = annotation.isValid;
        targetAnnotations.comments[annotation.id].validationMessage =
          annotation.validationMessage;
      } else if (
        annotation.kind === "NOTE" &&
        targetAnnotations.notes[annotation.id]
      ) {
        targetAnnotations.notes[annotation.id].isValid = annotation.isValid;
        targetAnnotations.notes[annotation.id].validationMessage =
          annotation.validationMessage;
      }

      await this.saveAnnotationsFile(targetPath, targetAnnotations);
    } catch (error) {
      console.error(`Error updating target file annotation: ${error}`);
    }
  }

  private async saveAnnotationsFile(
    targetPath: string,
    annotations: AnnotationsFile
  ): Promise<void> {
    const annotationsPath = this.getAnnotationsFilePath(targetPath);
    await this.app.vault.adapter.write(
      annotationsPath,
      JSON.stringify(annotations, null, 2)
    );
  }
}
