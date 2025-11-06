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
  NoteLinkHandler,
  CommonLinkHandler,
  patchLinkOpening,
} from "./utils/link-handlers";
import { IdealogsFileTracker } from "./utils/idealogs-file-tracker";
import {
  CommentParser,
  Comment,
  NoteLinkInfo,
  detectNoteLink,
} from "./utils/parsers";
import {
  ANNOTATION_FORM_VIEW,
  AnnotationFormView,
} from "components/AnnotationFormView";
import {
  Annotation,
  AnnotationService,
  WebAnnotation,
} from "./utils/annotation-service";
import { AnnotationHighlighter } from "./utils/annotation-highlighter";
import { EditorView } from "@codemirror/view";
import { SplitManager } from "./utils/split-manager";

interface IdealogsSettings {
  enableLogs: boolean;
}

const DEFAULT_SETTINGS: IdealogsSettings = { enableLogs: false };

export default class IdealogsPlugin extends Plugin {
  settings: IdealogsSettings;
  apiService: ApiService;
  annotationService: AnnotationService;
  private articleSuggest: ArticleSuggest;
  private fileTracker: IdealogsFileTracker;
  private splitManager: SplitManager;
  private noteLinkHandler: NoteLinkHandler;
  private commonLinkHandler: CommonLinkHandler;
  private annotationHighlighter: AnnotationHighlighter;
  private restoreLinkOpening: (() => void) | null = null;
  private previousFile: TFile | null = null;
  private commentParser: CommentParser;
  private cursorCheckInterval: number | null = null;
  private lastCursorLine = -1;
  private lastCursorCh = -1;
  private editorChangeDebounceTimer: number | null = null;

