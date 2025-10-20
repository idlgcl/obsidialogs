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
      if (beforeLink.endsWith(previousWords.trim())) {
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
}
