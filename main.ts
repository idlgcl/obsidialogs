import {
  Plugin,
  TFile,
  MarkdownView,
  PluginSettingTab,
  App,
  Setting,
  Notice,
} from "obsidian";
import { ArticleSuggest } from "./utils/suggester";
import { patchDefaultSuggester } from "./utils/suggest-patcher";
import { ApiService } from "./utils/api";
import { ArticleSearchModal } from "./components/ArticleSearchModal";
import {
  WritingLinkHandler,
  CommonLinkHandler,
  patchLinkOpening,
} from "./utils/link-handlers";
import { IdealogsFileTracker } from "./utils/idealogs-file-tracker";
import { CommentParser, Comment, NoteParser, NoteMeta } from "./utils/parsers";
import {
  ANNOTATION_FORM_VIEW,
  AnnotationFormView,
} from "components/AnnotationFormView";
import { ArticleSplitViewHandler } from "./utils/article-split-handler";
import { AnnotationService, AnnotationData } from "./utils/annotation-service";
import { AnnotationHighlighter } from "./utils/annotation-highlighter";
import { EditorView } from "@codemirror/view";

interface IdealogsSettings {
  enableLogs: boolean;
}

const DEFAULT_SETTINGS: IdealogsSettings = { enableLogs: false };

export default class IdealogsPlugin extends Plugin {
  settings: IdealogsSettings;
  apiService: ApiService; // Public for settings tab access
  private articleSuggest: ArticleSuggest;
  private fileTracker: IdealogsFileTracker;
  private writingLinkHandler: WritingLinkHandler;
  private commonLinkHandler: CommonLinkHandler;
  private articleSplitHandler: ArticleSplitViewHandler;
  private annotationService: AnnotationService;
  private annotationHighlighter: AnnotationHighlighter;
  private restoreLinkOpening: (() => void) | null = null;
  private previousFile: TFile | null = null;
  private commentParser: CommentParser;
  private noteParser: NoteParser;
  private cursorCheckInterval: number | null = null;
  private lastCursorLine = -1;
  private editorChangeDebounceTimer: number | null = null;

