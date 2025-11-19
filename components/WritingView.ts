import { ItemView, WorkspaceLeaf, MarkdownRenderer } from "obsidian";

export const WRITING_VIEW_TYPE = "writing-view";

export class WritingView extends ItemView {
  private currentArticleId: string | null = null;
  private currentTitle = "";
  private contentContainer: HTMLElement | null = null;
  private showAnnotation = false;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return WRITING_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.currentTitle;
  }

  getIcon(): string {
    return "book-open";
  }

  private updateHeader(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leafContainer = (this.leaf as any).containerEl as HTMLElement;

    const headerEl = leafContainer?.querySelector(".view-header-title");
    if (headerEl) {
      headerEl.textContent = this.currentTitle;
    }

    const tabContainer = leafContainer?.closest(".workspace-tab-container");
    if (tabContainer) {
      const parent = tabContainer.parentElement;
      if (parent) {
        const tabHeaderContainer = parent.querySelector(
          ".workspace-tab-header-container"
        );
        if (tabHeaderContainer) {
          // Find the active tab
          const activeTab = tabHeaderContainer.querySelector(
            ".workspace-tab-header.is-active"
          );
          if (activeTab) {
            const tabTitleEl = activeTab.querySelector(
              ".workspace-tab-header-inner-title"
            );
            if (tabTitleEl) {
              tabTitleEl.textContent = this.currentTitle;
            }

            // Hide the icon in the tab header
            const tabIconEl = activeTab.querySelector(
              ".workspace-tab-header-inner-icon"
            );
            if (tabIconEl) {
              (tabIconEl as HTMLElement).style.display = "none";
            }
          }
        }
      }
    }
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
    this.currentTitle = "";
    this.updateHeader();
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
    this.currentTitle = title;

    this.updateHeader();

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

  flashText(text: string): void {
    if (!this.contentContainer || !text) {
      return;
    }

    // Remove any existing flash spans first
    const existingFlashes =
      this.contentContainer.querySelectorAll(".idl-target-flash");
    existingFlashes.forEach((span) => {
      const parent = span.parentNode;
      if (parent) {
        // Replace span with its text content
        const textNode = document.createTextNode(span.textContent || "");
        parent.replaceChild(textNode, span);
        // Normalize to merge adjacent text nodes
        parent.normalize();
      }
    });

    // Find text in the content by walking through text nodes
    const treeWalker = document.createTreeWalker(
      this.contentContainer,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node: Text | null;
    let found = false;

    while ((node = treeWalker.nextNode() as Text | null) && !found) {
      const nodeText = node.textContent || "";
      const index = nodeText.indexOf(text);

      if (index !== -1) {
        found = true;

        // Split the text node and wrap the matched text
        const before = nodeText.substring(0, index);
        const match = nodeText.substring(index, index + text.length);
        const after = nodeText.substring(index + text.length);

        const parent = node.parentNode;
        if (!parent) {
          continue;
        }

        // Create elements
        const beforeNode = document.createTextNode(before);
        const flashSpan = document.createElement("span");
        flashSpan.className = "idl-target-flash";
        flashSpan.textContent = match;
        const afterNode = document.createTextNode(after);

        // Replace original node
        parent.insertBefore(beforeNode, node);
        parent.insertBefore(flashSpan, node);
        parent.insertBefore(afterNode, node);
        parent.removeChild(node);

        // Scroll into view
        flashSpan.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    if (!found) {
      console.error("[Idealogs] flashText: text not found in content");
    }
  }
}
