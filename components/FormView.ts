import { ItemView, WorkspaceLeaf } from "obsidian";
import { Comment } from "../utils/parsers";
import { CommentForm } from "./CommentForm";

export const FORM_VIEW_TYPE = "form-view";

export class FormView extends ItemView {
  private commentForm: CommentForm | null = null;
  private container: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return FORM_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Annotation Form";
  }

  getIcon(): string {
    return "brackets";
  }

  async onOpen(): Promise<void> {
    this.container = this.containerEl.children[1] as HTMLElement;
    this.container.empty();
  }

  async onClose(): Promise<void> {
    this.clear();
  }

  clear(): void {
    if (this.commentForm) {
      this.commentForm.unload();
      this.commentForm = null;
    }
    if (this.container) {
      this.container.empty();
    }
  }

  updateComment(comment: Comment): void {
    // Clear existing form if any
    if (this.commentForm) {
      this.commentForm.unload();
      this.commentForm = null;
    }

    if (this.container) {
      this.container.empty();
    }

    // Create new form with the detected comment
    if (this.container) {
      this.commentForm = new CommentForm({
        container: this.container,
        comment: comment,
      });
      this.commentForm.load();
    }
  }
}
