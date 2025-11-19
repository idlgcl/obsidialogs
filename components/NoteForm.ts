import { Component, App, Notice } from "obsidian";
import { Article } from "../types";
import { AnnotationService, Annotation } from "../utils/annotation-service";
import { ApiService } from "../utils/api";
import { validateTextRange } from "../utils/text-validator";
import { v4 as uuidv4 } from "uuid";

export interface NoteFormOptions {
  container: HTMLElement;
  app: App;
  apiService: ApiService;
  annotationService: AnnotationService;
  targetArticle: Article;
  sourceFilePath: string;
  onArticleSelected?: (article: Article) => void;
}

export class NoteForm extends Component {
  private options: NoteFormOptions;
  private container: HTMLElement;
  private contentEl: HTMLElement;
  private app: App;
  private apiService: ApiService;
  private annotationService: AnnotationService;
  private targetArticle: Article;
  private sourceFilePath: string;
  private savedAnnotation: Annotation | null = null;

  // Source fields
  private sourceTextStartInput: HTMLInputElement | null = null;
  private sourceTextEndInput: HTMLInputElement | null = null;
  private sourceTextDisplayInput: HTMLInputElement | null = null;

  // Target fields
  private targetArticleInput: HTMLInputElement | null = null;
  private targetTextStartInput: HTMLInputElement | null = null;
  private targetTextEndInput: HTMLInputElement | null = null;
  private targetTextDisplayInput: HTMLInputElement | null = null;

  // Buttons
  private showTargetButton: HTMLButtonElement | null = null;
  private saveButton: HTMLButtonElement | null = null;

  constructor(options: NoteFormOptions) {
    super();
    this.options = options;
    this.container = options.container;
    this.app = options.app;
    this.apiService = options.apiService;
    this.annotationService = options.annotationService;
    this.targetArticle = options.targetArticle;
    this.sourceFilePath = options.sourceFilePath;

    this.createForm();
  }

  private createForm(): void {
    this.contentEl = this.container.createDiv({ cls: "idl-note-form" });

    // Header
    const headerContainer = this.contentEl.createDiv({ cls: "form-header" });
    headerContainer.createEl("h3", { text: "Note" });

    // Form container
    const formContainer = this.contentEl.createDiv({ cls: "idl-form" });

    // Source Text Start and End
    const sourceRangeFields = formContainer.createDiv({
      cls: "idl-form-field idl-range-field",
    });

    const sourceStartField = sourceRangeFields.createDiv({
      cls: "idl-start-field",
    });
    sourceStartField.createEl("label", { text: "Source Text Start" });
    this.sourceTextStartInput = sourceStartField.createEl("input", {
      type: "text",
    });

    const sourceEndField = sourceRangeFields.createDiv({
      cls: "idl-end-field",
    });
    sourceEndField.createEl("label", { text: "Source Text End" });
    this.sourceTextEndInput = sourceEndField.createEl("input", {
      type: "text",
    });

    // Source Text Display
    const sourceDisplayField = formContainer.createDiv({
      cls: "idl-form-field",
    });
    sourceDisplayField.createEl("label", { text: "Source Text Display" });
    this.sourceTextDisplayInput = sourceDisplayField.createEl("input", {
      type: "text",
    });

    // Target Article (disabled, pre-populated)
    const targetArticleField = formContainer.createDiv({
      cls: "idl-form-field",
    });
    targetArticleField.createEl("label", { text: "Target Article" });
    this.targetArticleInput = targetArticleField.createEl("input", {
      type: "text",
      value: `${this.targetArticle.id}`,
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

    // Target Text Start and End
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

    // Buttons
    const buttonContainer = formContainer.createDiv({ cls: "idl-btns" });
    this.showTargetButton = buttonContainer.createEl("button", {
      text: "Show Target",
    });
    this.showTargetButton.addEventListener("click", () =>
      this.handleShowTarget()
    );

    this.saveButton = buttonContainer.createEl("button", { text: "Save" });
    this.saveButton.addEventListener("click", () => this.handleSave());
  }

  private handleShowTarget(): void {
    if (this.options.onArticleSelected) {
      this.options.onArticleSelected(this.targetArticle);
    }
    new Notice(`Target article "${this.targetArticle.title}" is displayed`);
  }

  private async handleSave(): Promise<void> {
    if (
      !this.sourceTextStartInput ||
      !this.sourceTextEndInput ||
      !this.sourceTextDisplayInput ||
      !this.targetTextStartInput ||
      !this.targetTextEndInput ||
      !this.targetTextDisplayInput
    ) {
      return;
    }

    const sourceTextStart = this.sourceTextStartInput.value.trim();
    const sourceTextEnd = this.sourceTextEndInput.value.trim();
    const sourceTextDisplay = this.sourceTextDisplayInput.value.trim();
    const targetTextStart = this.targetTextStartInput.value.trim();
    const targetTextEnd = this.targetTextEndInput.value.trim();
    const targetTextDisplay = this.targetTextDisplayInput.value.trim();

    // Validate source fields
    if (!sourceTextStart || !sourceTextEnd || !sourceTextDisplay) {
      new Notice("Please fill in all source text fields");
      return;
    }

    // Validate target fields
    if (!targetTextStart || !targetTextEnd || !targetTextDisplay) {
      new Notice("Please fill in all target text fields");
      return;
    }

    try {
      // Fetch target article content for validation
      const targetContent = await this.apiService.fetchFileContent(
        this.targetArticle.id
      );

      // Validate target text fields
      const validation = validateTextRange(
        targetContent,
        targetTextStart,
        targetTextEnd,
        targetTextDisplay
      );

      if (!validation.valid) {
        new Notice(validation.error || "Target validation failed");
        return;
      }

      // Create annotation
      const annotation: Annotation = {
        id: this.savedAnnotation?.id || uuidv4(),
        kind: "Note",
        targetId: this.targetArticle.id,
        targetStart: targetTextStart,
        targetEnd: targetTextEnd,
        targetDisplay: targetTextDisplay,
        targetText: validation.rangeText || "",
        sourceId: this.sourceFilePath,
        sourceStart: sourceTextStart,
        sourceEnd: sourceTextEnd,
        sourceDisplay: sourceTextDisplay,
        sourceText: `${sourceTextStart}...${sourceTextEnd}`,
        isValid: true,
      };

      // Save annotation
      await this.annotationService.saveAnnotation(annotation);

      const action = this.savedAnnotation ? "updated" : "saved";
      new Notice(`Note ${action} successfully`);

      // Update savedAnnotation for subsequent saves
      this.savedAnnotation = annotation;

      this.clearForm();
    } catch (error) {
      new Notice(`Error saving note: ${error.message}`);
      console.error("[Idealogs] Error saving note:", error);
    }
  }

  clearForm(): void {
    if (this.sourceTextStartInput) {
      this.sourceTextStartInput.value = "";
    }
    if (this.sourceTextEndInput) {
      this.sourceTextEndInput.value = "";
    }
    if (this.sourceTextDisplayInput) {
      this.sourceTextDisplayInput.value = "";
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
