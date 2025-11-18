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
  fileTracker: FileTracker;
  fileDeletionManager: FileDeletionManager;
  commonLinkHandler: CommonLinkHandler;
  logger: Logger;
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

          // Parse the link
          const linkPattern = /\[\[@(Tx[^\]]+)\]\]/;
          const match = lineText.match(linkPattern);

          if (match) {
            const articleId = match[1];
            const charOffset = pos - line.from;
            const linkStart = lineText.indexOf(match[0]);
            const linkEnd = linkStart + match[0].length;

            if (charOffset >= linkStart && charOffset <= linkEnd) {
              handleWritingLinkClick(articleId);
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

  private async handleWritingLinkClick(articleId: string): Promise<void> {
    try {
      // Fetch article data and content
      const articleData = await this.apiService.fetchArticleById(articleId);
      const content = await this.apiService.fetchFileContent(articleId);

      // Get active leaf
      const activeLeaf =
        this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
      if (!activeLeaf) {
        return;
      }

      // Get or create WritingView
      const writingView = await this.getOrCreateWritingView(activeLeaf);
      if (writingView) {
        await writingView.updateContent(articleId, articleData.title, content);
        return;
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
      return view;
    }

    return null;
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
