import { App, Modal, setIcon, Editor } from "obsidian";
import { Article } from "../types";
import { ApiService } from "../utils/api";

export class ArticleSearchModal extends Modal {
  private apiService: ApiService;
  private editor: Editor;
  private cursorPos: { line: number; ch: number };
  private searchInput: HTMLInputElement;
  private resultsContainer: HTMLElement;
  private previewContainer: HTMLElement;
  private loadingEl: HTMLElement;
  private filterSelect: HTMLSelectElement;
  private articles: Article[] = [];
  private selectedIndex = 0;
  private debounceTimer: number | null = null;
  private abortController: AbortController | null = null;
  private readonly DEBOUNCE_DELAY = 300;

  constructor(
    app: App,
    apiService: ApiService,
    editor: Editor,
    cursorPos: { line: number; ch: number }
  ) {
    super(app);
    this.apiService = apiService;
    this.editor = editor;
    this.cursorPos = cursorPos;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("article-search-modal");

    // Title
    contentEl.createEl("h2", { text: "Search Articles" });

    // Search and filter row
    const searchRow = contentEl.createDiv({ cls: "article-search-row" });

    // Search input container
    const inputContainer = searchRow.createDiv({
      cls: "article-search-input-wrapper",
    });

    this.searchInput = inputContainer.createEl("input", {
      type: "text",
      placeholder: "Type to search articles...",
      cls: "article-search-input",
    });

    this.loadingEl = inputContainer.createDiv({ cls: "article-loading-icon" });
    setIcon(this.loadingEl, "loader");
    this.loadingEl.hide();

    // Filter container (same row as search)
    const filterContainer = searchRow.createDiv({
      cls: "article-filter-container",
    });

    const filterLabel = filterContainer.createEl("label", {
      text: "Type:",
      cls: "article-filter-label",
    });

    this.filterSelect = filterContainer.createEl("select", {
      cls: "article-filter-select",
    });
    this.filterSelect.createEl("option", { text: "All", value: "" });
    this.filterSelect.createEl("option", { text: "Writing", value: "writing" });
    this.filterSelect.createEl("option", { text: "Insight", value: "insight" });
    this.filterSelect.createEl("option", {
      text: "Question",
      value: "question",
    });

    // Content container (results + preview side by side)
    const contentContainer = contentEl.createDiv({
      cls: "article-modal-content",
    });

    // Results list
    this.resultsContainer = contentContainer.createDiv({
      cls: "article-results-container",
    });
    this.resultsContainer.createDiv({
      cls: "article-results-empty",
      text: "Start typing to search articles...",
    });

    // Preview panel
    this.previewContainer = contentContainer.createDiv({
      cls: "article-preview-container",
    });
    this.previewContainer.createDiv({
      cls: "article-preview-empty",
      text: "Select an article to preview",
    });

    // Event listeners
    this.searchInput.addEventListener("input", this.onSearchInput.bind(this));
    this.filterSelect.addEventListener(
      "change",
      this.onFilterChange.bind(this)
    );
    this.searchInput.addEventListener("keydown", this.onKeyDown.bind(this));

    // Focus search input
    this.searchInput.focus();
  }

  private onSearchInput(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }

    const query = this.searchInput.value.trim();

    if (!query) {
      this.hideLoading();
      this.renderEmpty();
      return;
    }

    this.showLoading();

