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
  hideSourceFields: boolean;
  sourceLineText: string;
  lineIndex: number;
  sameLinkCount: number;
  onArticleSelected?: (article: Article) => void;
  onFlashText?: (text: string) => void;
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
  private hideSourceFields: boolean;
  private sourceLineText: string;
  private lineIndex: number;
  private sameLinkCount: number;
  private savedAnnotation: Annotation | null = null;
  private savedNotes: Annotation[] = [];
  private currentNoteIndex = 0;

  // Source fields
  private sourceFieldsContainer: HTMLElement | null = null;
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
  private newNoteButton: HTMLButtonElement | null = null;
  private prevButton: HTMLButtonElement | null = null;
  private nextButton: HTMLButtonElement | null = null;

  // Navigation indicator
  private noteIndicator: HTMLElement | null = null;

  constructor(options: NoteFormOptions) {
    super();
    this.options = options;
    this.container = options.container;
    this.app = options.app;
    this.apiService = options.apiService;
    this.annotationService = options.annotationService;
    this.targetArticle = options.targetArticle;
    this.sourceFilePath = options.sourceFilePath;
    this.hideSourceFields = options.hideSourceFields;
    this.sourceLineText = options.sourceLineText;
    this.lineIndex = options.lineIndex;
    this.sameLinkCount = options.sameLinkCount;

    this.createForm();

    // Try to load existing annotation
    this.loadExistingAnnotation().catch((error) => {
      console.error("[Idealogs] Error loading existing annotation:", error);
    });
  }

  private createForm(): void {
    this.contentEl = this.container.createDiv({ cls: "idl-note-form" });

    // Header with navigation controls
    const headerContainer = this.contentEl.createDiv({ cls: "form-header" });
    headerContainer.createEl("h3", { text: "Note" });

    // Spacer to push buttons to the right
    headerContainer.createDiv({ cls: "idl-spacer" });

    // New Note button
    this.newNoteButton = headerContainer.createEl("button", {
      text: "New Note",
    });
    this.newNoteButton.style.display = "none";
    this.newNoteButton.addEventListener("click", () => this.handleNewNote());

    // Navigation container
    const navContainer = headerContainer.createDiv({ cls: "idl-note-nav" });
    navContainer.style.display = "none";

    this.prevButton = navContainer.createEl("button", { text: "<<" });
    this.prevButton.addEventListener("click", () => this.handlePrevNote());

    this.noteIndicator = navContainer.createEl("span", {
      cls: "idl-note-indicator",
      text: "1 of 1",
    });

    this.nextButton = navContainer.createEl("button", { text: ">>" });
    this.nextButton.addEventListener("click", () => this.handleNextNote());

    // Form container
    const formContainer = this.contentEl.createDiv({ cls: "idl-form" });

    // Source fields container (can be hidden)
    this.sourceFieldsContainer = formContainer.createDiv({
      cls: "idl-source-fields-container",
    });

    if (this.hideSourceFields) {
      this.sourceFieldsContainer.style.display = "none";
    }

    // Source Text Start and End
    const sourceRangeFields = this.sourceFieldsContainer.createDiv({
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
    const sourceDisplayField = this.sourceFieldsContainer.createDiv({
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

    // Primary buttons row
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

  private handleNewNote(): void {
    // Clear form for new note
    this.savedAnnotation = null;
    this.clearForm();
    new Notice("Creating new note");
  }

  private handlePrevNote(): void {
    if (this.savedNotes.length <= 1) return;

    this.currentNoteIndex =
      (this.currentNoteIndex - 1 + this.savedNotes.length) %
      this.savedNotes.length;
    this.loadNoteAtIndex(this.currentNoteIndex);
  }

  private handleNextNote(): void {
    if (this.savedNotes.length <= 1) return;

    this.currentNoteIndex =
      (this.currentNoteIndex + 1) % this.savedNotes.length;
    this.loadNoteAtIndex(this.currentNoteIndex);
  }

  private loadNoteAtIndex(index: number): void {
    const note = this.savedNotes[index];
    if (!note) return;

    this.savedAnnotation = note;

    // Populate form fields
    if (this.sourceTextStartInput && note.sourceStart) {
      this.sourceTextStartInput.value = note.sourceStart;
    }
    if (this.sourceTextEndInput && note.sourceEnd) {
      this.sourceTextEndInput.value = note.sourceEnd;
    }
    if (this.sourceTextDisplayInput && note.sourceDisplay) {
      this.sourceTextDisplayInput.value = note.sourceDisplay;
    }
    if (this.targetTextStartInput) {
      this.targetTextStartInput.value = note.targetStart;
    }
    if (this.targetTextEndInput) {
      this.targetTextEndInput.value = note.targetEnd;
    }
    if (this.targetTextDisplayInput) {
      this.targetTextDisplayInput.value = note.targetDisplay;
    }

    this.updateNavigationUI();

    // Flash the target text in WritingView
    if (this.options.onFlashText && note.targetText) {
      // this.options.onFlashText(note.targetText);
      const textToFlash = note.targetText;
      setTimeout(() => {
        if (this.options.onFlashText) {
          this.options.onFlashText(textToFlash);
        }
      }, 100);
    }
  }

  private updateNavigationUI(): void {
    // Update note indicator
    if (this.noteIndicator) {
      this.noteIndicator.textContent = ` ${this.currentNoteIndex + 1} of ${
        this.savedNotes.length
      }`;
    }

    // Show/hide navigation based on number of saved notes
    const navContainer = this.noteIndicator?.parentElement;
    if (navContainer) {
      navContainer.style.display = this.savedNotes.length > 1 ? "flex" : "none";
    }

    // Show/hide New Note button
    if (this.newNoteButton) {
      this.newNoteButton.style.display =
        this.savedNotes.length < this.sameLinkCount ? "block" : "none";
    }
  }

  private async handleSave(): Promise<void> {
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

    // Validate target fields
    if (!targetTextStart || !targetTextEnd || !targetTextDisplay) {
      new Notice("Please fill in all target text fields");
      return;
    }

    // Get source field values (may be empty if hidden)
    let sourceTextStart = "";
    let sourceTextEnd = "";
    let sourceTextDisplay = "";

    if (!this.hideSourceFields) {
      if (
        !this.sourceTextStartInput ||
        !this.sourceTextEndInput ||
        !this.sourceTextDisplayInput
      ) {
        return;
      }

      sourceTextStart = this.sourceTextStartInput.value.trim();
      sourceTextEnd = this.sourceTextEndInput.value.trim();
      sourceTextDisplay = this.sourceTextDisplayInput.value.trim();

      // Validate source fields are filled
      if (!sourceTextStart || !sourceTextEnd || !sourceTextDisplay) {
        new Notice("Please fill in all source text fields");
        return;
      }

      // Validate source fields exist in the line text
      if (!this.sourceLineText.includes(sourceTextStart)) {
        new Notice("Source Text Start not found in the line");
        return;
      }
      if (!this.sourceLineText.includes(sourceTextEnd)) {
        new Notice("Source Text End not found in the line");
        return;
      }
      if (!this.sourceLineText.includes(sourceTextDisplay)) {
        new Notice("Source Text Display not found in the line");
        return;
      }

      // Validate source range uniqueness for same-line duplicate links
      const existingNotes = await this.annotationService.findNotesByLineIndex(
        this.sourceFilePath,
        this.targetArticle.id,
        this.lineIndex
      );

      for (const existingNote of existingNotes) {
        // Skip the current annotation being updated
        if (
          this.savedAnnotation &&
          existingNote.id === this.savedAnnotation.id
        ) {
          continue;
        }

        // Check for duplicate source range
        if (
          existingNote.sourceStart === sourceTextStart &&
          existingNote.sourceEnd === sourceTextEnd
        ) {
          new Notice(
            "Source text range already used by another note on this line"
          );
          return;
        }
      }
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
        sourceText: this.hideSourceFields
          ? ""
          : this.extractSourceText(sourceTextStart, sourceTextEnd),
        lineIndex: this.lineIndex,
        isValid: true,
      };

      // Save annotation
      await this.annotationService.saveAnnotation(annotation);

      const isUpdate = this.savedAnnotation !== null;
      const action = isUpdate ? "updated" : "saved";
      new Notice(`Note ${action} successfully`);

      // Update savedAnnotation for subsequent saves
      this.savedAnnotation = annotation;

      // Update savedNotes array
      if (isUpdate) {
        // Replace existing note in array
        const index = this.savedNotes.findIndex((n) => n.id === annotation.id);
        if (index >= 0) {
          this.savedNotes[index] = annotation;
        }
      } else {
        // Add new note to array
        this.savedNotes.push(annotation);
        this.currentNoteIndex = this.savedNotes.length - 1;
      }

      this.updateNavigationUI();
      this.clearForm();
    } catch (error) {
      new Notice(`Error saving note: ${(error as Error).message}`);
      console.error("[Idealogs] Error saving note:", error);
    }
  }

  private extractSourceText(
    sourceTextStart: string,
    sourceTextEnd: string
  ): string {
    const startIndex = this.sourceLineText.indexOf(sourceTextStart);
    const endIndex = this.sourceLineText.indexOf(sourceTextEnd);

    if (startIndex === -1 || endIndex === -1) {
      return `${sourceTextStart}...${sourceTextEnd}`;
    }

    return this.sourceLineText.substring(
      startIndex,
      endIndex + sourceTextEnd.length
    );
  }

  private async loadExistingAnnotation(): Promise<void> {
    try {
      // Load all notes for this link on this line
      this.savedNotes = await this.annotationService.findNotesByLineIndex(
        this.sourceFilePath,
        this.targetArticle.id,
        this.lineIndex
      );

      if (this.savedNotes.length > 0) {
        // Load the first note
        this.currentNoteIndex = 0;
        this.loadNoteAtIndex(0);
      } else {
        // No saved notes, update UI to show New Note button if applicable
        this.updateNavigationUI();
      }
    } catch (error) {
      console.error("[Idealogs] Error loading existing annotation:", error);
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
