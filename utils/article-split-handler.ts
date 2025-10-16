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
      // Fetch article content from API
      const content = await this.apiService.fetchFileContent(article.id);

      // Sanitize article title for filename
      const sanitizedTitle = article.title.replace(/[/\\:*?"<>|]/g, "");
      const fileName = `${sanitizedTitle}.md`;

      // Get or create the file
      let file = this.app.vault.getAbstractFileByPath(fileName);

      if (file instanceof TFile) {
        // Update existing file
        await this.app.vault.modify(file, content);
      } else {
        // Create new file
        file = await this.app.vault.create(fileName, content);
      }

      // Track the file
      this.fileTracker.track(fileName, article.id);

      // Open in split or reuse existing split leaf
      if (this.articleSplitLeaf && this.articleSplitLeaf.view) {
        // Reuse existing split
        await this.articleSplitLeaf.openFile(file as TFile, {
          state: { mode: "preview" },
        });

        // Delete previous article file if tracked
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
        // Create new split
        const leaf = this.app.workspace.getLeaf("split");
        this.articleSplitLeaf = leaf;
        await leaf.openFile(file as TFile, { state: { mode: "preview" } });
      }

      // Update previous file reference
      this.previousArticleFile = file as TFile;

      console.log("Article opened in split:", article.title);
    } catch (error) {
      console.error("Error opening article in split:", error);
      throw error; // Re-throw so caller can handle if needed
    }
  }

  async cleanup(): Promise<void> {
    // Clean up article file if it was tracked
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

  // Optional: Method to close the split leaf
  closeSplit(): void {
    if (this.articleSplitLeaf) {
      this.articleSplitLeaf.detach();
      this.articleSplitLeaf = null;
    }
  }
}
