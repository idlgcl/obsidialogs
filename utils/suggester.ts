import {
  Plugin,
  MarkdownView,
  EditorSuggest,
  EditorPosition,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  Editor,
} from "obsidian";
import { Article } from "../types";
import { ApiService } from "./api";
import { ARTICLE_TRIGGER_PATTERN, API_DEBOUNCE_DELAY } from "../constants";

export class ArticleSuggest extends EditorSuggest<Article> {
  private apiService: ApiService;
  private debounceTimer: number | null = null;
  private abortController: AbortController | null = null;
  private lastContext: EditorSuggestContext | null = null;

  constructor(plugin: Plugin, apiService: ApiService) {
    super(plugin.app);
    this.apiService = apiService;
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor
  ): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    const linePrefix = line.substring(0, cursor.ch);

    const match = linePrefix.match(ARTICLE_TRIGGER_PATTERN);
    if (!match) return null;

    const query = match[0].substring(3);
    const startPos = cursor.ch - match[0].length + 2;

    return {
      start: { line: cursor.line, ch: startPos },
      end: cursor,
      query: query,
    };
  }

  async getSuggestions(context: EditorSuggestContext): Promise<Article[]> {
    this.lastContext = context;

    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }

    if (this.abortController) {
      this.abortController.abort();
    }

    return new Promise((resolve) => {
      this.debounceTimer = window.setTimeout(async () => {
        const searchTerm = context.query;

        this.abortController = new AbortController();

        try {
          const data = await this.apiService.fetchArticleSuggestions(
            searchTerm,
            this.abortController.signal
          );

          if (!data.items || !data.items.length) {
            resolve([]);
            return;
          }

          resolve(data.items);
        } catch (error) {
          if (error instanceof Error && error.name !== "AbortError") {
            console.error("Error fetching article suggestions:", error);
          }
          resolve([]);
        }
      }, API_DEBOUNCE_DELAY);
    });
  }

  renderSuggestion(article: Article, el: HTMLElement): void {
    el.empty();
    el.addClass("idealogs-article");

    const container = el.createDiv({ cls: "idealogs-suggestion-container" });

    const titleRow = container.createDiv({ cls: "article-title-row" });

    titleRow.createDiv({
      cls: "article-title",
      text: article.title,
    });

    titleRow.createDiv({
      cls: "article-kind",
      text: article.kind,
    });
  }

  async selectSuggestion(
    article: Article,
    evt: MouseEvent | KeyboardEvent
  ): Promise<void> {
    if (!this.lastContext) return;

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    const editor = view.editor;
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);

    const textAfterCursor = line.substring(cursor.ch);
    const hasClosingBrackets = textAfterCursor.startsWith("]]");

    const endPos = hasClosingBrackets
      ? { line: cursor.line, ch: cursor.ch + 2 }
      : cursor;

    const bracketStart = line.lastIndexOf("[[", cursor.ch);

    if (bracketStart >= 0) {
      const articleLink = `[[@${article.id}]]`;

      editor.replaceRange(
        articleLink,
        { line: cursor.line, ch: bracketStart },
        endPos
      );

      editor.setCursor({
        line: cursor.line,
        ch: bracketStart + articleLink.length,
      });
    }
  }
}
