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
import { AnnotationService, AnnotationData } from "./utils/annotation-service";
import { EditorView } from "@codemirror/view";

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

    this.registerEditorExtension(this.createCommentClickExtension());

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

  private createCommentClickExtension() {
    const handleCommentTitleClick = this.handleCommentTitleClick.bind(this);
    const app = this.app;
    const commentParser = new CommentParser();

    return EditorView.domEventHandlers({
      mousedown: (event: MouseEvent, view: EditorView) => {
        if (!event.ctrlKey && !event.metaKey) {
          return false;
        }

        try {
          const pos = view.posAtCoords({
            x: event.clientX,
            y: event.clientY,
          });

          if (pos === null) {
            return false;
          }

          const line = view.state.doc.lineAt(pos);
          const lineText = line.text;

          const activeView = app.workspace.getActiveViewOfType(MarkdownView);
          if (!activeView?.file) {
            return false;
          }

          const comment = commentParser.parseLineAsComment(
            lineText,
            activeView.file.name,
            activeView.file.path
          );

          if (comment) {
            const charOffset = pos - line.from;
            const titleEndPos = lineText.indexOf(".");

            if (titleEndPos !== -1 && charOffset <= titleEndPos) {
              handleCommentTitleClick(comment);
              return true;
            }
          }
        } catch (error) {
          console.error("[Idealogs] Error handling click:", error);
        }

        return false;
      },
    });
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

  private async handleCommentTitleClick(comment: Comment): Promise<void> {
    const words = comment.body.split(" ");
    const savedAnnotation = await this.annotationService.findCommentBySource(
      comment.filePath,
      comment.title,
      comment.title.split(" ")[0],
      words[words.length - 1]
    );

    if (savedAnnotation) {
      this.showCommentFormPanel(comment, savedAnnotation, true);
    }
  }

  private async checkCursorInComment(force = false): Promise<void> {
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
      const words = comment.body.split(" ");
      const savedAnnotation = await this.annotationService.findCommentBySource(
        file.path,
        comment.title,
        comment.title.split(" ")[0],
        words[words.length - 1]
      );
      this.showCommentFormPanel(comment, savedAnnotation);
    }
  }

  private showCommentFormPanel(
    comment: Comment,
    savedAnnotation: AnnotationData | null = null,
    openTargetArticle = false
  ): void {
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

        this.app.workspace.rightSplit.expand();
      }
    }

    if (rightLeaf) {
      const view = rightLeaf.view as CommentFormView;
      if (view && view.updateComment) {
        view.updateComment(comment, savedAnnotation, openTargetArticle);
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
