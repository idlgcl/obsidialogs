import { App, TFile } from "obsidian";
import { WRITING_LINK_PREFIX, COMMON_LINK_PREFIXES } from "../constants";
import { ApiService } from "./api";

export class WritingLinkHandler {
  handleLink(linkText: string, sourcePath: string): void {
    const id = linkText.substring(WRITING_LINK_PREFIX.length);

    console.log("Writing link clicked:", {
      fullLink: linkText,
      prefix: WRITING_LINK_PREFIX,
      id: id,
      sourcePath: sourcePath,
    });
  }
}

export class CommonLinkHandler {
  private app: App;
  private apiService: ApiService;

  constructor(app: App, apiService: ApiService) {
    this.app = app;
    this.apiService = apiService;
  }

  async handleLink(linkText: string, sourcePath: string): Promise<void> {
    try {
      const atIndex = linkText.indexOf("@");
      if (atIndex === -1) {
        console.error("Invalid link format:", linkText);
        return;
      }

      const articleId = linkText.substring(atIndex + 1);

      console.log("Common link clicked:", {
        fullLink: linkText,
        articleId: articleId,
        sourcePath: sourcePath,
      });

      await this.apiService.fetchArticleById(articleId);

      const content = await this.apiService.fetchFileContent(articleId);

      const fileName = `${articleId}.md`;

      let file = this.app.vault.getAbstractFileByPath(fileName);

      if (file instanceof TFile) {
        await this.app.vault.modify(file, content);
      } else {
        file = await this.app.vault.create(fileName, content);
      }

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
