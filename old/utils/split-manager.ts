import { App, TFile, WorkspaceLeaf } from "obsidian";
import { IdealogsFileTracker } from "./idealogs-file-tracker";
import { ApiService } from "./api";
import { Article } from "../types";

export class SplitManager {
  private app: App;
  private fileTracker: IdealogsFileTracker;
  private apiService: ApiService;
  private splitLeaf: WorkspaceLeaf | null = null;
  private previousFile: TFile | null = null;
  private currentArticleContent: string | null = null;

  constructor(
    app: App,
    fileTracker: IdealogsFileTracker,
    apiService: ApiService
  ) {
    this.app = app;
    this.fileTracker = fileTracker;
    this.apiService = apiService;
  }

  async openInSplit(file: TFile): Promise<void> {
    const isLeafValid = this.isSplitValid();

    const fileToDelete = this.previousFile;
    this.previousFile = file;

    if (isLeafValid) {
      await this.splitLeaf?.openFile(file, {
        state: { mode: "preview" },
      });
    } else {
      const leaf = this.app.workspace.getLeaf("split");
      this.splitLeaf = leaf;
      await leaf.openFile(file, { state: { mode: "preview" } });
    }

    // Delete previous file if it was tracked and is different from current
    if (
      fileToDelete &&
      this.fileTracker.isTracked(fileToDelete.name) &&
      fileToDelete.name !== file.name
    ) {
      try {
        await this.app.vault.delete(fileToDelete);
        this.fileTracker.untrack(fileToDelete.name);
      } catch (error) {
        console.error("[SplitManager] Error deleting previous file:", error);
      }
    }
  }

  private isSplitValid(): boolean {
    if (!this.splitLeaf || !this.splitLeaf.view) {
      return false;
    }

    try {
      return this.splitLeaf.view.containerEl.isConnected;
    } catch (error) {
      return false;
    }
  }

  closeSplit(): void {
    if (this.splitLeaf) {
      this.splitLeaf.detach();
      this.splitLeaf = null;
    }
  }

  async cleanup(): Promise<void> {
    if (
      this.previousFile &&
      this.fileTracker.isTracked(this.previousFile.name)
    ) {
      try {
        await this.app.vault.delete(this.previousFile);
        this.fileTracker.untrack(this.previousFile.name);
      } catch (error) {
        console.error("[SplitManager] Error cleaning up file:", error);
      }
    }

    this.splitLeaf = null;
    this.previousFile = null;
  }

  getSplitLeaf(): WorkspaceLeaf | null {
    return this.splitLeaf;
  }

  getCurrentFile(): TFile | null {
    return this.previousFile;
  }

  async openArticle(article: Article): Promise<void> {
    try {
      const content = await this.apiService.fetchFileContent(article.id);
      this.currentArticleContent = content;

      const sanitizedTitle = article.title.replace(/[/\\:*?"<>|]/g, "");
      const fileName = `${sanitizedTitle}.md`;

      let file = this.app.vault.getAbstractFileByPath(fileName);

      if (file instanceof TFile) {
        await this.app.vault.modify(file, content);
      } else {
        file = await this.app.vault.create(fileName, content);
      }

      this.fileTracker.track(fileName, article.id);

      await this.openInSplit(file as TFile);
    } catch (error) {
      console.error("[SplitManager] Error opening article in split:", error);
      throw error;
    }
  }

  getArticleContent(): string | null {
    return this.currentArticleContent;
  }
}
