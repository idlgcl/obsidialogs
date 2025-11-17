import { ItemView, WorkspaceLeaf } from "obsidian";
import { Comment } from "../utils/parsers";

export const FORM_VIEW_TYPE = "form-view";

export class FormView extends ItemView {
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
    // Initialize view
  }

  async onClose(): Promise<void> {
    // Cleanup
  }

  clear(): void {
    this.contentEl.empty();
  }

  updateComment(comment: Comment): void {
    this.clear();
  }
}
