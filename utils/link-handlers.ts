import { App, TFile, MarkdownView } from "obsidian";
import { WRITING_LINK_PREFIX, COMMON_LINK_PREFIXES } from "../constants";
import { ApiService } from "./api";
import { IdealogsFileTracker } from "./idealogs-file-tracker";
import { AnnotationService, AnnotationData } from "./annotation-service";
import { AnnotationHighlighter } from "./annotation-highlighter";
import { SplitManager } from "./split-manager";

export class WritingLinkHandler {
  private app: App;
  private apiService: ApiService;
  private fileTracker: IdealogsFileTracker;
  private annotationService: AnnotationService;
  private annotationHighlighter: AnnotationHighlighter;
  private splitManager: SplitManager;

  constructor(
    app: App,
    apiService: ApiService,
    fileTracker: IdealogsFileTracker,
    annotationService: AnnotationService,
    annotationHighlighter: AnnotationHighlighter,
    splitManager: SplitManager
  ) {
    this.app = app;
    this.apiService = apiService;
    this.fileTracker = fileTracker;
    this.annotationService = annotationService;
    this.annotationHighlighter = annotationHighlighter;
    this.splitManager = splitManager;
  }

  async handleLink(
    linkText: string,
    sourcePath: string,
    isFromPreviewMode = false
  ): Promise<void> {
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

      // Open in split using the shared SplitManager
      await this.splitManager.openInSplit(file as TFile);

      // Commenting this out for now

      // const annotations = await this.annotationService.loadAnnotations(
      //   sourcePath
      // );
      // let noteToHighlight: AnnotationData | null = null;

      // for (const noteId in annotations.notes) {
      //   const note = annotations.notes[noteId];
      //   if (
      //     note.target === articleId ||
      //     note.target.includes(articleId) ||
      //     articleId.includes(note.target)
      //   ) {
      //     noteToHighlight = note;
      //     break;
      //   }
      // }

      // // Apply highlight after the file opens (only in preview mode)
      // if (noteToHighlight && noteToHighlight.target_txt && isFromPreviewMode) {
      //   const targetText = noteToHighlight.target_txt;
      //   setTimeout(() => {
      //     this.highlightTargetText(targetText);
      //   }, 1000);
      // }
    } catch (error) {
      console.error("[WritingLinkHandler] Error handling writing link:", error);
    }
  }

  private highlightTargetText(targetText: string): void {
    const splitLeaf = this.splitManager.getSplitLeaf();
    if (!splitLeaf || !splitLeaf.view) {
      console.warn("[WritingLinkHandler] No split leaf or view");
      return;
    }

    const view = splitLeaf.view;
    // @ts-ignore - accessing containerEl
    const container = view.containerEl?.querySelector(".markdown-preview-view");

    if (!container) {
      console.warn("[WritingLinkHandler] Could not find preview container");
      return;
    }

    // Find the target text in the DOM
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    let currentNode: Node | null;
    let nodesChecked = 0;
    while ((currentNode = walker.nextNode())) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      nodesChecked++;
      const textNode = currentNode as Text;
      const text = textNode.textContent || "";
      const index = text.indexOf(targetText);

      if (index !== -1) {
        const beforeText = text.substring(0, index);
        const matchText = text.substring(index, index + targetText.length);
        const afterText = text.substring(index + targetText.length);

        const span = document.createElement("span");
        span.className = "idl-target-flash";
        span.textContent = matchText;

        const fragment = document.createDocumentFragment();
        if (beforeText) {
          fragment.appendChild(document.createTextNode(beforeText));
        }
        fragment.appendChild(span);
        if (afterText) {
          fragment.appendChild(document.createTextNode(afterText));
        }

        textNode.parentNode?.replaceChild(fragment, textNode);

        span.scrollIntoView({ behavior: "smooth", block: "center" });

        setTimeout(() => {
          const textNode = document.createTextNode(matchText);
          span.parentNode?.replaceChild(textNode, span);
        }, 2000);

        break;
      }
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
    // Detect if preview mode
    let isFromPreviewMode = false;
    const activeView = app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      const mode = activeView.getMode();
      isFromPreviewMode = mode === "preview";
    }

    if (linktext.startsWith(WRITING_LINK_PREFIX)) {
      writingLinkHandler.handleLink(linktext, sourcePath, isFromPreviewMode);
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
