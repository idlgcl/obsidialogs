import { App, TFile, WorkspaceLeaf } from "obsidian";
import { ApiService } from "./api";
import { IdealogsFileTracker } from "./idealogs-file-tracker";
import { Article } from "../types";

export class ArticleSplitViewHandler {
  private app: App;
  private apiService: ApiService;
  private fileTracker: IdealogsFileTracker;
  private articleSplitLeaf: WorkspaceLeaf | null = null;
  private previousArticleFile: TFile | null = null;

  constructor(
    app: App,
    apiService: ApiService,
    fileTracker: IdealogsFileTracker
  ) {
    this.app = app;
    this.apiService = apiService;
    this.fileTracker = fileTracker;
  }

  async openArticle(article: Article): Promise<void> {
    try {
      const content = await this.apiService.fetchFileContent(article.id);

      const sanitizedTitle = article.title.replace(/[/\\:*?"<>|]/g, "");
      const fileName = `${sanitizedTitle}.md`;

      let file = this.app.vault.getAbstractFileByPath(fileName);

      if (file instanceof TFile) {
        await this.app.vault.modify(file, content);
      } else {
        file = await this.app.vault.create(fileName, content);
      }

      this.fileTracker.track(fileName, article.id);

      let isLeafValid = false;
      if (this.articleSplitLeaf && this.articleSplitLeaf.view) {
        try {
          isLeafValid = this.articleSplitLeaf.view.containerEl.isConnected;
        } catch {
          isLeafValid = false;
        }
      }

      if (isLeafValid) {
        await this.articleSplitLeaf?.openFile(file as TFile, {
          state: { mode: "preview" },
        });

        if (
          this.previousArticleFile &&
          this.fileTracker.isTracked(this.previousArticleFile.name)
        ) {
          try {
            await this.app.vault.delete(this.previousArticleFile);
            this.fileTracker.untrack(this.previousArticleFile.name);
          } catch (error) {
            console.error("Error deleting previous article file:", error);
          }
        }
      } else {
        const leaf = this.app.workspace.getLeaf("split");
        this.articleSplitLeaf = leaf;
        await leaf.openFile(file as TFile, { state: { mode: "preview" } });
      }

      this.previousArticleFile = file as TFile;

      console.log("Article opened in split:", article.title);
    } catch (error) {
      console.error("Error opening article in split:", error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    if (
      this.previousArticleFile &&
      this.fileTracker.isTracked(this.previousArticleFile.name)
    ) {
      try {
        await this.app.vault.delete(this.previousArticleFile);
        this.fileTracker.untrack(this.previousArticleFile.name);
      } catch (error) {
        console.error("Error cleaning up article file:", error);
      }
    }

    this.articleSplitLeaf = null;
    this.previousArticleFile = null;
  }

  closeSplit(): void {
    if (this.articleSplitLeaf) {
      this.articleSplitLeaf.detach();
      this.articleSplitLeaf = null;
    }
  }
}
