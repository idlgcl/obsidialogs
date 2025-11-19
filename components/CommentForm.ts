import { Component, App, Notice } from "obsidian";
import { Comment } from "../utils/parsers";
import { ArticleAutocompleteField } from "./ArticleAutocompleteField";
import { Article } from "../types";
import { AnnotationService, Annotation } from "../utils/annotation-service";
import { ApiService } from "../utils/api";
import { validateTextRange } from "../utils/text-validator";
import { v4 as uuidv4 } from "uuid";

export interface CommentFormOptions {
  container: HTMLElement;
  app: App;
  apiService: ApiService;
  annotationService: AnnotationService;
  comment: Comment;
  onArticleSelected?: (article: Article) => void;
}

export class CommentForm extends Component {
  private options: CommentFormOptions;
  private container: HTMLElement;
  private contentEl: HTMLElement;
  private app: App;
  private apiService: ApiService;
  private annotationService: AnnotationService;
  private currentComment: Comment | null = null;
  private savedAnnotation: Annotation | null = null;
  private commentTitleInput: HTMLInputElement | null = null;
  private commentBodyInput: HTMLTextAreaElement | null = null;
  private articleAutocomplete: ArticleAutocompleteField | null = null;
  private selectedArticle: Article | null = null;
  private targetTextStartInput: HTMLInputElement | null = null;
  private targetTextEndInput: HTMLInputElement | null = null;
  private targetTextDisplayInput: HTMLInputElement | null = null;
  private showTargetButton: HTMLButtonElement | null = null;
  private saveButton: HTMLButtonElement | null = null;

  constructor(options: CommentFormOptions) {
    super();
    this.options = options;
    this.container = options.container;
    this.app = options.app;
    this.apiService = options.apiService;
    this.annotationService = options.annotationService;
    this.currentComment = options.comment || null;
    this.createForm();

    if (this.currentComment) {
      // Load comment asynchronously (including checking for existing annotation)
      this.loadComment(this.currentComment).catch((error) => {
        console.error("[Idealogs] Error loading comment:", error);
      });
    }
  }

