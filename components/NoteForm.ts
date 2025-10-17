import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import { Note } from "../utils/parsers";
import { ArticleAutocompleteField } from "./ArticleAutocompleteField";
import { Article } from "../types";
import { ArticleSplitViewHandler } from "../utils/article-split-handler";
import { AnnotationService, AnnotationData } from "../utils/annotation-service";
import { ApiService } from "../utils/api";

export const NOTE_FORM_VIEW = "note-form-view";

export class NoteFormView extends ItemView {
  private currentNote: Note | null = null;
  private savedAnnotation: AnnotationData | null = null;
  private shouldOpenArticle = false;
  private articleAutocomplete: ArticleAutocompleteField | null = null;
  private selectedArticle: Article | null = null;
  private articleSplitHandler: ArticleSplitViewHandler | null = null;
  private annotationService: AnnotationService | null = null;
  private apiService: ApiService;

  // Form fields
  private textStartInput: HTMLInputElement | null = null;
  private textEndInput: HTMLInputElement | null = null;
  private textDisplayInput: HTMLInputElement | null = null;
  private targetTextStartInput: HTMLInputElement | null = null;
  private targetTextEndInput: HTMLInputElement | null = null;
  private targetTextDisplayInput: HTMLInputElement | null = null;
  private saveButton: HTMLButtonElement | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.apiService = new ApiService();
  }

  setAnnotationService(service: AnnotationService): void {
    this.annotationService = service;
  }

  getViewType() {
    return NOTE_FORM_VIEW;
  }

  getDisplayText(): string {
    return "Note Form";
  }

  getIcon(): string {
    return "file-text";
  }

  async onOpen() {
    this.render();
  }

  async onClose() {
    // Clean up autocomplete
    if (this.articleAutocomplete) {
      this.articleAutocomplete.unload();
      this.articleAutocomplete = null;
    }
  }

  setArticleSplitHandler(handler: ArticleSplitViewHandler): void {
    this.articleSplitHandler = handler;
  }

  updateNote(
    note: Note,
    savedAnnotation: AnnotationData | null = null,
    openTargetArticle = false
  ): void {
    this.currentNote = note;
    this.savedAnnotation = savedAnnotation;
    this.shouldOpenArticle = openTargetArticle;
    this.render();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("idl-note-form");

    if (!this.currentNote) {
      container.createEl("div", {
        text: "No note selected",
        cls: "note-form-placeholder",
      });
      return;
    }

    // Header
    const headerContainer = container.createDiv({ cls: "form-header" });
    headerContainer.createEl("h3", { text: "Note" });

    // Form container
    const formContainer = container.createDiv({ cls: "idl-form" });

    // Text Start and Text End (same row)
    const srcRangeFields = formContainer.createDiv({
      cls: "idl-form-field idl-range-field",
    });

    const startField = srcRangeFields.createDiv({ cls: "idl-start-field" });
    startField.createEl("label", { text: "Text Start" });
    this.textStartInput = startField.createEl("input", {
      type: "text",
    });

    const endField = srcRangeFields.createDiv({ cls: "idl-end-field" });
    endField.createEl("label", { text: "Text End" });
    this.textEndInput = endField.createEl("input", {
      type: "text",
    });

    // Text Display (full row)
    const textDisplayField = formContainer.createDiv({ cls: "idl-form-field" });
    textDisplayField.createEl("label", { text: "Text Display" });
    this.textDisplayInput = textDisplayField.createEl("input", {
      type: "text",
    });

    // Target Article (full row, always disabled)
    const targetArticleField = formContainer.createDiv({
      cls: "idl-form-field",
    });
    targetArticleField.createEl("label", { text: "Target Article" });

    // Clean up old if exists
    if (this.articleAutocomplete) {
      this.articleAutocomplete.unload();
      this.articleAutocomplete = null;
    }

    this.articleAutocomplete = new ArticleAutocompleteField({
      container: targetArticleField,
      placeholder: "Search for an article...",
      onChange: (article) => {
        this.selectedArticle = article;

        if (this.articleSplitHandler) {
          this.articleSplitHandler.openArticle(article);
        }

        this.validateForm();
      },
    });

    this.articleAutocomplete.load();

    // Set the target from note and disable
    if (this.currentNote) {
      this.articleAutocomplete.setValue(this.currentNote.target);
      this.articleAutocomplete.setDisabled(true);
    }

    // Target Text Display (full row)
    const targetDisplayField = formContainer.createDiv({
      cls: "idl-form-field",
    });
    targetDisplayField.createEl("label", { text: "Target Text Display" });
    this.targetTextDisplayInput = targetDisplayField.createEl("input", {
      type: "text",
    });

    // Target Text Start and Target Text End (same row)
    const targetRangeFields = formContainer.createDiv({
      cls: "idl-form-field idl-range-field",
    });

    const targetStartField = targetRangeFields.createDiv({
      cls: "idl-start-field",
    });
    targetStartField.createEl("label", { text: "Target Text Start" });
    this.targetTextStartInput = targetStartField.createEl("input", {
      type: "text",
    });

    const targetEndField = targetRangeFields.createDiv({
      cls: "idl-end-field",
    });
    targetEndField.createEl("label", { text: "Target Text End" });
    this.targetTextEndInput = targetEndField.createEl("input", {
      type: "text",
    });

    // Add input event listeners for validation
    this.targetTextStartInput.addEventListener("input", () =>
      this.validateForm()
    );
    this.targetTextEndInput.addEventListener("input", () =>
      this.validateForm()
    );
    this.targetTextDisplayInput.addEventListener("input", () =>
      this.validateForm()
    );

    // Save button
    const buttonContainer = formContainer.createDiv({ cls: "idl-btns" });
    this.saveButton = buttonContainer.createEl("button", { text: "Save" });
    this.saveButton.disabled = true;
    this.saveButton.addEventListener("click", () => this.handleSave());

    // Load saved annotation if exists
    if (this.savedAnnotation) {
      this.loadSavedAnnotation();
      if (this.shouldOpenArticle) {
        this.openTargetArticle();
      }
    }
  }

  private validateForm(): void {
    if (!this.saveButton) return;

    const hasArticle = this.selectedArticle !== null;
    const hasStart =
      this.targetTextStartInput &&
      this.targetTextStartInput.value.trim() !== "";
    const hasEnd =
      this.targetTextEndInput && this.targetTextEndInput.value.trim() !== "";
    const hasDisplay =
      this.targetTextDisplayInput &&
      this.targetTextDisplayInput.value.trim() !== "";

    this.saveButton.disabled = !(
      hasArticle &&
      hasStart &&
      hasEnd &&
      hasDisplay
    );
  }

  private async handleSave(): Promise<void> {
    if (!this.currentNote) {
      new Notice("No note selected");
      return;
    }

    if (!this.selectedArticle) {
      new Notice("Please select a target article");
      return;
    }

    if (!this.articleSplitHandler) {
      new Notice("Article handler not available");
      return;
    }

    if (!this.annotationService) {
      new Notice("Annotation service not available");
      return;
    }

    if (
      !this.targetTextStartInput ||
      !this.targetTextEndInput ||
      !this.targetTextDisplayInput
    ) {
      return;
    }

    const targetTextStart = this.targetTextStartInput.value.trim();
    const targetTextEnd = this.targetTextEndInput.value.trim();
    const targetTextDisplay = this.targetTextDisplayInput.value.trim();

    if (!targetTextStart || !targetTextEnd || !targetTextDisplay) {
      new Notice("Please fill in all target text fields");
      return;
    }

    // TODO: Add validation and save logic
    new Notice("Save functionality to be implemented");
  }

  private async loadSavedAnnotation(): Promise<void> {
    if (!this.savedAnnotation) return;

    if (this.textStartInput) {
      this.textStartInput.value = this.savedAnnotation.src_txt_start;
    }
    if (this.textEndInput) {
      this.textEndInput.value = this.savedAnnotation.src_txt_end;
    }
    if (this.textDisplayInput) {
      this.textDisplayInput.value = this.savedAnnotation.src_txt_display;
    }
    if (this.targetTextStartInput) {
      this.targetTextStartInput.value = this.savedAnnotation.target_txt_start;
    }
    if (this.targetTextEndInput) {
      this.targetTextEndInput.value = this.savedAnnotation.target_txt_end;
    }
    if (this.targetTextDisplayInput) {
      this.targetTextDisplayInput.value =
        this.savedAnnotation.target_txt_display;
    }

    if (this.articleAutocomplete) {
      this.articleAutocomplete.setValue(this.savedAnnotation.target);
    }
  }

  private async openTargetArticle(): Promise<void> {
    if (!this.savedAnnotation) return;

    try {
      const targetArticle = await this.apiService.fetchArticleById(
        this.savedAnnotation.target
      );

      this.selectedArticle = targetArticle;

      if (this.articleAutocomplete) {
        this.articleAutocomplete.setValue(targetArticle.id);
      }

      if (this.articleSplitHandler) {
        await this.articleSplitHandler.openArticle(targetArticle);
      }

      this.validateForm();
    } catch (error) {
      console.error("Error loading saved annotation:", error);
      new Notice(
        `Failed to load target article: ${this.savedAnnotation.target}`
      );
    }
  }
}