    this.debounceTimer = window.setTimeout(() => {
      this.performSearch(query);
    }, this.DEBOUNCE_DELAY);
  }

  private async performSearch(query: string): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }

    this.abortController = new AbortController();

    try {
      const response = await this.apiService.fetchArticleSuggestions(
        query,
        this.abortController.signal
      );

      this.hideLoading();

      if (!response.items || response.items.length === 0) {
        this.renderNoResults();
        return;
      }

      this.articles = this.filterArticles(response.items);
      this.selectedIndex = 0;
      this.renderResults();
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        console.error("Error fetching article suggestions:", error);
        this.hideLoading();
        this.renderError();
      }
    }
  }

  private filterArticles(articles: Article[]): Article[] {
    const filterValue = this.filterSelect.value;
    if (!filterValue) return articles;

    return articles.filter(
      (article) => article.kind.toLowerCase() === filterValue.toLowerCase()
    );
  }

  private onFilterChange(): void {
    if (this.articles.length > 0) {
      const allArticles = this.articles;
      this.articles = this.filterArticles(allArticles);
      this.selectedIndex = 0;
      this.renderResults();
    }
  }

  private showLoading(): void {
    this.loadingEl.show();
    this.loadingEl.addClass("spinning");
  }

  private hideLoading(): void {
    this.loadingEl.hide();
    this.loadingEl.removeClass("spinning");
  }

  private renderEmpty(): void {
    this.resultsContainer.empty();
    this.resultsContainer.createDiv({
      cls: "article-results-empty",
      text: "Start typing to search articles...",
    });
    this.previewContainer.empty();
    this.previewContainer.createDiv({
      cls: "article-preview-empty",
      text: "Select an article to preview",
    });
  }

  private renderNoResults(): void {
    this.resultsContainer.empty();
    this.resultsContainer.createDiv({
      cls: "article-results-empty",
      text: "No articles found",
    });
    this.previewContainer.empty();
  }

  private renderError(): void {
    this.resultsContainer.empty();
    this.resultsContainer.createDiv({
      cls: "article-results-error",
      text: "Error loading articles. Please try again.",
    });
  }

  private renderResults(): void {
    this.resultsContainer.empty();

    if (this.articles.length === 0) {
      this.renderNoResults();
      return;
    }

    this.articles.forEach((article, index) => {
      const itemEl = this.resultsContainer.createDiv({
        cls: "article-result-item",
      });

      if (index === this.selectedIndex) {
        itemEl.addClass("selected");
      }

      const titleRow = itemEl.createDiv({ cls: "article-title-row" });

      titleRow.createDiv({
        cls: "article-title",
        text: article.title,
      });

      titleRow.createDiv({
        cls: "article-kind",
        text: article.kind,
      });

      itemEl.addEventListener("click", () => {
        this.selectedIndex = index;
        this.renderResults();
        this.renderPreview(article);
      });

      itemEl.addEventListener("dblclick", () => {
        this.selectArticle(article);
      });
    });

    // Auto-render preview for first item
    if (this.selectedIndex === 0 && this.articles.length > 0) {
      this.renderPreview(this.articles[0]);
    }
  }

  private renderPreview(article: Article): void {
    this.previewContainer.empty();

    const previewContent = this.previewContainer.createDiv({
      cls: "article-preview-content",
    });

    // Article title
    previewContent.createEl("h3", {
      text: article.title,
      cls: "article-preview-title",
    });

    // Article metadata
    const metadata = previewContent.createDiv({
      cls: "article-preview-metadata",
    });
    metadata.createEl("span", {
      text: `Type: ${article.kind}`,
      cls: "article-preview-kind",
    });
    metadata.createEl("span", {
      text: `ID: ${article.id}`,
      cls: "article-preview-id",
    });

    // Article lede (preview)
    if (article.ledeHtml) {
      const ledeContainer = previewContent.createDiv({
        cls: "article-preview-lede",
      });
      ledeContainer.createEl("h4", { text: "Preview:" });
      const ledeContent = ledeContainer.createDiv({
        cls: "article-preview-lede-content",
      });
      ledeContent.innerHTML = article.ledeHtml;
    }

    // Select button
    const buttonContainer = previewContent.createDiv({
      cls: "article-preview-actions",
    });
    const selectButton = buttonContainer.createEl("button", {
      text: "Select Article",
      cls: "mod-cta",
    });
    selectButton.addEventListener("click", () => {
      this.selectArticle(article);
    });
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.articles.length === 0) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.selectedIndex = Math.min(
          this.selectedIndex + 1,
          this.articles.length - 1
        );
        this.renderResults();
        this.renderPreview(this.articles[this.selectedIndex]);
        break;
      case "ArrowUp":
        event.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.renderResults();
        this.renderPreview(this.articles[this.selectedIndex]);
        break;
      case "Enter":
        event.preventDefault();
        if (this.articles[this.selectedIndex]) {
          this.selectArticle(this.articles[this.selectedIndex]);
        }
        break;
      case "Escape":
        event.preventDefault();
        this.close();
        break;
    }
  }

  private selectArticle(article: Article): void {
    const articleLink = `[[@${article.id}]]`;

    // Insert the article link at the saved cursor position
    this.editor.replaceRange(articleLink, this.cursorPos, this.cursorPos);

    // Move cursor to end of inserted link
    this.editor.setCursor({
      line: this.cursorPos.line,
      ch: this.cursorPos.ch + articleLink.length,
    });

    this.close();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();

    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }

    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