  private createForm(): void {
    this.contentEl = this.container.createDiv({ cls: "idl-comment-form" });

    // Header
    const headerContainer = this.contentEl.createDiv({ cls: "form-header" });
    headerContainer.createEl("h3", { text: "Comment" });

    // Form container
    const formContainer = this.contentEl.createDiv({ cls: "idl-form" });

    // Text Display field
    const textDisplayField = formContainer.createDiv({ cls: "idl-form-field" });
    textDisplayField.createEl("label", { text: "Text Display" });
    this.commentTitleInput = textDisplayField.createEl("input", {
      type: "text",
    });
    this.commentTitleInput.disabled = true;

    // Comment field
    const commentField = formContainer.createDiv({ cls: "idl-form-field" });
    commentField.createEl("label", { text: "Comment" });
    this.commentBodyInput = commentField.createEl("textarea", {
      attr: { rows: "4" },
    });
    this.commentBodyInput.disabled = true;

    // Target Article field
    const targetArticleField = formContainer.createDiv({
      cls: "idl-form-field",
    });
    targetArticleField.createEl("label", { text: "Target Article" });

    this.articleAutocomplete = new ArticleAutocompleteField({
      container: targetArticleField,
      placeholder: "Search for an article...",
      onChange: (article) => {
        this.selectedArticle = article;
        if (this.options.onArticleSelected) {
          this.options.onArticleSelected(article);
        }
      },
    });

    this.articleAutocomplete.load();

    // Target text range fields
    const textRangeFields = formContainer.createDiv({
      cls: "idl-form-field idl-range-field",
    });

    const startField = textRangeFields.createDiv({ cls: "idl-start-field" });
    startField.createEl("label", { text: "Target Text Start" });
    this.targetTextStartInput = startField.createEl("input", {
      type: "text",
    });

    const endField = textRangeFields.createDiv({ cls: "idl-end-field" });
    endField.createEl("label", { text: "Target Text End" });
    this.targetTextEndInput = endField.createEl("input", {
      type: "text",
    });

    // Target Text Display field
    const targetDisplayField = formContainer.createDiv({
      cls: "idl-form-field",
    });
    targetDisplayField.createEl("label", { text: "Target Text Display" });
    this.targetTextDisplayInput = targetDisplayField.createEl("input", {
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
    if (!this.selectedArticle) {
      new Notice("Please select a target article first");
      return;
    }
    // The article is already shown via the onArticleSelected callback
    new Notice(`Target article "${this.selectedArticle.title}" is displayed`);
  }

  private async handleSave(): Promise<void> {
    if (!this.currentComment) {
      new Notice("No comment detected");
      return;
    }

    if (!this.selectedArticle) {
      new Notice("Please select a target article");
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

    try {
      // Fetch target article content for validation
      const targetContent = await this.apiService.fetchFileContent(
        this.selectedArticle.id
      );

      // Validate target text fields
      const validation = validateTextRange(
        targetContent,
        targetTextStart,
        targetTextEnd,
        targetTextDisplay
      );

      if (!validation.valid) {
        new Notice(validation.error || "Validation failed");
        return;
      }

      // Create annotation (use existing ID if updating, otherwise create new)
      const annotation: Annotation = {
        id: this.savedAnnotation?.id || uuidv4(),
        kind: "Comment",
        targetId: this.selectedArticle.id,
        targetStart: targetTextStart,
        targetEnd: targetTextEnd,
        targetDisplay: targetTextDisplay,
        targetText: validation.rangeText || "",
        sourceId: this.currentComment.filePath,
        sourceStart: this.currentComment.title.split(" ")[0],
        sourceEnd:
          this.currentComment.body.split(" ").pop() ||
          this.currentComment.title,
        sourceDisplay: this.currentComment.title,
        sourceText: `${this.currentComment.title} ${this.currentComment.body}`,
        isValid: true,
      };

      // Save annotation
      await this.annotationService.saveAnnotation(annotation);

      const action = this.savedAnnotation ? "updated" : "saved";
      new Notice(`Comment ${action} successfully`);

      // Update savedAnnotation for subsequent saves
      this.savedAnnotation = annotation;

      this.clearForm();
    } catch (error) {
      new Notice(`Error saving comment: ${error.message}`);
      console.error("[Idealogs] Error saving comment:", error);
    }
  }

  async loadComment(comment: Comment): Promise<void> {
    this.currentComment = comment;
    if (this.commentTitleInput) {
      this.commentTitleInput.value = comment.title;
    }
    if (this.commentBodyInput) {
      this.commentBodyInput.value = comment.body;
    }

    // Try to find existing annotation for this comment
    try {
      const sourceStart = comment.title.split(" ")[0];
      const sourceEnd = comment.body.split(" ").pop() as string;

      this.savedAnnotation = await this.annotationService.findCommentBySource(
        comment.filePath,
        comment.title,
        sourceStart,
        sourceEnd
      );

      if (this.savedAnnotation) {
        // Populate form with saved annotation data
        await this.loadSavedAnnotation();
      }
    } catch (error) {
      console.error("[Idealogs] Error loading saved annotation:", error);
    }
  }

  private async loadSavedAnnotation(): Promise<void> {
    if (!this.savedAnnotation) return;

    // Populate target text fields
    if (this.targetTextStartInput) {
      this.targetTextStartInput.value = this.savedAnnotation.targetStart;
    }
    if (this.targetTextEndInput) {
      this.targetTextEndInput.value = this.savedAnnotation.targetEnd;
    }
    if (this.targetTextDisplayInput) {
      this.targetTextDisplayInput.value = this.savedAnnotation.targetDisplay;
    }

    // Load and set the target article
    try {
      const targetArticle = await this.apiService.fetchArticleById(
        this.savedAnnotation.targetId
      );
      this.selectedArticle = targetArticle;

      if (this.articleAutocomplete) {
        this.articleAutocomplete.setValue(targetArticle.id);
      }

      // Trigger the onArticleSelected callback to show the article
      if (this.options.onArticleSelected) {
        this.options.onArticleSelected(targetArticle);
      }
    } catch (error) {
      console.error("[Idealogs] Error loading target article:", error);
      new Notice(
        `Failed to load saved target article: ${this.savedAnnotation.targetId}`
      );
    }
  }

  clearForm(): void {
    if (this.commentTitleInput) {
      this.commentTitleInput.value = "";
    }
    if (this.commentBodyInput) {
      this.commentBodyInput.value = "";
    }
    if (this.articleAutocomplete) {
      this.articleAutocomplete.setValue("");
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
    this.selectedArticle = null;
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
