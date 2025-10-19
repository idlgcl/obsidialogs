import { Component, Notice, App } from "obsidian";
import { NoteMeta } from "../utils/parsers";
import { ArticleAutocompleteField } from "./ArticleAutocompleteField";
import { Article } from "../types";
import { ArticleSplitViewHandler } from "../utils/article-split-handler";
import { AnnotationService, AnnotationData } from "../utils/annotation-service";
import { validateTargetTextFields } from "../utils/text-validator";
import { ApiService } from "../utils/api";
import { v4 as uuidv4 } from "uuid";

export interface NoteFormOptions {
  container: HTMLElement;
  app: App;
  note: NoteMeta;
  savedAnnotation?: AnnotationData | null;
  openTargetArticle?: boolean;
  articleSplitHandler?: ArticleSplitViewHandler | null;
  annotationService?: AnnotationService | null;
}

export class NoteForm extends Component {
  private container: HTMLElement;
  private contentEl: HTMLElement;
  private app: App;
  private currentNote: NoteMeta;
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

  constructor(options: NoteFormOptions) {
    super();
    this.container = options.container;
    this.app = options.app;
    this.currentNote = options.note;
    this.savedAnnotation = options.savedAnnotation || null;
    this.shouldOpenArticle = options.openTargetArticle || false;
    this.articleSplitHandler = options.articleSplitHandler || null;
    this.annotationService = options.annotationService || null;
    this.apiService = new ApiService();

    this.createForm();

    if (this.savedAnnotation) {
      this.loadSavedAnnotation();
      if (this.shouldOpenArticle) {
        this.openTargetArticle();
      }
    }
  }

  private createForm(): void {
    this.contentEl = this.container.createDiv({ cls: "idl-note-form" });

    // Header
    const headerContainer = this.contentEl.createDiv({ cls: "form-header" });
    headerContainer.createEl("h3", { text: "Note" });

    // Form container
    const formContainer = this.contentEl.createDiv({ cls: "idl-form" });

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
      !this.textStartInput ||
      !this.textEndInput ||
      !this.textDisplayInput ||
      !this.targetTextStartInput ||
      !this.targetTextEndInput ||
      !this.targetTextDisplayInput
    ) {
      return;
    }

    // Get source field values
    const textStart = this.textStartInput.value.trim();
    const textEnd = this.textEndInput.value.trim();
    const textDisplay = this.textDisplayInput.value.trim();

    if (!textStart || !textEnd || !textDisplay) {
      new Notice("Please fill all source text fields");
      return;
    }

    // Validate source text display position
    try {
      const fileContent = await this.app.vault.adapter.read(
        this.currentNote.filePath
      );
      const linkText = this.currentNote.linkText;

      // Escape special regex characters in both textDisplay and linkText
      const escapedDisplay = textDisplay.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const escapedLink = linkText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const correctSequencePattern = new RegExp(
        `${escapedDisplay}\\s*${escapedLink}`
      );

      if (!correctSequencePattern.test(fileContent)) {
        new Notice(
          `Text display "${textDisplay}" must appear directly before the link`
        );
        return;
      }
    } catch (error) {
      console.error("Error validating text display position:", error);
      new Notice("Error reading source file");
      return;
    }

    // Get target field values
    const targetTextStart = this.targetTextStartInput.value.trim();
    const targetTextEnd = this.targetTextEndInput.value.trim();
    const targetTextDisplay = this.targetTextDisplayInput.value.trim();

    if (!targetTextStart || !targetTextEnd || !targetTextDisplay) {
      new Notice("Please fill in all target text fields");
      return;
    }

    // Get article content for validation
    const articleContent = this.articleSplitHandler.getArticleContent();
    if (!articleContent) {
      new Notice(
        "Article content not available. Please select an article first."
      );
      return;
    }

    // Validate target text fields
    const validation = validateTargetTextFields(
      articleContent,
      targetTextStart,
      targetTextEnd,
      targetTextDisplay
    );

    if (!validation.valid) {
      new Notice(validation.error || "Validation failed");
      return;
    }

    // Save the note
    try {
      const noteId = this.savedAnnotation?.id || uuidv4();

      await this.annotationService.saveNote({
        noteId,
        textStart,
        textEnd,
        textDisplay,
        targetArticle: this.selectedArticle.id,
        targetTextStart,
        targetTextEnd,
        targetTextDisplay,
        targetFullText: validation.rangeText || "",
        targetStartOffset: validation.startOffset || 0,
        targetEndOffset: validation.endOffset || 0,
        targetDisplayOffset: validation.displayOffsetInRange || 0,
        sourceFilePath: this.currentNote.filePath,
      });

      new Notice("Note saved successfully");
    } catch (error) {
      new Notice(`Error saving note: ${error.message}`);
      console.error("Error saving note:", error);
    }
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

  show(): void {
    this.contentEl.style.display = "block";
  }

  hide(): void {
    this.contentEl.style.display = "none";
  }

  onunload(): void {
    if (this.articleAutocomplete) {
      this.articleAutocomplete.unload();
      this.articleAutocomplete = null;
    }
    this.contentEl.remove();
  }
}
