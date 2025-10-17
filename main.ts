import { Plugin, TFile, MarkdownView } from "obsidian";
import { ArticleSuggest } from "./utils/suggester";
import { patchDefaultSuggester } from "./utils/suggest-patcher";
import { ApiService } from "./utils/api";
import {
  WritingLinkHandler,
  CommonLinkHandler,
  patchLinkOpening,
} from "./utils/link-handlers";
import { IdealogsFileTracker } from "./utils/idealogs-file-tracker";
import { CommentParser, Comment } from "./utils/parsers";
import { COMMENT_FORM_VIEW, CommentFormView } from "components/CommentForm";
import { ArticleSplitViewHandler } from "./utils/article-split-handler";
import { AnnotationService } from "./utils/annotation-service";

export default class IdealogsPlugin extends Plugin {
  private articleSuggest: ArticleSuggest;
  private apiService: ApiService;
  private fileTracker: IdealogsFileTracker;
  private writingLinkHandler: WritingLinkHandler;
  private commonLinkHandler: CommonLinkHandler;
  private articleSplitHandler: ArticleSplitViewHandler;
  private annotationService: AnnotationService;
  private restoreLinkOpening: (() => void) | null = null;
  private previousFile: TFile | null = null;
  private commentParser: CommentParser;
  private cursorCheckInterval: number | null = null;
  private lastCursorLine = -1;
  private editorChangeDebounceTimer: number | null = null;

  async onload() {
    this.apiService = new ApiService();
    this.fileTracker = new IdealogsFileTracker();
    this.commentParser = new CommentParser();
    this.annotationService = new AnnotationService(this.app);
    this.writingLinkHandler = new WritingLinkHandler(
      this.app,
      this.apiService,
      this.fileTracker
    );
    this.commonLinkHandler = new CommonLinkHandler(
      this.app,
      this.apiService,
      this.fileTracker
    );
    this.articleSplitHandler = new ArticleSplitViewHandler(
      this.app,
      this.apiService,
      this.fileTracker
    );

    this.articleSuggest = new ArticleSuggest(this, this.apiService);
    this.registerEditorSuggest(this.articleSuggest);

    this.registerView(COMMENT_FORM_VIEW, (leaf) => {
      const view = new CommentFormView(leaf);
      view.setArticleSplitHandler(this.articleSplitHandler);
      view.setAnnotationService(this.annotationService);
      return view;
    });

    // Patches
    patchDefaultSuggester(this.app);

    this.restoreLinkOpening = patchLinkOpening(
      this.app,
      this.writingLinkHandler,
      this.commonLinkHandler
    );

    // Events
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.handleFileChange();
      })
    );

    this.registerEvent(
      this.app.workspace.on("editor-change", () => {
        this.debouncedCheckCursorInComment();
      })
    );

    // Check cursor position every 200ms
    this.cursorCheckInterval = window.setInterval(() => {
      this.checkCursorInComment();
    }, 200);
  }

  private debouncedCheckCursorInComment(): void {
    if (this.editorChangeDebounceTimer !== null) {
      window.clearTimeout(this.editorChangeDebounceTimer);
    }

    this.editorChangeDebounceTimer = window.setTimeout(() => {
      this.checkCursorInComment(true);
      this.editorChangeDebounceTimer = null;
    }, 500);
  }

  private checkCursorInComment(force = false): void {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

    if (!activeView) {
      return;
    }

    const mode = activeView.getMode();
    if (mode !== "source") {
      return;
    }

    const editor = activeView.editor;
    const cursor = editor.getCursor();
    const cursorLine = cursor.line;

    // Skip if line hasn't changed (unless forced)
    if (!force && cursorLine === this.lastCursorLine) {
      return;
    }

    this.lastCursorLine = cursorLine;

    const file = activeView.file;
    if (!file) {
      return;
    }

    const lineText = editor.getLine(cursorLine);

    const comment = this.commentParser.parseLineAsComment(
      lineText,
      file.name,
      file.path
    );

    if (comment) {
      this.showCommentFormPanel(comment);
    }
  }

  private showCommentFormPanel(comment: Comment): void {
    const existingRightPanelLeaves =
      this.app.workspace.getLeavesOfType(COMMENT_FORM_VIEW);

    let rightLeaf;
    if (existingRightPanelLeaves.length > 0) {
      rightLeaf = existingRightPanelLeaves[0];
    } else {
      rightLeaf = this.app.workspace.getRightLeaf(false);
      if (rightLeaf) {
        rightLeaf.setViewState({
          type: COMMENT_FORM_VIEW,
          active: false,
        });

        // Automatically reveal the right sidebar to show the panel
        this.app.workspace.rightSplit.expand();
      }
    }

    if (rightLeaf) {
      const view = rightLeaf.view as CommentFormView;
      if (view && view.updateComment) {
        view.updateComment(comment);
      }
    }
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

      if (!isStillOpen && this.isIdealogsArticle(this.previousFile.name)) {
        try {
          await this.app.vault.delete(this.previousFile);
          this.fileTracker.untrack(this.previousFile.name);
        } catch (error) {
          console.error("Error deleting Idealogs article:", error);
        }
      }
    }

    this.previousFile = currentFile;
  }

  private isIdealogsArticle(fileName: string): boolean {
    return this.fileTracker.isTracked(fileName);
  }

  onunload() {
    // Restore original openLinkText function
    if (this.restoreLinkOpening) {
      this.restoreLinkOpening();
    }

    // Clear cursor check interval
    if (this.cursorCheckInterval !== null) {
      window.clearInterval(this.cursorCheckInterval);
    }
  }
}
