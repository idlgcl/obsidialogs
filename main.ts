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

interface IdealogsSettings {
  enableLogs: boolean;
}

const DEFAULT_SETTINGS: IdealogsSettings = { enableLogs: false };

export default class IdealogsPlugin extends Plugin {
  settings: IdealogsSettings;
  apiService: ApiService;
  commonLinkHandler: CommonLinkHandler;
  private cleanupLinkPatching: () => void;

  async onload() {
    await this.loadSettings();

    // Initialize core services
    this.apiService = new ApiService();

    // Initialize link handlers
    this.commonLinkHandler = new CommonLinkHandler(this.app, this.apiService);
    this.cleanupLinkPatching = patchLinkOpening(this.app, this.commonLinkHandler);

    // CodeMirror extensions
    this.registerEditorExtension(this.createArticleLookupExtension());

    // Settings tab
    this.addSettingTab(new IdealogsSettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on("file-open", (file: TFile) => {
        console.log("test", file.basename);
      })
    );
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
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
