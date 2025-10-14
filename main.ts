import { Plugin, TFile } from "obsidian";
import { ArticleSuggest } from "./components/suggester";
import { patchDefaultSuggester } from "./utils/suggest-patcher";
import { ApiService } from "./utils/api";
import {
  WritingLinkHandler,
  CommonLinkHandler,
  patchLinkOpening,
} from "./utils/link-handlers";

export default class IdealogsPlugin extends Plugin {
  private articleSuggest: ArticleSuggest;
  private apiService: ApiService;
  private writingLinkHandler: WritingLinkHandler;
  private commonLinkHandler: CommonLinkHandler;
  private restoreLinkOpening: (() => void) | null = null;
  private previousFile: TFile | null = null;

  async onload() {
    this.apiService = new ApiService();
    this.writingLinkHandler = new WritingLinkHandler();
    this.commonLinkHandler = new CommonLinkHandler(this.app, this.apiService);

    this.articleSuggest = new ArticleSuggest(this, this.apiService);
    this.registerEditorSuggest(this.articleSuggest);

    patchDefaultSuggester(this.app);

    this.restoreLinkOpening = patchLinkOpening(
      this.app,
      this.writingLinkHandler,
      this.commonLinkHandler
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.handleFileChange();
      })
    );
  }

  private async handleFileChange(): Promise<void> {
    const currentFile = this.app.workspace.getActiveFile();

    if (this.previousFile && this.previousFile !== currentFile) {
      const isStillOpen = this.app.workspace
        .getLeavesOfType("markdown")
        .some((leaf) => {
          const file = leaf.view.getState()?.file;
          return file === this.previousFile?.path;
        });

      if (!isStillOpen && this.isIdealogsArticle(this.previousFile.basename)) {
        try {
          await this.app.vault.delete(this.previousFile);
        } catch (error) {
          console.error("Error deleting Idealogs article:", error);
        }
      }
    }

    this.previousFile = currentFile;
  }

  private isIdealogsArticle(basename: string): boolean {
    return /^(Tx|Fx|Ix)/.test(basename);
  }

  onunload() {
    // Restore original openLinkText function
    if (this.restoreLinkOpening) {
      this.restoreLinkOpening();
    }
  }
}
