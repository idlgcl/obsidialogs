import {
  Plugin,
  PluginSettingTab,
  App,
  Setting,
  Notice,
  MarkdownView,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import { EditorView } from "@codemirror/view";
import { ApiService } from "./utils/api";
import { ArticleSearchModal } from "./components/ArticleSearchModal";
import { CommonLinkHandler, patchLinkOpening } from "./utils/link-handlers";
import { FileTracker } from "./utils/file-tracker";
import { FileDeletionManager } from "./utils/file-deletion-manager";
import { CommentParser } from "./utils/parsers";
import { FormView, FORM_VIEW_TYPE } from "./components/FormView";
import { WritingView, WRITING_VIEW_TYPE } from "./components/WritingView";
import { Logger } from "./utils/logger";
import { Article } from "./types";
import {
  AnnotationService,
  Annotation,
  MigrationResult,
} from "./utils/annotation-service";
import { LinkTransformer } from "./utils/link-transformer";
import { findTextQuote } from "./utils/text-finder";

interface IdealogsSettings {
  enableLogs: boolean;
  trackedFiles?: object;
  deletionDelay?: number;
}

const DEFAULT_SETTINGS: IdealogsSettings = {
  enableLogs: false,
  trackedFiles: {},
  deletionDelay: 5,
};

export default class IdealogsPlugin extends Plugin {
  settings: IdealogsSettings;
  apiService: ApiService;
  annotationService: AnnotationService;
  fileTracker: FileTracker;
  fileDeletionManager: FileDeletionManager;
  commonLinkHandler: CommonLinkHandler;
  logger: Logger;
  linkTransformer: LinkTransformer;
  private cleanupLinkPatching: () => void;
  private commentParser: CommentParser;
  private cursorCheckInterval: number | null = null;
  private lastCursorLine = -1;
  private lastCursorCh = -1;
  private editorChangeDebounceTimer: number | null = null;

  async onload() {
    await this.loadSettings();

    // Initialize logger
    this.logger = new Logger();

    // Register FormView
    this.registerView(FORM_VIEW_TYPE, (leaf) => new FormView(leaf));

    // Register WritingView
    this.registerView(WRITING_VIEW_TYPE, (leaf) => new WritingView(leaf));

    // Initialize core services
    this.apiService = new ApiService();
    this.annotationService = new AnnotationService(this.app);
    this.linkTransformer = new LinkTransformer();

    // Register markdown post processor for reading mode
    this.registerMarkdownPostProcessor(async (element, context) => {
      const file = context.sourcePath;
      if (!file) return;

      // Get article ID
      const articleId = file.split("/").pop()?.replace(".md", "") || "";

      // Load annotations for this file
      const annotations = await this.annotationService.getAnnotations(file);

      // Build a map of targetId -> notes without source (for WritingLink flash)
      const notesWithoutSource: Map<string, Annotation[]> = new Map();
      for (const noteId in annotations.notes) {
        const note = annotations.notes[noteId];
        if (note.isValid && !note.sourceDisplay) {
          const existing = notesWithoutSource.get(note.targetId) || [];
          existing.push(note);
          notesWithoutSource.set(note.targetId, existing);
        }
      }

      // Transform links in reading mode with flash support for notes without source
      this.linkTransformer.transformLinks(
        element,
        articleId,
        (targetArticleId) => {
          // Check if there's a note without source for this target
          const notes = notesWithoutSource.get(targetArticleId);
          const targetText =
            notes && notes.length > 0 ? notes[0].targetText : undefined;

          this.handleWritingLinkClick(
            targetArticleId,
            true,
            "",
            -1,
            null,
            false
          );

          // Flash the target text if we have a note
          if (targetText) {
            setTimeout(() => {
              const writingView = this.getWritingView();
              if (writingView) {
                writingView.flashText(targetText);
              }
            }, 100);
          }
        }
      );

      // Process comments - bold sourceDisplay with click handler
      for (const commentId in annotations.comments) {
        const comment = annotations.comments[commentId];
        if (comment.isValid && comment.sourceDisplay) {
          this.wrapAnnotationWords(
            element,
            comment,
            async () => {
              await this.showTargetAndFlash(
                comment.targetId,
                comment.targetText
              );
            }
          );
        }
      }

      // // Process notes with source - bold sourceDisplay with click handler
      // for (const noteId in annotations.notes) {
      //   const note = annotations.notes[noteId];
      //   if (note.isValid && note.sourceDisplay) {
      //     this.wrapAnnotationSourceText(
      //       element,
      //       note.sourceDisplay,
      //       async () => {
      //         await this.showTargetAndFlash(note.targetId, note.targetText);
      //       }
      //     );
      //   }
      // }
    });

    // Initialize file tracker
    this.fileTracker = new FileTracker();
    this.fileTracker.fromJSON(this.settings.trackedFiles || {});

    // Initialize file deletion manager
    this.fileDeletionManager = new FileDeletionManager(
      this.app,
      this.fileTracker,
      () => this.settings.deletionDelay || 5,
      () => this.saveTracking()
    );

    // Initialize comment parser
    this.commentParser = new CommentParser();

    // Initialize link handlers
    this.commonLinkHandler = new CommonLinkHandler(
      this.app,
      this.apiService,
      this.fileTracker,
      () => this.saveTracking()
    );
    this.cleanupLinkPatching = patchLinkOpening(
      this.app,
      this.commonLinkHandler
    );

    // CodeMirror extensions
    this.registerEditorExtension(this.createArticleLookupExtension());
    this.registerEditorExtension(this.createWritingClickExtension());
    this.registerEditorExtension(this.createPasteHandlerExtension());

    // Settings tab
    this.addSettingTab(new IdealogsSettingTab(this.app, this));

    // Automatically open FormView in right panel
    this.app.workspace.onLayoutReady(() => {
      this.activateFormView();
    });

    this.registerEvent(
      this.app.workspace.on("file-open", (file: TFile | null) => {
        if (file && this.fileTracker.isTracked(file.name)) {
          // Cancel any pending deletion for this file
          this.fileDeletionManager.cancelDeletion(file.name);

          this.fileTracker.updateLastAccessed(file.name);
          this.saveTracking();
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.fileDeletionManager.checkAllTrackedFiles();
      })
    );

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.fileDeletionManager.checkAllTrackedFiles();
      })
    );

    // Validate annotations when file is modified
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (file instanceof TFile && file.extension === "md") {
          await this.annotationService.validateAllAnnotations(file.path);
        }
      })
    );

    // Comment detection
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

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async saveTracking() {
    this.settings.trackedFiles = this.fileTracker.toJSON();
    await this.saveSettings();
  }

  async activateFormView(): Promise<void> {
    const { workspace } = this.app;

    // Check if FormView already exists
    const existingLeaves = workspace.getLeavesOfType(FORM_VIEW_TYPE);
    if (existingLeaves.length > 0) {
      const formView = this.getFormView();
      if (formView) {
        formView.setServices(this.apiService, this.annotationService);
        formView.setOnArticleSelected((article) =>
          this.handleArticleSelected(article)
        );
        formView.setOnFlashText((text) => {
          const writingView = this.getWritingView();
          if (writingView) {
            writingView.flashText(text);
          }
        });
      }
      return;
    }

    // Create new FormView
    let leaf = workspace.getRightLeaf(false);
    if (!leaf) {
      leaf = workspace.getRightLeaf(true);
    }

    if (leaf) {
      await leaf.setViewState({
        type: FORM_VIEW_TYPE,
        active: false,
      });

      const formView = this.getFormView();
      if (formView) {
        formView.setServices(this.apiService, this.annotationService);
        formView.setOnArticleSelected((article) =>
          this.handleArticleSelected(article)
        );
        formView.setOnFlashText((text) => {
          const writingView = this.getWritingView();
          if (writingView) {
            writingView.flashText(text);
          }
        });
      }
    }
  }

  getFormView(): FormView | null {
    const leaves = this.app.workspace.getLeavesOfType(FORM_VIEW_TYPE);
    if (leaves.length > 0) {
      const view = leaves[0].view;
      if (view instanceof FormView) {
        return view;
      }
    }
    return null;
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

    // Check if cursor position changed
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

    // Find comment at cursor position
    const comment = this.commentParser.findCommentAtPosition(
      lineText,
      cursorCh,
      file.name,
      file.path
    );

    if (comment) {
      if (this.settings.enableLogs) {
        this.logger.log("Comment detected", {
          title: comment.title,
          body: comment.body,
          filePath: comment.filePath,
          line: cursorLine,
          cursorChar: cursorCh,
          startPos: comment.startPos,
          endPos: comment.endPos,
          lineText: lineText,
        });
      }

      // Update FormView if it exists
      const formView = this.getFormView();
      if (formView) {
        formView.updateComment(comment);
      }
    }
  }

  private createArticleLookupExtension() {
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
              // Remove '[[@]]'
              editor.replaceRange(
                "",
                { line: cursor.line, ch: cursor.ch - 2 },
                { line: cursor.line, ch: cursor.ch + 3 }
              );

              // Get full file content for hex counter calculation
              const fileContent = editor.getValue();

              const modal = new ArticleSearchModal(
                app,
                apiService,
                editor,
                {
                  line: cursor.line,
                  ch: cursor.ch - 2,
                },
                fileContent
              );
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

  private createWritingClickExtension() {
    const handleWritingLinkClick = this.handleWritingLinkClick.bind(this);
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

          // Check for @Tx link
          if (!lineText.match(/\[\[@Tx[^\]]+\]\]/)) {
            return false;
          }

          const activeView = app.workspace.getActiveViewOfType(MarkdownView);
          if (!activeView?.file) {
            return false;
          }

          // Parse all links on the line and find which one was clicked
          const linkPattern = /\[\[@(Tx[^.\]]+)(?:\.(\w+))?\]\]/g;
          const charOffset = pos - line.from;
          let match;
          while ((match = linkPattern.exec(lineText)) !== null) {
            const articleId = match[1];
            const hexId = match[2] || null;
            const linkStart = match.index;
            const linkEnd = linkStart + match[0].length;

            if (charOffset >= linkStart && charOffset <= linkEnd) {
              // Check if link is alone on line
              const isAlone = /^\s*\[\[@Tx[^\]]+\]\]\s*$/.test(lineText);

              // Get text before and after the link
              const textBeforeLink = lineText.substring(0, linkStart);
              const textAfterLink = lineText.substring(linkEnd);
              const sourceLineText = (textBeforeLink + textAfterLink).trim();

              // Get line index
              const lineIndex = line.number - 1;

              handleWritingLinkClick(
                articleId,
                isAlone,
                sourceLineText,
                lineIndex,
                hexId
              );
              return false;
            }
          }
        } catch (error) {
          console.error("[Idealogs] Error handling writing click:", error);
        }

        return false;
      },
    });
  }

  private createPasteHandlerExtension() {
    return EditorView.clipboardInputFilter.of((text, state) => {
      // Check if pasted text contains any Tx links
      if (!text.includes("[[@Tx")) {
        return text;
      }

      // Get current file content to find existing hex IDs
      const fileContent = state.doc.toString();
      const txLinkWithHexPattern = /\[\[@Tx[^.\]]+\.(\w+)\]\]/g;
      const matches = [...fileContent.matchAll(txLinkWithHexPattern)];

      // Build Set of existing hex IDs (case-insensitive)
      const existingHexIds = new Set(
        matches.map((match) => match[1].toLowerCase())
      );

      // Find max hex ID for generating new ones
      let counter: number;
      if (matches.length === 0) {
        counter = 10; // Start at 0xa
      } else {
        const hexIds = matches.map((match) => parseInt(match[1], 16));
        const maxId = Math.max(...hexIds);
        counter = maxId + 1;
      }

      // Track hex IDs within this paste to handle duplicates
      const pastedHexIds = new Set<string>();

      // Helper function to generate non-conflicting hex IDs
      const generateNewHexId = (
        startCounter: number,
        existing: Set<string>,
        pasted: Set<string>
      ): string => {
        let newHexId: string;
        let testCounter = startCounter;

        do {
          newHexId = testCounter.toString(16);
          testCounter++;
        } while (existing.has(newHexId) || pasted.has(newHexId));

        pasted.add(newHexId);
        return newHexId;
      };

      // Find and process all Tx links in pasted text
      const txLinkInPastePattern = /\[\[@(Tx[^\].]+)(?:\.(\w+))?\]\]/g;
      const modifiedText = text.replace(
        txLinkInPastePattern,
        (_match, articleId, originalHexId) => {
          let finalHexId: string;

          if (originalHexId) {
            // Link has a hex ID - check if it conflicts
            const hexIdLower = originalHexId.toLowerCase();

            if (
              !existingHexIds.has(hexIdLower) &&
              !pastedHexIds.has(hexIdLower)
            ) {
              // No conflict - keep original
              finalHexId = originalHexId;
              pastedHexIds.add(hexIdLower);
            } else {
              // Conflict detected - generate new ID
              finalHexId = generateNewHexId(
                counter,
                existingHexIds,
                pastedHexIds
              );
              counter++;
            }
          } else {
            // Link has no hex ID - generate new one
            finalHexId = generateNewHexId(
              counter,
              existingHexIds,
              pastedHexIds
            );
            counter++;
          }

          return `[[@${articleId}.${finalHexId}]]`;
        }
      );

      return modifiedText;
    });
  }

  private async handleArticleSelected(article: Article): Promise<void> {
    try {
      // Fetch article content
      const content = await this.apiService.fetchFileContent(article.id);

      // Get active markdown leaf or create one
      let activeLeaf =
        this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;

      if (!activeLeaf) {
        // No active markdown view, use any leaf from main area
        activeLeaf = this.app.workspace.getLeaf(false);
      }

      if (!activeLeaf) {
        new Notice("Could not find a suitable location for the article");
        return;
      }

      // Get or create WritingView
      const writingView = await this.getOrCreateWritingView(activeLeaf);
      if (writingView) {
        await writingView.updateContent(article.id, article.title, content);
      }
    } catch (error) {
      console.error("[Idealogs] Error handling article selection:", error);
      new Notice("Failed to load article");
    }
  }

  private async handleAnnotatedModeNoteClick(articleId: string): Promise<void> {
    try {
      const articleData = await this.apiService.fetchArticleById(articleId);
      const content = await this.apiService.fetchFileContent(articleId);

      const existingWritingView = this.getWritingView();
      if (existingWritingView) {
        await existingWritingView.updateContent(
          articleId,
          articleData.title,
          content
        );
        return;
      }

      // Fallback: try to get active markdown view to create WritingView
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeView?.leaf) {
        new Notice("No suitable location to open article");
        return;
      }

      const writingView = await this.getOrCreateWritingView(activeView.leaf);
      if (writingView) {
        await writingView.updateContent(articleId, articleData.title, content);
      }
    } catch (error) {
      console.error(
        "[Idealogs] Error handling annotated mode note click:",
        error
      );
      new Notice("Failed to load article");
    }
  }

  private async handleAnnotatedQIClick(articleId: string): Promise<void> {
    try {
      this.commonLinkHandler.handleLink(`@${articleId}`, articleId);
    } catch (error) {
      console.error(
        "[Idealogs] Error handling annotated mode link click:",
        error
      );
      new Notice("Failed to load article");
    }
  }

  private async handleWritingLinkClick(
    articleId: string,
    hideSourceFields: boolean,
    sourceLineText: string,
    lineIndex: number,
    hexId: string | null = null,
    showForm = true
  ): Promise<void> {
    try {
      // Fetch article data and content
      const articleData = await this.apiService.fetchArticleById(articleId);
      const content = await this.apiService.fetchFileContent(articleId);

      // Get active markdown view and source file path
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeView?.leaf) {
        return;
      }

      const sourceFilePath = activeView.file?.path || "";

      // Get or create WritingView
      const writingView = await this.getOrCreateWritingView(activeView.leaf);
      if (writingView) {
        await writingView.updateContent(articleId, articleData.title, content);
      }

      // Show NoteForm in FormView
      const formView = this.getFormView();
      if (formView && showForm) {
        formView.updateNote(
          articleData,
          sourceFilePath,
          hideSourceFields,
          sourceLineText,
          lineIndex,
          hexId
        );
      }
    } catch (error) {
      console.error("[Idealogs] Error handling writing link:", error);
      new Notice("Failed to load writing article");
    }
  }

  private async getOrCreateWritingView(
    sourceLeaf: WorkspaceLeaf
  ): Promise<WritingView | null> {
    // Check if WritingView already exists
    const existingLeaves =
      this.app.workspace.getLeavesOfType(WRITING_VIEW_TYPE);
    if (existingLeaves.length > 0) {
      const view = existingLeaves[0].view;
      if (view instanceof WritingView) {
        // Ensure services are set
        view.setServices(
          this.apiService,
          this.linkTransformer,
          this.annotationService
        );
        view.setOnTxClick((targetArticleId) =>
          this.handleAnnotatedModeNoteClick(targetArticleId)
        );
        view.setOnFxIxClick((targetArticleId) =>
          this.handleAnnotatedQIClick(targetArticleId)
        );
        view.setOnLocalFileClick((filePath) =>
          this.app.workspace.openLinkText(filePath, "", false)
        );
        return view;
      }
    }

    // Create split to the right of source leaf
    const newLeaf = this.app.workspace.createLeafBySplit(
      sourceLeaf,
      "vertical",
      false
    );

    if (!newLeaf) {
      return null;
    }

    await newLeaf.setViewState({
      type: WRITING_VIEW_TYPE,
      active: true,
    });

    const view = newLeaf.view;
    if (view instanceof WritingView) {
      // Set services on the newly created view
      view.setServices(
        this.apiService,
        this.linkTransformer,
        this.annotationService
      );
      view.setOnTxClick((targetArticleId) =>
        this.handleAnnotatedModeNoteClick(targetArticleId)
      );
      view.setOnFxIxClick((targetArticleId) =>
        this.handleAnnotatedQIClick(targetArticleId)
      );
      view.setOnLocalFileClick((filePath) =>
        this.app.workspace.openLinkText(filePath, "", false)
      );
      return view;
    }

    return null;
  }

  private getWritingView(): WritingView | null {
    const existingLeaves =
      this.app.workspace.getLeavesOfType(WRITING_VIEW_TYPE);
    if (existingLeaves.length > 0) {
      const view = existingLeaves[0].view;
      if (view instanceof WritingView) {
        return view;
      }
    }
    return null;
  }

  private wrapAnnotationWords(
    container: HTMLElement,
    annotation: Annotation,
    onClick: () => void
  ): void {
    const { sourceDisplay, sourceStart, sourceEnd } = annotation;

    if (!sourceDisplay) return;

    // Split into words, filter empty strings
    const words = sourceDisplay.split(" ").filter((w) => w.trim());

    for (const word of words) {
      // Find word using text-quote algorithm with context
      const result = findTextQuote(container, {
        exact: word,
        prefix: sourceStart,
        suffix: sourceEnd,
      });

      if (!result) continue; // Skip words not found

      const { range } = result;

      // Create wrapper span
      const span = document.createElement("span");
      span.className = "idl-annotation-source";
      span.style.fontWeight = "bold";
      span.style.cursor = "pointer";

      // Extract contents and wrap
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);

      // Attach click handler
      span.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
    }
  }

  private async showTargetAndFlash(
    targetId: string,
    targetText: string
  ): Promise<void> {
    try {
      // Fetch article data
      const articleData = await this.apiService.fetchArticleById(targetId);
      const content = await this.apiService.fetchFileContent(targetId);

      // Get active markdown leaf
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeView) {
        return;
      }

      // Get or create WritingView
      const writingView = await this.getOrCreateWritingView(activeView.leaf);
      if (writingView) {
        await writingView.updateContent(targetId, articleData.title, content);

        // Flash the target text after content is rendered
        setTimeout(() => {
          writingView.flashText(targetText);
        }, 100);
      }
    } catch (error) {
      console.error("[Idealogs] Error showing target and flash:", error);
      new Notice("Failed to load target article");
    }
  }

  onunload() {
    // Clear cursor check interval
    if (this.cursorCheckInterval !== null) {
      window.clearInterval(this.cursorCheckInterval);
    }

    // Clear debounce timer if pending
    if (this.editorChangeDebounceTimer !== null) {
      window.clearTimeout(this.editorChangeDebounceTimer);
    }

    // Clear all pending deletion timers
    this.fileDeletionManager.destroy();

    // Restore original link opening behavior
    if (this.cleanupLinkPatching) {
      this.cleanupLinkPatching();
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

    // File Management section
    containerEl.createEl("h3", { text: "File Management" });

    new Setting(containerEl)
      .setName("Auto-delete delay")
      .setDesc(
        "Delay in seconds before automatically deleting closed Idealogs articles (2-5 seconds)"
      )
      .addSlider((slider) =>
        slider
          .setLimits(2, 5, 1)
          .setValue(this.plugin.settings.deletionDelay ?? 5)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.deletionDelay = value;
            await this.plugin.saveSettings();
          })
      );

    // Idealogs Files section
    containerEl.createEl("div", {
      text: "Idealogs Files",
      cls: "setting-item-name",
    });

    const trackedFiles = this.plugin.fileTracker.getAllTrackedFiles();

    if (trackedFiles.length === 0) {
      containerEl.createEl("p", {
        text: "No Idealogs files are currently being tracked.",
        cls: "setting-item-description",
      });
    } else {
      const detailsEl = containerEl.createEl("details");
      detailsEl.createEl("summary", {
        text: `Tracked files (${trackedFiles.length})`,
      });

      const listEl = detailsEl.createEl("ul", { cls: "idealogs-file-list" });

      trackedFiles.forEach((file) => {
        const itemEl = listEl.createEl("li");
        const date = new Date(file.downloadedAt).toLocaleString();

        itemEl.createEl("div", {
          text: file.fileName,
          cls: "idealogs-file-name",
        });
        itemEl.createEl("div", {
          text: `Article ID: ${file.articleId}`,
          cls: "idealogs-file-meta setting-item-description",
        });
        itemEl.createEl("div", {
          text: `Downloaded: ${date}`,
          cls: "idealogs-file-meta setting-item-description",
        });
      });
    }

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

    // Developer section
    containerEl.createEl("h3", { text: "Developer" });

    new Setting(containerEl)
      .setName("Enable logs")
      .setDesc("Show console logs for debugging (requires reload)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableLogs)
          .onChange(async (value) => {
            this.plugin.settings.enableLogs = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Migrate old annotations")
      .setDesc(
        "Convert .annotations files to new format and save to .idealogs/annotations/old/"
      )
      .addButton((button) =>
        button.setButtonText("Migrate").onClick(async () => {
          button.setDisabled(true);
          button.setButtonText("Migrating...");

          try {
            const result: MigrationResult =
              await this.plugin.annotationService.migrateOldAnnotations();

            if (result.migratedFiles.length > 0) {
              new Notice(
                `Migrated ${result.migratedFiles.length} file(s) successfully`
              );
            }

            if (result.errors.length > 0) {
              result.errors.forEach((error) => {
                console.error("[Idealogs Migration]", error);
              });
              new Notice(
                `Migration completed with ${result.errors.length} error(s). Check console for details.`
              );
            }

            if (
              result.migratedFiles.length === 0 &&
              result.errors.length === 0
            ) {
              new Notice("No files to migrate");
            }
          } catch (error) {
            console.error("[Idealogs Migration] Error:", error);
            new Notice(`Migration failed: ${error.message}`);
          } finally {
            button.setDisabled(false);
            button.setButtonText("Migrate");
          }
        })
      );

    // Show log management buttons only when logs are enabled
    if (this.plugin.settings.enableLogs) {
      new Setting(containerEl)
        .setName("Copy logs")
        .setDesc("Copy all logs to clipboard")
        .addButton((button) =>
          button
            .setButtonText("Copy logs")
            .setCta()
            .onClick(async () => {
              const success = await this.plugin.logger.copyToClipboard();
              if (success) {
                new Notice("Logs copied to clipboard");
              } else {
                new Notice("No logs to copy");
              }
            })
        );

      new Setting(containerEl)
        .setName("Clear logs")
        .setDesc("Clear all stored logs")
        .addButton((button) =>
          button.setButtonText("Clear logs").onClick(() => {
            this.plugin.logger.clear();
            new Notice("Logs cleared");
          })
        );
    }
  }
}
