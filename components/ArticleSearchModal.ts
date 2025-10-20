import { App, Modal, setIcon, Editor } from "obsidian";
import { Article, ArticleResponse } from "../types";
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
  private paginationContainer: HTMLElement;
  private prevButton: HTMLButtonElement;
  private nextButton: HTMLButtonElement;
  private pageInfo: HTMLElement;
  private articles: Article[] = [];
  private selectedIndex = 0;
  private debounceTimer: number | null = null;
  private abortController: AbortController | null = null;
  private readonly DEBOUNCE_DELAY = 300;
  private readonly RESULTS_PER_PAGE = 5;
  private currentPage = 1;
  private totalPages = 1;
  private currentQuery = "";
  private paginationData: ArticleResponse | null = null;

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

    const filterContainer = searchRow.createDiv({
      cls: "article-filter-container",
    });

    filterContainer.createEl("label", {
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

    const contentContainer = contentEl.createDiv({
      cls: "article-modal-content",
    });

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

    // Pagination container
    this.paginationContainer = contentEl.createDiv({
      cls: "article-pagination-container",
    });
    this.paginationContainer.hide();

    this.prevButton = this.paginationContainer.createEl("button", {
      text: "Previous",
      cls: "article-pagination-button",
    });
    this.prevButton.addEventListener("click", () => this.goToPreviousPage());

    this.pageInfo = this.paginationContainer.createDiv({
      cls: "article-page-info",
      text: "Page 1 of 1",
    });

    this.nextButton = this.paginationContainer.createEl("button", {
      text: "Next",
      cls: "article-pagination-button",
    });
    this.nextButton.addEventListener("click", () => this.goToNextPage());

    // Event listeners
    this.searchInput.addEventListener("input", this.onSearchInput.bind(this));
    this.filterSelect.addEventListener(
      "change",
      this.onFilterChange.bind(this)
    );
    this.searchInput.addEventListener("keydown", this.onKeyDown.bind(this));

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
      this.paginationContainer.hide();
      return;
    }

    this.showLoading();
    this.currentPage = 1;

    this.debounceTimer = window.setTimeout(() => {
      this.performSearch(query);
    }, this.DEBOUNCE_DELAY);
  }

  private async performSearch(query: string, page = 1): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }

    this.abortController = new AbortController();
    this.currentQuery = query;

    try {
      const response = await this.apiService.fetchArticleSuggestions(
        query,
        this.abortController.signal,
        page,
        this.RESULTS_PER_PAGE
      );

      this.hideLoading();

      if (!response.items || response.items.length === 0) {
        this.renderNoResults();
        this.paginationContainer.hide();
        return;
      }

      this.paginationData = response;
      this.currentPage = response.page;
      this.totalPages = response.totalPages;
      this.articles = this.filterArticles(response.items);
      this.selectedIndex = 0;
      this.renderResults();
      this.updatePagination();
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

  private async renderPreview(article: Article): Promise<void> {
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

    // Article content
    const contentContainer = previewContent.createDiv({
      cls: "article-preview-content-container",
    });

    // loading indicator
    const loadingEl = contentContainer.createDiv({
      cls: "article-content-loading",
      text: "Loading content...",
    });

    try {
      const content = await this.apiService.fetchFileContent(article.id);

      loadingEl.remove();

      const contentDiv = contentContainer.createDiv({
        cls: "article-preview-content-text",
      });
      contentDiv.innerHTML = content;
    } catch (error) {
      loadingEl.remove();
      contentContainer.createDiv({
        cls: "article-content-error",
        text: "Failed to load article content",
      });
      console.error("Error fetching article content:", error);
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

    this.editor.replaceRange(articleLink, this.cursorPos, this.cursorPos);

    this.editor.setCursor({
      line: this.cursorPos.line,
      ch: this.cursorPos.ch + articleLink.length,
    });

    this.close();
  }

  private updatePagination(): void {
    if (!this.paginationData) {
      this.paginationContainer.hide();
      return;
    }

    if (this.totalPages > 1) {
      this.paginationContainer.show();
      this.pageInfo.setText(`Page ${this.currentPage} of ${this.totalPages}`);

      this.prevButton.disabled = this.currentPage === 1;
      this.nextButton.disabled = this.currentPage === this.totalPages;
    } else {
      this.paginationContainer.hide();
    }
  }

  private async goToNextPage(): Promise<void> {
    if (this.currentPage >= this.totalPages) return;

    this.showLoading();
    await this.performSearch(this.currentQuery, this.currentPage + 1);
  }

  private async goToPreviousPage(): Promise<void> {
    if (this.currentPage <= 1) return;

    this.showLoading();
    await this.performSearch(this.currentQuery, this.currentPage - 1);
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
