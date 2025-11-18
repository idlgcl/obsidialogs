import { Component } from "obsidian";
import { Comment } from "../utils/parsers";
import { ArticleAutocompleteField } from "./ArticleAutocompleteField";
import { Article } from "../types";

export interface CommentFormOptions {
  container: HTMLElement;
  comment?: Comment;
}

export class CommentForm extends Component {
  private container: HTMLElement;
  private contentEl: HTMLElement;
  private currentComment: Comment | null = null;
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
    this.container = options.container;
    this.currentComment = options.comment || null;
    this.createForm();

    if (this.currentComment) {
      this.loadComment(this.currentComment);
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
    // TODO: Implement show target functionality
  }

  private handleSave(): void {
    // TODO: Implement save functionality
  }

  loadComment(comment: Comment): void {
    this.currentComment = comment;
    if (this.commentTitleInput) {
      this.commentTitleInput.value = comment.title;
    }
    if (this.commentBodyInput) {
      this.commentBodyInput.value = comment.body;
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
