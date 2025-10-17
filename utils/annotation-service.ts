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
