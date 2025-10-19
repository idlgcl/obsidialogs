import { App, TFile, WorkspaceLeaf } from "obsidian";
import { WRITING_LINK_PREFIX, COMMON_LINK_PREFIXES } from "../constants";
import { ApiService } from "./api";
import { IdealogsFileTracker } from "./idealogs-file-tracker";

export class WritingLinkHandler {
  private app: App;
  private apiService: ApiService;
  private fileTracker: IdealogsFileTracker;
  private writingSplitLeaf: WorkspaceLeaf | null = null;
  private previousWritingFile: TFile | null = null;

  constructor(
    app: App,
    apiService: ApiService,
    fileTracker: IdealogsFileTracker
  ) {
    this.app = app;
    this.apiService = apiService;
    this.fileTracker = fileTracker;
  }

  async handleLink(linkText: string, sourcePath: string): Promise<void> {
    try {
      const atIndex = linkText.indexOf("@");
      if (atIndex === -1) {
        console.error("Invalid link format:", linkText);
        return;
      }

      const articleId = linkText.substring(atIndex + 1);

      const articleData = await this.apiService.fetchArticleById(articleId);

      const content = await this.apiService.fetchFileContent(articleId);

      const sanitizedTitle = articleData.title.replace(/[/\\:*?"<>|]/g, "");
      const fileName = `${sanitizedTitle}.md`;

      let file = this.app.vault.getAbstractFileByPath(fileName);

      if (file instanceof TFile) {
        await this.app.vault.modify(file, content);
      } else {
        file = await this.app.vault.create(fileName, content);
      }

      this.fileTracker.track(fileName, articleId);

      let isLeafValid = false;
      if (this.writingSplitLeaf && this.writingSplitLeaf.view) {
        try {
          isLeafValid = this.writingSplitLeaf.view.containerEl.isConnected;
        } catch (error) {
          isLeafValid = false;
        }
      }

      // Store the old file reference
      const fileToDelete = this.previousWritingFile;

      // Update the current file reference
      this.previousWritingFile = file as TFile;

      if (isLeafValid) {
        console.log("[WritingLinkHandler] Reusing existing split leaf");
        await this.writingSplitLeaf?.openFile(file as TFile, {
          state: { mode: "preview" },
        });

        // Delete the old file
        if (
          fileToDelete &&
          this.fileTracker.isTracked(fileToDelete.name) &&
          fileToDelete.name !== (file as TFile).name
        ) {
          try {
            await this.app.vault.delete(fileToDelete);
            this.fileTracker.untrack(fileToDelete.name);
          } catch (error) {
            console.error(
              "[WritingLinkHandler] Error deleting previous writing file:",
              error
            );
          }
        }
      } else {
        const leaf = this.app.workspace.getLeaf("split");
        this.writingSplitLeaf = leaf;
        await leaf.openFile(file as TFile, { state: { mode: "preview" } });
      }
    } catch (error) {
      console.error("[WritingLinkHandler] Error handling writing link:", error);
    }
  }
}

export class CommonLinkHandler {
  private app: App;
  private apiService: ApiService;
  private fileTracker: IdealogsFileTracker;

  constructor(
    app: App,
    apiService: ApiService,
    fileTracker: IdealogsFileTracker
  ) {
    this.app = app;
    this.apiService = apiService;
    this.fileTracker = fileTracker;
  }

  async handleLink(linkText: string, sourcePath: string): Promise<void> {
    try {
      const atIndex = linkText.indexOf("@");
      if (atIndex === -1) {
        console.error("Invalid link format:", linkText);
        return;
      }

      const articleId = linkText.substring(atIndex + 1);

      const articleData = await this.apiService.fetchArticleById(articleId);

      const content = await this.apiService.fetchFileContent(articleId);

      const sanitizedTitle = articleData.title.replace(/[/\\:*?"<>|]/g, "");
      const fileName = `${sanitizedTitle}.md`;

      let file = this.app.vault.getAbstractFileByPath(fileName);

      if (file instanceof TFile) {
        await this.app.vault.modify(file, content);
      } else {
        file = await this.app.vault.create(fileName, content);
      }

      this.fileTracker.track(fileName, articleId);

      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file as TFile);
    } catch (error) {
      console.error("Error handling common link:", error);
    }
  }
}

export function patchLinkOpening(
  app: App,
  writingLinkHandler: WritingLinkHandler,
  commonLinkHandler: CommonLinkHandler // Questions & Insights
): () => void {
  const workspace = app.workspace;
  const originalOpenLinkText = workspace.openLinkText;

  // @ts-ignore
  workspace.openLinkText = function (
    linktext: string,
    sourcePath: string,
    newLeaf?: boolean,
    openViewState?: unknown
  ) {
    if (linktext.startsWith(WRITING_LINK_PREFIX)) {
      writingLinkHandler.handleLink(linktext, sourcePath);
      return;
    }

    for (const prefix of COMMON_LINK_PREFIXES) {
      if (linktext.startsWith(prefix)) {
        commonLinkHandler.handleLink(linktext, sourcePath);
        return;
      }
    }

    // Fall back to default link handling
    return originalOpenLinkText.call(
      workspace,
      linktext,
      sourcePath,
      newLeaf,
      openViewState
    );
  };

  // Return cleanup function to restore default behavior
  return () => {
    workspace.openLinkText = originalOpenLinkText;
  };
}
