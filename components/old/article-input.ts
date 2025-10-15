import { Component, setIcon } from "obsidian";

import { ApiService } from "../../utils/api";
import { Article } from "../../types";

export interface ArticleAutocompleteOptions {
  container: HTMLElement;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  onChange?: (article: Article) => void;
  disabled?: boolean;
}

export class ArticleAutocompleteField extends Component {
  private apiService: ApiService;
  private inputEl: HTMLInputElement;
  private suggestionsEl: HTMLElement;
  private selectedArticle: Article | null = null;
  private suggestions: Article[] = [];
  private isOpen = false;

  constructor(private options: ArticleAutocompleteOptions) {
    super();
    this.apiService = new ApiService();
    this.createField();
  }

  private createField(): void {
    const container = this.options.container;
    const fieldContainer = container.createDiv({
      cls: "article-autocomplete-field",
    });

    if (this.options.label) {
      fieldContainer.createEl("label", { text: this.options.label });
    }

    const inputContainer = fieldContainer.createDiv({
      cls: "article-input-container",
    });

    this.inputEl = inputContainer.createEl("input", {
      type: "text",
      placeholder: this.options.placeholder || "Search for an article...",
      value: this.options.initialValue || "",
      attr: {
        disabled: this.options.disabled ? "disabled" : null,
      },
    });

    const searchIcon = inputContainer.createDiv({ cls: "article-search-icon" });
    setIcon(searchIcon, "search");

    this.suggestionsEl = container.createDiv({ cls: "article-suggestions" });
    this.suggestionsEl.hide();

    this.registerDomEvent(this.inputEl, "input", this.onInput.bind(this));
    this.registerDomEvent(this.inputEl, "focus", this.onFocus.bind(this));
    this.registerDomEvent(document, "click", this.onDocumentClick.bind(this));
  }

  private async onInput(): Promise<void> {
    const query = this.inputEl.value.trim();

    if (!query) {
      this.closeSuggestions();
      return;
    }

    try {
      const response = await this.apiService.fetchArticleSuggestions(query);
      this.suggestions = response.items || [];

      if (this.suggestions.length > 0) {
        this.renderSuggestions();
        this.openSuggestions();
      } else {
        this.closeSuggestions();
      }
    } catch (error) {
      console.error("Error fetching article suggestions:", error);
      this.closeSuggestions();
    }
  }

  private onFocus(): void {
    if (this.suggestions.length > 0) {
      this.openSuggestions();
    }
  }

  private onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const isInsideComponent =
      target.closest(".article-autocomplete-field") ||
      target.closest(".article-suggestions");

    if (!isInsideComponent) {
      this.closeSuggestions();
    }
  }

  private renderSuggestions(): void {
    this.suggestionsEl.empty();

    this.suggestions.forEach((article) => {
      const suggestionEl = this.suggestionsEl.createDiv({
        cls: "article-suggestion-item",
      });

      const container = suggestionEl.createDiv({
        cls: "idealogs-suggestion-container",
      });

      const titleRow = container.createDiv({ cls: "article-title-row" });

      titleRow.createDiv({
        cls: "article-title",
        text: article.title,
      });

      titleRow.createDiv({
        cls: "article-kind",
        text: article.kind,
      });

      suggestionEl.addEventListener("click", () => {
        this.selectArticle(article);
      });
    });
  }

  private selectArticle(article: Article): void {
    this.selectedArticle = article;
    this.inputEl.value = article.id;
    this.closeSuggestions();

    if (this.options.onChange) {
      this.options.onChange(article);
    }
  }

  private openSuggestions(): void {
    if (!this.isOpen && this.suggestions.length > 0) {
      this.suggestionsEl.show();
      this.isOpen = true;
    }
  }

  private closeSuggestions(): void {
    if (this.isOpen) {
      this.suggestionsEl.hide();
      this.isOpen = false;
    }
  }

  getValue(): string {
    return this.inputEl.value;
  }

  getSelectedArticle(): Article | null {
    return this.selectedArticle;
  }

  setValue(value: string): void {
    this.inputEl.value = value;
  }

  setDisabled(disabled: boolean): void {
    this.inputEl.disabled = disabled;
  }

  onunload(): void {
    super.onunload();
    this.suggestionsEl.remove();
  }
}
