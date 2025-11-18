import { ItemView, WorkspaceLeaf } from "obsidian";
import { Comment } from "../utils/parsers";
import { CommentForm } from "./CommentForm";

export const FORM_VIEW_TYPE = "form-view";

export class FormView extends ItemView {
  private commentForm: CommentForm | null = null;

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
    const container = this.containerEl.children[1];
    container.empty();

    this.commentForm = new CommentForm({
      container: container as HTMLElement,
    });
    this.commentForm.load();
  }

  async onClose(): Promise<void> {
    this.clear();
  }

  clear(): void {
    if (this.commentForm) {
      this.commentForm.unload();
      this.commentForm = null;
    }
    this.contentEl.empty();
  }

  updateComment(comment: Comment): void {
    if (this.commentForm) {
      this.commentForm.loadComment(comment);
    }
  }
}
