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

export default class IdealogsPlugin extends Plugin {
  private articleSuggest: ArticleSuggest;
  private apiService: ApiService;
  private fileTracker: IdealogsFileTracker;
  private writingLinkHandler: WritingLinkHandler;
  private commonLinkHandler: CommonLinkHandler;
  private restoreLinkOpening: (() => void) | null = null;
  private previousFile: TFile | null = null;
  private commentParser: CommentParser;
  private cursorCheckInterval: number | null = null;
  private lastCursorLine = -1;
  private editorChangeDebounceTimer: number | null = null;
  private commentFormRevealed = false;

  async onload() {
    this.apiService = new ApiService();
    this.fileTracker = new IdealogsFileTracker();
    this.commentParser = new CommentParser();
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

    this.articleSuggest = new ArticleSuggest(this, this.apiService);
    this.registerEditorSuggest(this.articleSuggest);

    // Views
    this.registerView(COMMENT_FORM_VIEW, (leaf) => new CommentFormView(leaf));

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

    // Track when CommentFormView becomes active/revealed
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.checkCommentFormVisibility();
      })
    );

    // Check cursor position every 200ms
    this.cursorCheckInterval = window.setInterval(() => {
      this.checkCursorInComment();
    }, 200);
  }

  private checkCommentFormVisibility(): void {
    const existingRightPanelLeaves =
      this.app.workspace.getLeavesOfType(COMMENT_FORM_VIEW);

    // If no leaves exist, the user manually closed the panel
    if (existingRightPanelLeaves.length === 0) {
      this.commentFormRevealed = false;
    }
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
      this.closeCommentFormPanel();
      return;
    }

    const mode = activeView.getMode();
    if (mode !== "source") {
      this.closeCommentFormPanel();
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
      this.closeCommentFormPanel();
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
    } else {
      this.closeCommentFormPanel();
    }
  }

  private showCommentFormPanel(comment: Comment): void {
    const existingRightPanelLeaves =
      this.app.workspace.getLeavesOfType(COMMENT_FORM_VIEW);

    let rightLeaf;
    if (existingRightPanelLeaves.length > 0) {
      console.log("Using existing leaf");
      rightLeaf = existingRightPanelLeaves[0];
      // Mark as revealed since panel already exists
      this.commentFormRevealed = true;
    } else {
      rightLeaf = this.app.workspace.getRightLeaf(false);
      if (rightLeaf) {
        rightLeaf.setViewState({
          type: COMMENT_FORM_VIEW,
          active: false,
        });

        // Automatically reveal the right sidebar to show the panel
        this.app.workspace.rightSplit.expand();

        this.commentFormRevealed = true;
      }
    }

    if (rightLeaf) {
      const view = rightLeaf.view as CommentFormView;
      if (view && view.updateComment) {
        view.updateComment(comment);
      }
    }
  }

  private closeCommentFormPanel(force = false): void {
    // Don't auto-close if the panel has been manually revealed by the user (unless forced)
    if (!force && this.commentFormRevealed) {
      return;
    }

    const existingRightPanelLeaves =
      this.app.workspace.getLeavesOfType(COMMENT_FORM_VIEW);

    if (existingRightPanelLeaves.length > 0) {
      existingRightPanelLeaves.forEach((leaf) => leaf.detach());
      console.log("Panel detached");
    }

    this.commentFormRevealed = false;
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

      // Reset revealed state when switching files
      this.commentFormRevealed = false;
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
