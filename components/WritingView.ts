import { ItemView, WorkspaceLeaf, MarkdownRenderer } from "obsidian";

export const WRITING_VIEW_TYPE = "writing-view";

export class WritingView extends ItemView {
  private currentArticleId: string | null = null;
  private contentContainer: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return WRITING_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "";
  }

  getIcon(): string {
    return "brackets";
  }

  async onOpen(): Promise<void> {
    this.contentContainer = this.contentEl.createDiv({
      cls: "writing-view-container markdown-preview-view",
    });
  }

  async onClose(): Promise<void> {
    this.clear();
  }

  clear(): void {
    if (this.contentContainer) {
      this.contentContainer.empty();
    }
    this.currentArticleId = null;
  }

  getCurrentArticleId(): string | null {
    return this.currentArticleId;
  }

  async updateContent(
    articleId: string,
    title: string,
    content: string
  ): Promise<void> {
    if (!this.contentContainer) {
      return;
    }

    this.clear();
    this.currentArticleId = articleId;

    // Create title element
    const titleEl = this.contentContainer.createDiv({
      cls: "writing-view-title",
    });
    titleEl.createEl("h1", { text: title, cls: "inline-title" });

    // Create content container
    const markdownContainer = this.contentContainer.createDiv({
      cls: "writing-view-content markdown-preview-sizer markdown-preview-section",
    });

    // Render markdown content
    await MarkdownRenderer.renderMarkdown(content, markdownContainer, "", this);
  }
}
