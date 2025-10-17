import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import { Comment } from "../utils/parsers";
import { ArticleAutocompleteField } from "./ArticleAutocompleteField";
import { Article } from "../types";
import { ArticleSplitViewHandler } from "../utils/article-split-handler";
import { AnnotationService, AnnotationData } from "../utils/annotation-service";
import { validateTargetTextFields } from "../utils/text-validator";
import { ApiService } from "../utils/api";
import { v4 as uuidv4 } from "uuid";

export const COMMENT_FORM_VIEW = "comment-form-view";

export class CommentFormView extends ItemView {
  private currentComment: Comment | null = null;
  private savedAnnotation: AnnotationData | null = null;
  private articleAutocomplete: ArticleAutocompleteField | null = null;
  private selectedArticle: Article | null = null;
  private articleSplitHandler: ArticleSplitViewHandler | null = null;
  private annotationService: AnnotationService | null = null;
  private apiService: ApiService;
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
    return COMMENT_FORM_VIEW;
  }

  getDisplayText(): string {
    return "Comment Form";
  }

  getIcon(): string {
    return "brackets";
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

  updateComment(
    comment: Comment,
    savedAnnotation: AnnotationData | null = null
  ): void {
    this.currentComment = comment;
    this.savedAnnotation = savedAnnotation;
    this.render();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("idl-comment-form");

    if (!this.currentComment) {
      container.createEl("div", {
        text: "No comment selected",
        cls: "comment-form-placeholder",
      });
      return;
    }

    // Header
    const headerContainer = container.createDiv({ cls: "form-header" });
    headerContainer.createEl("h3", { text: "Comment" });

    // Form container
    const formContainer = container.createDiv({ cls: "idl-form" });

    // Text Display field
    const textDisplayField = formContainer.createDiv({ cls: "idl-form-field" });
    textDisplayField.createEl("label", { text: "Text Display" });
    const textDisplayInput = textDisplayField.createEl("input", {
      type: "text",
      value: this.currentComment.title,
    });
    textDisplayInput.disabled = true;

    // Comment field
    const commentField = formContainer.createDiv({ cls: "idl-form-field" });
    commentField.createEl("label", { text: "Comment" });
    const commentTextarea = commentField.createEl("textarea", {
      attr: { rows: "4" },
    });
    commentTextarea.value = this.currentComment.body;
    commentTextarea.disabled = true;

    // Target Article field
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

    this.targetTextStartInput.addEventListener("input", () =>
      this.validateForm()
    );
    this.targetTextEndInput.addEventListener("input", () =>
      this.validateForm()
    );
    this.targetTextDisplayInput.addEventListener("input", () =>
      this.validateForm()
    );

    const buttonContainer = formContainer.createDiv({ cls: "idl-btns" });
    this.saveButton = buttonContainer.createEl("button", { text: "Save" });
    this.saveButton.disabled = true;
    this.saveButton.addEventListener("click", () => this.handleSave());

    if (this.savedAnnotation) {
      this.loadSavedAnnotation();
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
    } catch (error) {
      new Notice(`Error saving comment: ${error.message}`);
      console.error("Error saving comment:", error);
    }
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

    // try {
    //   const targetArticle = await this.apiService.fetchArticleById(
    //     this.savedAnnotation.target
    //   );

    //   this.selectedArticle = targetArticle;

    //   if (this.articleAutocomplete) {
    //     this.articleAutocomplete.setValue(targetArticle.id);
    //   }

    //   if (this.articleSplitHandler) {
    //     await this.articleSplitHandler.openArticle(targetArticle);
    //   }

    //   this.validateForm();
    // } catch (error) {
    //   console.error("Error loading saved annotation:", error);
    //   new Notice(
    //     `Failed to load target article: ${this.savedAnnotation.target}`
    //   );
    // }
  }
}
