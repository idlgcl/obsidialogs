import { Component, Notice, App } from "obsidian";
import { NoteMeta } from "../utils/parsers";
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
  private articleSplitHandler: ArticleSplitViewHandler | null = null;
  private annotationService: AnnotationService | null = null;
  private apiService: ApiService;

  // Form fields
  private textStartInput: HTMLInputElement | null = null;
  private textEndInput: HTMLInputElement | null = null;
  private textDisplayInput: HTMLInputElement | null = null;
  private targetArticleInput: HTMLInputElement | null = null;
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
    this.articleSplitHandler = options.articleSplitHandler || null;
    this.annotationService = options.annotationService || null;
    this.apiService = new ApiService();

    this.createForm();

    if (this.savedAnnotation) {
      this.loadSavedAnnotation();
    }

    if (this.articleSplitHandler) {
      this.openTargetArticleInSplit();
    }
  }

  private createForm(): void {
    this.contentEl = this.container.createDiv({ cls: "idl-note-form" });

    // Header
    const headerContainer = this.contentEl.createDiv({ cls: "form-header" });
    headerContainer.createEl("h3", { text: "Note" });

    // Form container
    const formContainer = this.contentEl.createDiv({ cls: "idl-form" });

    // Text Start and Text End
    const srcRangeFields = formContainer.createDiv({
      cls: "idl-form-field idl-range-field",
    });

    const startField = srcRangeFields.createDiv({ cls: "idl-start-field" });
    startField.createEl("label", { text: "Text Start" });
    this.textStartInput = startField.createEl("input", {
      type: "text",
      value: this.currentNote.previousWords,
    });
    // this.textStartInput.disabled = true;

    const endField = srcRangeFields.createDiv({ cls: "idl-end-field" });
    endField.createEl("label", { text: "Text End" });
    this.textEndInput = endField.createEl("input", {
      type: "text",
      value: this.currentNote.nextWords,
    });
    // this.textEndInput.disabled = true;

    // Text Display
    const textDisplayField = formContainer.createDiv({ cls: "idl-form-field" });
    textDisplayField.createEl("label", { text: "Text Display" });
    const lastWord = this.currentNote.previousWords.split(/\s+/).pop() || "";
    this.textDisplayInput = textDisplayField.createEl("input", {
      type: "text",
      value: lastWord,
    });
    this.textDisplayInput.disabled = true;

    // Target Article
    const targetArticleField = formContainer.createDiv({
      cls: "idl-form-field",
    });
    targetArticleField.createEl("label", { text: "Target Article" });
    this.targetArticleInput = targetArticleField.createEl("input", {
      type: "text",
      value: this.currentNote.target,
    });
    this.targetArticleInput.disabled = true;

    // Target Text Display
    const targetDisplayField = formContainer.createDiv({
      cls: "idl-form-field",
    });
    targetDisplayField.createEl("label", { text: "Target Text Display" });
    this.targetTextDisplayInput = targetDisplayField.createEl("input", {
      type: "text",
    });

    // Target Text Start and Target Text End
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

    // Input event listeners for validation
    // Source text fields
    this.textStartInput.addEventListener("input", () => this.validateForm());
    this.textEndInput.addEventListener("input", () => this.validateForm());

    // Target text fields
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
    this.saveButton.addEventListener("click", () => this.handleSave());

    this.validateForm();
  }

  private validateSourceTextFields(): { valid: boolean; error?: string } {
    if (!this.textStartInput || !this.textEndInput || !this.textDisplayInput) {
      return { valid: false, error: "Form fields not initialized" };
    }

    const textStart = this.textStartInput.value.trim();
    const textEnd = this.textEndInput.value.trim();
    const textDisplay = this.textDisplayInput.value.trim();

    if (!textStart || !textEnd || !textDisplay) {
      return { valid: false, error: "All source text fields are required" };
    }

    const previousWords = this.currentNote.previousWords;
    const nextWords = this.currentNote.nextWords;

    if (!previousWords.endsWith(textDisplay)) {
      return {
        valid: false,
        error: `Text Display "${textDisplay}" must appear immediately before the link`,
      };
    }

    const beforeDisplay = previousWords
      .slice(0, previousWords.length - textDisplay.length)
      .trim();

    if (beforeDisplay === "") {
      if (textStart !== textDisplay) {
        return {
          valid: false,
          error: `Text Start must be "${textDisplay}" since Text Display is the only word before the link`,
        };
      }
    } else {
      if (beforeDisplay !== textStart && !beforeDisplay.includes(textStart)) {
        return {
          valid: false,
          error: `Text Start "${textStart}" must appear before Text Display in the source text`,
        };
      }
    }

    if (!nextWords.includes(textEnd)) {
      return {
        valid: false,
        error: `Text End "${textEnd}" must appear after the link in the source text`,
      };
    }

    return { valid: true };
  }

  private validateForm(): void {
    if (this.saveButton) {
      this.saveButton.disabled = false;
    }
  }

  private async handleSave(): Promise<void> {
    if (!this.currentNote) {
      new Notice("No note selected");
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

    const textStart = this.textStartInput?.value.trim() || "";
    const textEnd = this.textEndInput?.value.trim() || "";
    const textDisplay = this.textDisplayInput?.value.trim() || "";

    const sourceValidation = this.validateSourceTextFields();
    if (!sourceValidation.valid) {
      new Notice(
        `Source validation failed: ${
          sourceValidation.error || "Invalid source text"
        }`
      );
      return;
    }

    const targetTextStart = this.targetTextStartInput.value.trim();
    const targetTextEnd = this.targetTextEndInput.value.trim();
    const targetTextDisplay = this.targetTextDisplayInput.value.trim();

    if (!targetTextStart) {
      new Notice("Please fill in Target Text Start field");
      return;
    }
    if (!targetTextEnd) {
      new Notice("Please fill in Target Text End field");
      return;
    }
    if (!targetTextDisplay) {
      new Notice("Please fill in Target Text Display field");
      return;
    }

    const articleContent = this.articleSplitHandler.getArticleContent();
    if (!articleContent) {
      new Notice(
        "Article content not available. Please wait for the article to load."
      );
      return;
    }

    const targetValidation = validateTargetTextFields(
      articleContent,
      targetTextStart,
      targetTextEnd,
      targetTextDisplay
    );

    if (!targetValidation.valid) {
      new Notice(
        `Target validation failed: ${
          targetValidation.error || "Invalid target text"
        }`
      );
      return;
    }

    try {
      const noteId = this.savedAnnotation?.id || uuidv4();

      await this.annotationService.saveNote({
        noteId,
        textStart,
        textEnd,
        textDisplay,
        linkText: this.currentNote.linkText,
        targetArticle: this.currentNote.target,
        targetTextStart,
        targetTextEnd,
        targetTextDisplay,
        targetFullText: targetValidation.rangeText || "",
        targetStartOffset: targetValidation.startOffset || 0,
        targetEndOffset: targetValidation.endOffset || 0,
        targetDisplayOffset: targetValidation.displayOffsetInRange || 0,
        sourceFilePath: this.currentNote.filePath,
      });

      new Notice("Note saved successfully");
      this.clearForm();
    } catch (error) {
      new Notice(`Error saving note: ${error.message}`);
      console.error("Error saving note:", error);
    }
  }

  private clearForm(): void {
    if (this.textStartInput) {
      this.textStartInput.value = "";
    }
    if (this.textEndInput) {
      this.textEndInput.value = "";
    }
    if (this.textDisplayInput) {
      this.textDisplayInput.value = "";
    }
    if (this.targetTextStartInput) {
      this.targetTextStartInput.value = "";
    }
    if (this.targetTextEndInput) {
      this.targetTextEndInput.value = "";
    }
    if (this.targetTextDisplayInput) {
      this.targetTextDisplayInput.value = "";
    }
    this.validateForm();
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

    this.validateForm();
  }

  private async openTargetArticleInSplit(): Promise<void> {
    try {
      const targetArticle = await this.apiService.fetchArticleById(
        this.currentNote.target
      );

      if (this.articleSplitHandler) {
        await this.articleSplitHandler.openArticle(targetArticle);
      }
    } catch (error) {
      console.error("Error opening target article:", error);
      new Notice(`Failed to load target article: ${this.currentNote.target}`);
    }
  }

  show(): void {
    this.contentEl.style.display = "block";
  }

  hide(): void {
    this.contentEl.style.display = "none";
  }

  onunload(): void {
    this.contentEl.remove();
  }
}
