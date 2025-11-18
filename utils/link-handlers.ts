import { App, TFile } from "obsidian";
import { COMMON_LINK_PREFIXES, WRITING_LINK_PREFIX } from "../constants";
import { ApiService } from "./api";
import { FileTracker } from "./file-tracker";

export class CommonLinkHandler {
  private app: App;
  private apiService: ApiService;
  private fileTracker: FileTracker;
  private onTrackingChanged: () => void;

  constructor(
    app: App,
    apiService: ApiService,
    fileTracker: FileTracker,
    onTrackingChanged: () => void
  ) {
    this.app = app;
    this.apiService = apiService;
    this.fileTracker = fileTracker;
    this.onTrackingChanged = onTrackingChanged;
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

      // Track the file
      this.fileTracker.track(fileName, articleId);
      this.onTrackingChanged();

      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file as TFile);
    } catch (error) {
      console.error("Error handling common link:", error);
    }
  }
}

export function patchLinkOpening(
  app: App,
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
    for (const prefix of COMMON_LINK_PREFIXES) {
      if (linktext.startsWith(prefix)) {
        commonLinkHandler.handleLink(linktext, sourcePath);
        return;
      }
    }

    if (linktext.startsWith(WRITING_LINK_PREFIX)) {
      // Let main.createWritingClickExtension handle this
      return;
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
