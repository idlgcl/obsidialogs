import { Component, Notice, App } from "obsidian";
import { Comment } from "../utils/parsers";
import { ArticleAutocompleteField } from "./ArticleAutocompleteField";
import { Article } from "../types";
import { ArticleSplitViewHandler } from "../utils/article-split-handler";
import { AnnotationService, AnnotationData } from "../utils/annotation-service";
import { validateTargetTextFields } from "../utils/text-validator";
import { ApiService } from "../utils/api";
import { v4 as uuidv4 } from "uuid";

export interface CommentFormOptions {
  container: HTMLElement;
  app: App;
  comment: Comment;
  savedAnnotation?: AnnotationData | null;
  openTargetArticle?: boolean;
  articleSplitHandler?: ArticleSplitViewHandler | null;
  annotationService?: AnnotationService | null;
}

export class CommentForm extends Component {
  private container: HTMLElement;
  private contentEl: HTMLElement;
  private app: App;
  private currentComment: Comment;
  private savedAnnotation: AnnotationData | null = null;
  private shouldOpenArticle = false;
  private articleAutocomplete: ArticleAutocompleteField | null = null;
  private selectedArticle: Article | null = null;
  private articleSplitHandler: ArticleSplitViewHandler | null = null;
  private annotationService: AnnotationService | null = null;
  private apiService: ApiService;
  private commentTitleInput: HTMLInputElement | null = null;
  private commentBodyInput: HTMLTextAreaElement | null = null;
  private targetTextStartInput: HTMLInputElement | null = null;
  private targetTextEndInput: HTMLInputElement | null = null;
  private targetTextDisplayInput: HTMLInputElement | null = null;
  private saveButton: HTMLButtonElement | null = null;

  constructor(options: CommentFormOptions) {
    super();
    this.container = options.container;
    this.app = options.app;
    this.currentComment = options.comment;
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

    if (options.savedAnnotation?.target) {
      this.loadTargetArticle();
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
    const textDisplayInput = textDisplayField.createEl("input", {
      type: "text",
      value: this.currentComment.title,
    });
    textDisplayInput.disabled = true;
    this.commentTitleInput = textDisplayInput;

    // Comment field
    const commentField = formContainer.createDiv({ cls: "idl-form-field" });
    commentField.createEl("label", { text: "Comment" });
    const commentTextarea = commentField.createEl("textarea", {
      attr: { rows: "4" },
    });
    commentTextarea.value = this.currentComment.body;
    commentTextarea.disabled = true;
    this.commentBodyInput = commentTextarea;

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

        if (this.articleSplitHandler) {
          this.articleSplitHandler.openArticle(article);
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

    const targetDisplayField = formContainer.createDiv({
      cls: "idl-form-field",
    });
    targetDisplayField.createEl("label", { text: "Target Text Display" });
    this.targetTextDisplayInput = targetDisplayField.createEl("input", {
      type: "text",
    });

    const buttonContainer = formContainer.createDiv({ cls: "idl-btns" });
    this.saveButton = buttonContainer.createEl("button", { text: "Save" });
    this.saveButton.addEventListener("click", () => this.handleSave());
  }

  private async handleSave(): Promise<void> {
    if (!this.currentComment) {
      new Notice("No comment selected");
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

    const articleContent = this.articleSplitHandler.getArticleContent();
    if (!articleContent) {
      new Notice(
        "Article content not available. Please select an article first."
      );
      return;
    }

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

    try {
      const commentId = uuidv4();

      await this.annotationService.saveComment({
        commentId,
        textDisplay: this.currentComment.title,
        commentBody: this.currentComment.body,
        targetArticle: this.selectedArticle.id,
        targetTextStart,
        targetTextEnd,
        targetTextDisplay,
        targetFullText: validation.rangeText || "",
        targetStartOffset: validation.startOffset || 0,
        targetEndOffset: validation.endOffset || 0,
        targetDisplayOffset: validation.displayOffsetInRange || 0,
        sourceFilePath: this.currentComment.filePath,
      });

      new Notice("Comment saved successfully");
      this.clearForm();
    } catch (error) {
      new Notice(`Error saving comment: ${error.message}`);
      console.error("Error saving comment:", error);
    }
  }

  private clearForm(): void {
    if (this.targetTextStartInput) {
      this.targetTextStartInput.value = "";
    }
    if (this.targetTextEndInput) {
      this.targetTextEndInput.value = "";
    }
    if (this.targetTextDisplayInput) {
      this.targetTextDisplayInput.value = "";
    }
    if (this.articleAutocomplete) {
      this.articleAutocomplete.setValue("");
    }
    this.selectedArticle = null;
  }

  private async loadSavedAnnotation(): Promise<void> {
    if (!this.savedAnnotation) return;

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

  private async loadTargetArticle(): Promise<void> {
    if (!this.savedAnnotation) return;

    try {
      const targetArticle = await this.apiService.fetchArticleById(
        this.savedAnnotation.target
      );

      this.selectedArticle = targetArticle;

      if (this.articleAutocomplete) {
        this.articleAutocomplete.setValue(targetArticle.id);
      }
    } catch (error) {
      console.error("Error loading saved annotation:", error);
      new Notice(
        `Failed to load target article: ${this.savedAnnotation.target}`
      );
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