  async onload() {
    await this.loadSettings();

    this.apiService = new ApiService();
    this.fileTracker = new IdealogsFileTracker();
    this.commentParser = new CommentParser();
    this.noteParser = new NoteParser();
    this.annotationService = new AnnotationService(this.app);
    this.annotationHighlighter = new AnnotationHighlighter(this.app);
    this.annotationHighlighter.setDependencies(
      this.apiService,
      this.fileTracker
    );
    this.writingLinkHandler = new WritingLinkHandler(
      this.app,
      this.apiService,
      this.fileTracker,
      this.annotationService,
      this.annotationHighlighter
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

    // just in case we bring it back
    // this.articleSuggest = new ArticleSuggest(this, this.apiService);
    // this.registerEditorSuggest(this.articleSuggest);

    this.registerEditorExtension(this.createArticleTriggerExtension());
    this.registerEditorExtension(this.createCommentClickExtension());
    this.registerEditorExtension(this.createNoteClickExtension());

    this.registerView(ANNOTATION_FORM_VIEW, (leaf) => {
      const view = new AnnotationFormView(leaf);
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

    // markdown processor for annotation in preview/read mode only
    this.registerMarkdownPostProcessor(async (el, ctx) => {
      await this.renderAnnotations(el, ctx.sourcePath);
    });

    // Settings tab
    this.addSettingTab(new IdealogsSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private async renderAnnotations(
    container: HTMLElement,
    sourcePath: string
  ): Promise<void> {
    try {
      const annotations = await this.annotationService.loadAnnotations(
        sourcePath
      );

      const allAnnotations: AnnotationData[] = [];

      for (const commentId in annotations.comments) {
        allAnnotations.push(annotations.comments[commentId]);
      }

      for (const noteId in annotations.notes) {
        allAnnotations.push(annotations.notes[noteId]);
      }

      if (allAnnotations.length > 0) {
        this.annotationHighlighter.highlightAnnotations(
          container,
          allAnnotations
        );
      }
    } catch (error) {
      console.error("[Idealogs] Error rendering annotations:", error);
    }
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

  private createNoteClickExtension() {
    const handleNoteLinkClick = this.handleNoteLinkClick.bind(this);
    const app = this.app;
    const noteParser = this.noteParser;

    return EditorView.domEventHandlers({
      mousedown: (event: MouseEvent, view: EditorView) => {
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

          // Check if line contains a note link pattern
          if (!lineText.match(/\[\[@Tx[^\]]+\]\]/)) {
            return false;
          }

          const activeView = app.workspace.getActiveViewOfType(MarkdownView);
          if (!activeView?.file) {
            return false;
          }

          const note = noteParser.parseLineAsNote(
            lineText,
            activeView.file.name,
            activeView.file.path
          );

          if (note) {
            // Check if click is within the note link
            const linkPattern = /\[\[@(Tx[^\]]+)\]\]/g;
            let match;
            const charOffset = pos - line.from;

            while ((match = linkPattern.exec(lineText)) !== null) {
              const linkStart = match.index;
              const linkEnd = match.index + match[0].length;

              if (charOffset >= linkStart && charOffset <= linkEnd) {
                handleNoteLinkClick(note);
                event.preventDefault();
                return true;
              }
            }
          }
        } catch (error) {
          console.error("[Idealogs] Error handling note click:", error);
        }

        return false;
      },
    });
  }

  private createArticleTriggerExtension() {
    const app = this.app;
    const apiService = this.apiService;

    return EditorView.domEventHandlers({
      keydown: (event: KeyboardEvent, view: EditorView) => {
        // Only trigger on '@' key
        if (event.key !== "@") {
          return false;
        }

        try {
          const pos = view.state.selection.main.head;
          const line = view.state.doc.lineAt(pos);
          const lineText = line.text;
          const charOffset = pos - line.from;

          const textBeforeCursor = lineText.substring(0, charOffset);
          if (!textBeforeCursor.endsWith("[[")) {
            return false;
          }

          const activeView = app.workspace.getActiveViewOfType(MarkdownView);
          if (!activeView?.editor) {
            return false;
          }

          const editor = activeView.editor;
          const cursor = editor.getCursor();

          // Type '@' then open modal
          setTimeout(() => {
            const currentLine = editor.getLine(cursor.line);
            const beforeCursor = currentLine.substring(0, cursor.ch + 1);

            if (beforeCursor.endsWith("[[@")) {
              // Remove  '[[@]]'
              editor.replaceRange(
                "",
                { line: cursor.line, ch: cursor.ch - 2 },
                { line: cursor.line, ch: cursor.ch + 3 }
              );

              const modal = new ArticleSearchModal(app, apiService, editor, {
                line: cursor.line,
                ch: cursor.ch - 2,
              });
              modal.open();
            }
          }, 0);

          return false;
        } catch (error) {
          console.error("[Idealogs] Error handling article trigger:", error);
          return false;
        }
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
      this.showAnnotationFormPanel(comment, "comment", savedAnnotation, true);
    }
  }

  private async handleNoteLinkClick(note: NoteMeta): Promise<void> {
    const savedAnnotation = await this.annotationService.findNoteBySource(
      note.filePath,
      note.linkText,
      note.previousWords
    );

    this.showAnnotationFormPanel(
      note,
      "note",
      savedAnnotation,
      !!savedAnnotation
    );
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
      this.showAnnotationFormPanel(comment, "comment", savedAnnotation);
    }
  }

  private showAnnotationFormPanel(
    data: Comment | NoteMeta,
    type: "comment" | "note",
    savedAnnotation: AnnotationData | null = null,
    openTargetArticle = false
  ): void {
    const existingRightPanelLeaves =
      this.app.workspace.getLeavesOfType(ANNOTATION_FORM_VIEW);

    let rightLeaf;
    if (existingRightPanelLeaves.length > 0) {
      rightLeaf = existingRightPanelLeaves[0];
    } else {
      rightLeaf = this.app.workspace.getRightLeaf(false);
      if (rightLeaf) {
        rightLeaf.setViewState({
          type: ANNOTATION_FORM_VIEW,
          active: type === "note" ? true : false,
        });

        this.app.workspace.rightSplit.expand();
      }
    }

    if (rightLeaf) {
      const view = rightLeaf.view as AnnotationFormView;
      if (view) {
        if (type === "comment") {
          view.updateComment(
            data as Comment,
            savedAnnotation,
            openTargetArticle
          );
        } else {
          view.updateNote(data as NoteMeta, savedAnnotation, openTargetArticle);
          // view.setState({ active: true });
        }
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

    // Clear processed containers when switching files to allow re-highlighting
    this.annotationHighlighter.clearProcessedContainers();

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

class IdealogsSettingTab extends PluginSettingTab {
  plugin: IdealogsPlugin;

  constructor(app: App, plugin: IdealogsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h2", { text: "Idealogs Settings" });

    // Cache section
    containerEl.createEl("h3", { text: "Cache" });

    new Setting(containerEl)
      .setName("Clear API cache")
      .setDesc(
        "Clear all cached API responses. Use this if you're seeing stale data or want to force fresh data from the server."
      )
      .addButton((button) =>
        button
          .setButtonText("Clear cache")
          .setCta()
          .onClick(() => {
            this.plugin.apiService.clearCache();
            new Notice("API cache cleared successfully");
          })
      );
  }
}