  async onload() {
    await this.loadSettings();

    this.apiService = new ApiService();
    this.fileTracker = new IdealogsFileTracker();
    this.splitManager = new SplitManager(
      this.app,
      this.fileTracker,
      this.apiService
    );
    this.commentParser = new CommentParser();
    this.annotationService = new AnnotationService(this.app);
    this.annotationHighlighter = new AnnotationHighlighter(this.app);
    this.annotationHighlighter.setDependencies(
      this.apiService,
      this.fileTracker
    );

    this.noteLinkHandler = new NoteLinkHandler(
      this.app,
      this.apiService,
      this.fileTracker,
      this.annotationService,
      this.annotationHighlighter,
      this.splitManager
    );

    this.commonLinkHandler = new CommonLinkHandler(
      this.app,
      this.apiService,
      this.fileTracker
    );

    this.registerEditorExtension(this.createArticleTriggerExtension());
    this.registerEditorExtension(this.createCommentClickExtension());
    this.registerEditorExtension(this.createNoteClickExtension());

    this.registerView(ANNOTATION_FORM_VIEW, (leaf) => {
      const view = new AnnotationFormView(leaf);
      view.setSplitManager(this.splitManager);
      view.setAnnotationService(this.annotationService);
      view.setAnnotationHighlighter(this.annotationHighlighter);
      return view;
    });

    // Patches
    patchDefaultSuggester(this.app);

    this.restoreLinkOpening = patchLinkOpening(
      this.app,
      this.noteLinkHandler,
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

    // TODO : add it back
    // Validate annotations when file is modified
    // this.registerEvent(
    //   this.app.vault.on("modify", async (file) => {
    //     if (file instanceof TFile && file.extension === "md") {
    //       await this.annotationService.validateAllAnnotations(file.path);
    //     }
    //   })
    // );

    // Check cursor position every 200ms
    this.cursorCheckInterval = window.setInterval(() => {
      this.checkCursorInComment();
    }, 200);

    // TODO : add it back
    // markdown processor for annotation in preview/read mode only
    // this.registerMarkdownPostProcessor(async (el, ctx) => {
    //   await this.renderAnnotations(el, ctx.sourcePath);
    // });

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
      this.annotationHighlighter.transformAllIdealogsLinks(
        container,
        sourcePath
      );

      const annotations = await this.annotationService.loadAnnotations(
        sourcePath
      );

      const allAnnotations: Annotation[] = [];

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
          const charOffset = pos - line.from;

          const activeView = app.workspace.getActiveViewOfType(MarkdownView);
          if (!activeView?.file) {
            return false;
          }

          const commentWithPos = commentParser.findCommentAtPosition(
            lineText,
            charOffset,
            activeView.file.name,
            activeView.file.path
          );

          if (commentWithPos) {
            const commentText = lineText.substring(
              commentWithPos.startPos,
              commentWithPos.endPos
            );
            const titleEndPosInComment = commentText.indexOf(".");

            if (titleEndPosInComment !== -1) {
              const titleEndPos =
                commentWithPos.startPos + titleEndPosInComment;
              if (charOffset <= titleEndPos) {
                handleCommentTitleClick(commentWithPos);
                return true;
              }
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

          // check for note link
          if (!lineText.match(/\[\[@[TFI]x[^\]]+\]\]/)) {
            return false;
          }

          const activeView = app.workspace.getActiveViewOfType(MarkdownView);
          if (!activeView?.file) {
            return false;
          }

          const noteLinkInfo = detectNoteLink(
            lineText,
            activeView.file.name,
            activeView.file.path
          );

          if (noteLinkInfo) {
            const charOffset = pos - line.from;
            const linkStart = lineText.indexOf(noteLinkInfo.linkText);
            const linkEnd = linkStart + noteLinkInfo.linkText.length;

            if (charOffset >= linkStart && charOffset <= linkEnd) {
              handleNoteLinkClick(noteLinkInfo);
              // NoteLinkHandler also trigger
              return false;
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

  private async handleNoteLinkClick(noteLinkInfo: NoteLinkInfo): Promise<void> {
    // Search for existing annotation by link text
    const savedAnnotation = await this.annotationService.findNoteByLinkText(
      noteLinkInfo.filePath,
      noteLinkInfo.linkText
    );

    this.showNoteFormPanel(
      noteLinkInfo,
      savedAnnotation,
      !noteLinkInfo.hasTextAround
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
    const cursorCh = cursor.ch;

    // Check if cursor position changed (line OR character position)
    if (
      !force &&
      cursorLine === this.lastCursorLine &&
      cursorCh === this.lastCursorCh
    ) {
      return;
    }

    this.lastCursorLine = cursorLine;
    this.lastCursorCh = cursorCh;

    const file = activeView.file;
    if (!file) {
      return;
    }

    const lineText = editor.getLine(cursorLine);

    // Find comment at cursor position (supports multiple comments per line)
    const comment = this.commentParser.findCommentAtPosition(
      lineText,
      cursorCh,
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
    } else {
      const noteLinkInfo = detectNoteLink(lineText, file.name, file.path);
      if (noteLinkInfo) {
        const linkStart = lineText.indexOf(noteLinkInfo.linkText);
        const linkEnd = linkStart + noteLinkInfo.linkText.length;

        if (cursorCh >= linkStart && cursorCh <= linkEnd) {
          return;
        }
      }

      const existingPanels =
        this.app.workspace.getLeavesOfType(ANNOTATION_FORM_VIEW);
      if (existingPanels.length > 0) {
        const view = existingPanels[0].view as AnnotationFormView;
        if (view) {
          view.clear();
        }
      }
    }
  }

  private showAnnotationFormPanel(
    data: Comment,
    type: "comment",
    savedAnnotation: Annotation | null = null,
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
          active: false,
        });

        this.app.workspace.rightSplit.expand();
      }
    }

    if (rightLeaf) {
      const view = rightLeaf.view as AnnotationFormView;
      if (view) {
        view.updateComment(data as Comment, savedAnnotation, openTargetArticle);
      }
    }
  }

  private showNoteFormPanel(
    noteLinkInfo: NoteLinkInfo,
    savedAnnotation: WebAnnotation | null,
    hideSourceFields: boolean
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
          active: true,
        });

        this.app.workspace.rightSplit.expand();
      }
    }

    if (rightLeaf) {
      const view = rightLeaf.view as AnnotationFormView;
      if (view) {
        view.updateNoteWithLinkInfo(
          noteLinkInfo,
          savedAnnotation,
          hideSourceFields
        );
      }
    }
  }

  private async handleFileChange(): Promise<void> {
    // Clear processed containers when switching files to allow re-highlighting
    this.annotationHighlighter.clearProcessedContainers();

    const currentFile = this.app.workspace.getActiveFile();
    this.previousFile = currentFile;
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

    // Annotations section
    containerEl.createEl("h3", { text: "Annotations" });

    new Setting(containerEl)
      .setName("Migrate annotations to new format")
      .setDesc(
        "Convert old annotation files (snake_case with redundant id field) to the new format (camelCase without id). This is a one-time migration for existing annotations."
      )
      .addButton((button) =>
        button
          .setButtonText("Migrate annotations")
          .setCta()
          .onClick(async () => {
            button.setDisabled(true);
            button.setButtonText("Migrating...");

            try {
              const results =
                await this.plugin.annotationService.migrateAnnotationsToNewFormat();

              if (results.errors.length > 0) {
                new Notice(
                  `Migration completed with errors. Migrated: ${results.migrated}, Skipped: ${results.skipped}, Errors: ${results.errors.length}. Check console for details.`
                );
                console.error("[Idealogs] Migration errors:", results.errors);
              } else if (results.migrated === 0 && results.skipped === 0) {
                new Notice("No annotation files found to migrate");
              } else if (results.migrated === 0) {
                new Notice(
                  `All ${results.skipped} annotation files are already in the new format`
                );
              } else {
                new Notice(
                  `Successfully migrated ${results.migrated} annotation file(s). ${results.skipped} already in new format.`
                );
              }
            } catch (error) {
              new Notice(`Migration failed: ${error.message}`);
              console.error("[Idealogs] Migration error:", error);
            } finally {
              button.setDisabled(false);
              button.setButtonText("Migrate annotations");
            }
          })
      );
  }
}
