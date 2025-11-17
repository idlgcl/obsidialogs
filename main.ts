import {
  Plugin,
  PluginSettingTab,
  App,
  Setting,
  Notice,
  MarkdownView,
  TFile,
} from "obsidian";
import { EditorView } from "@codemirror/view";
import { ApiService } from "./utils/api";
import { ArticleSearchModal } from "./components/ArticleSearchModal";
import { CommonLinkHandler, patchLinkOpening } from "./utils/link-handlers";
import { FileTracker } from "./utils/file-tracker";
import { FileDeletionManager } from "./utils/file-deletion-manager";

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
  private cleanupLinkPatching: () => void;

  async onload() {
    await this.loadSettings();

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

    // Settings tab
    this.addSettingTab(new IdealogsSettingTab(this.app, this));

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

  onunload() {
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

    // Idealogs Files section
    containerEl.createEl("h3", { text: "Idealogs Files" });

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
  }
}
