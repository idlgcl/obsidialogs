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
}
