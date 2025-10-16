import { ItemView, WorkspaceLeaf } from "obsidian";
import { Comment } from "../utils/parsers";
import { ArticleAutocompleteField } from "./ArticleAutocompleteField";
import { Article } from "../types";

export const COMMENT_FORM_VIEW = "comment-form-view";

export class CommentFormView extends ItemView {
  private currentComment: Comment | null = null;
  private articleAutocomplete: ArticleAutocompleteField | null = null;
  private selectedArticle: Article | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
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

  updateComment(comment: Comment): void {
    this.currentComment = comment;
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

    // Create new autocomplete
    this.articleAutocomplete = new ArticleAutocompleteField({
      container: targetArticleField,
      placeholder: "Search for an article...",
      onChange: (article) => {
        this.selectedArticle = article;
        console.log("Selected article:", article);
      },
    });

    // Load the component
    this.articleAutocomplete.load();

    // Target text range fields
    const textRangeFields = formContainer.createDiv({
      cls: "idl-form-field idl-range-field",
    });

    const startField = textRangeFields.createDiv({ cls: "idl-start-field" });
    startField.createEl("label", { text: "Target Text Start" });
    const targetTextStartInput = startField.createEl("input", {
      type: "text",
    });

    const endField = textRangeFields.createDiv({ cls: "idl-end-field" });
    endField.createEl("label", { text: "Target Text End" });
    const targetTextEndInput = endField.createEl("input", {
      type: "text",
    });

    // Target text display field
    const targetDisplayField = formContainer.createDiv({
      cls: "idl-form-field",
    });
    targetDisplayField.createEl("label", { text: "Target Text Display" });
    const targetTextDisplayInput = targetDisplayField.createEl("input", {
      type: "text",
    });

    // Button container
    const buttonContainer = formContainer.createDiv({ cls: "idl-btns" });
    const saveButton = buttonContainer.createEl("button", { text: "Save" });
  }
}
