import { ItemView, WorkspaceLeaf, MarkdownRenderer, setIcon } from "obsidian";
import { ApiService } from "../utils/api";
import { LinkTransformer } from "../utils/link-transformer";
import { IdealogsAnnotation } from "../types";
import * as textQuote from "dom-anchor-text-quote";

export const WRITING_VIEW_TYPE = "writing-view";
type ViewMode = "read" | "annotated";

export class WritingView extends ItemView {
  private currentArticleId: string | null = null;
  private currentTitle = "";
  private currentContent = "";
  private contentContainer: HTMLElement | null = null;
  private mode: ViewMode = "read";
  private apiService: ApiService | null = null;
  private linkTransformer: LinkTransformer | null = null;
  private onTxClick: ((targetArticleId: string) => void) | null = null;
  private modeToggleButton: HTMLElement | null = null;
  private txLinkCounter = 0;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  setServices(apiService: ApiService, linkTransformer: LinkTransformer): void {
    this.apiService = apiService;
    this.linkTransformer = linkTransformer;
  }

  setOnTxClick(callback: (targetArticleId: string) => void): void {
    this.onTxClick = callback;
  }

  getViewType(): string {
    return WRITING_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.currentTitle || "Writing View";
  }

  getIcon(): string {
    return "book-open";
  }

  private updateHeader(): void {
    const leafContainer = (this.leaf as any).containerEl as HTMLElement;
    const headerEl = leafContainer?.querySelector(".view-header-title");
    if (headerEl) headerEl.textContent = this.currentTitle;

    const tabContainer = leafContainer?.closest(".workspace-tab-container");
    if (tabContainer?.parentElement) {
      const tabHeader = tabContainer.parentElement.querySelector(
        ".workspace-tab-header.is-active"
      );
      const titleEl = tabHeader?.querySelector(
        ".workspace-tab-header-inner-title"
      );
      if (titleEl) titleEl.textContent = this.currentTitle;

      const iconEl = tabHeader?.querySelector(
        ".workspace-tab-header-inner-icon"
      );
      if (iconEl) (iconEl as HTMLElement).style.display = "none";
    }
  }

  async onOpen(): Promise<void> {
    this.contentContainer = this.contentEl.createDiv({
      cls: "writing-view-container markdown-preview-view",
    });
    this.addModeToggleButton();
  }

  private addModeToggleButton(): void {
    const leafContainer = (this.leaf as any).containerEl as HTMLElement;
    const actionsContainer = leafContainer?.querySelector(".view-actions");
    if (!actionsContainer) return;

    this.modeToggleButton = actionsContainer.createDiv({
      cls: "view-action clickable-icon",
      attr: { "aria-label": "Toggle Annotated Mode" },
    });
    setIcon(this.modeToggleButton, "highlighter");
    this.modeToggleButton.addEventListener("click", () => this.toggleMode());
  }

  private async toggleMode(): Promise<void> {
    this.mode = this.mode === "read" ? "annotated" : "read";
    if (this.modeToggleButton) {
      setIcon(this.modeToggleButton, "highlighter");
      this.modeToggleButton.toggleClass("is-active", this.mode === "annotated");
    }
    await this.renderContent();
  }

  async onClose(): Promise<void> {
    this.clear();
  }

  clear(): void {
    this.contentContainer?.empty();
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
    this.currentArticleId = articleId;
    this.currentTitle = title;
    this.currentContent = content;
    this.updateHeader();
    await this.renderContent();
  }

  private async renderContent(): Promise<void> {
    if (!this.contentContainer) return;

    this.contentContainer.empty();

    const titleEl = this.contentContainer.createDiv({
      cls: "writing-view-title",
    });
    titleEl.createEl("h1", { text: this.currentTitle, cls: "inline-title" });

    const markdownContainer = this.contentContainer.createDiv({
      cls: "writing-view-content markdown-preview-sizer markdown-preview-section",
    });

    await MarkdownRenderer.renderMarkdown(
      this.currentContent,
      markdownContainer,
      "",
      this
    );

    if (this.mode === "annotated") {
      await this.applyAnnotations(markdownContainer);
    }
  }

  private async applyAnnotations(container: HTMLElement): Promise<void> {
    if (!this.apiService || !this.currentArticleId) return;

    try {
      const annotations = await this.apiService.fetchAnnotations(
        this.currentArticleId,
        this.currentArticleId
      );

      if (annotations.length === 0) return;

      this.txLinkCounter = 0;

      for (const annotation of annotations) {
        if (annotation.kind === "Comment") {
          await this.processCommentAnnotation(container, annotation);
        } else if (annotation.kind === "Note") {
          await this.processNoteAnnotation(container, annotation);
        }
      }
    } catch (error) {
      console.error("[WritingView] Error applying annotations:", error);
    }
  }

  private async processCommentAnnotation(
    container: HTMLElement,
    annotation: IdealogsAnnotation
  ): Promise<void> {
    const isSource = annotation.sourceId === this.currentArticleId;
    if (isSource) {
      await this.addAnnotationHighlight(
        container,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        annotation.sTxtStart!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        annotation.sTxtEnd!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        annotation.sTxtDisplay!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        annotation.tTxt!,
        "comment"
      );
    } else {
      await this.addAnnotationHighlight(
        container,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        annotation.tTxtStart!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        annotation.tTxtEnd!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        annotation.tTxtDisplay!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        annotation.sTxt!,
        "comment"
      );
    }
  }

  private async processNoteAnnotation(
    container: HTMLElement,
    annotation: IdealogsAnnotation
  ): Promise<void> {
    const isSource = annotation.sourceId === this.currentArticleId;
    const linkType = this.getLinkType(
      isSource ? annotation.targetId : annotation.sourceId
    );
    const targetId = isSource ? annotation.targetId : annotation.sourceId;

    if (isSource) {
      await this.insertNoteLink(
        container,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        annotation.sTxtStart!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        annotation.sTxtEnd!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        annotation.sTxtDisplay!,
        linkType,
        targetId
      );
      if (annotation.tTxt && annotation.tTxtDisplay) {
        await this.addAnnotationHighlight(
          container,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          annotation.sTxtStart!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          annotation.sTxtEnd!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          annotation.sTxtDisplay!,
          annotation.tTxt,
          "note"
        );
      }
    } else {
      await this.insertNoteLink(
        container,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        annotation.tTxtStart!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        annotation.tTxtEnd!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        annotation.tTxtDisplay!,
        linkType,
        targetId
      );
      if (annotation.sTxt && annotation.sTxtDisplay) {
        await this.addAnnotationHighlight(
          container,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          annotation.tTxtStart!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          annotation.tTxtEnd!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          annotation.tTxtDisplay!,
          annotation.sTxt,
          "note"
        );
      }
    }
  }

  private getLinkType(articleId: string): string {
    if (articleId.startsWith("Fx")) return "[Question]";
    if (articleId.startsWith("Ix")) return "[!]";
    if (articleId.startsWith("Tx")) return `[${++this.txLinkCounter}]`;
    return "";
  }

  // Robust context extraction
  private getAnchorContext(
    textStart: string,
    textEnd: string,
    displayText: string
  ) {
    const exact = displayText.trim();
    let prefix = "";
    let suffix = "";

    if (textStart.endsWith(displayText)) {
      prefix = textStart.slice(0, -displayText.length).trimEnd();
    } else {
      prefix = textStart.trimEnd();
    }

    if (textEnd.startsWith(displayText)) {
      suffix = textEnd.slice(displayText.length).trimStart();
    } else {
      suffix = textEnd.trimStart();
    }

    // Limit context size to avoid cross-paragraph matches
    if (prefix.length > 120) prefix = "..." + prefix.slice(-117);
    if (suffix.length > 120) suffix = suffix.slice(0, 120) + "...";

    return {
      exact,
      prefix: prefix || undefined,
      suffix: suffix || undefined,
    };
  }

  // Fallback: simple text search
  private findTextRange(container: HTMLElement, text: string): Range | null {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const idx = node.textContent?.indexOf(text);
      if (idx !== undefined && idx !== -1) {
        const range = new Range();
        range.setStart(node, idx);
        range.setEnd(node, idx + text.length);
        return range;
      }
    }
    return null;
  }

  private async insertNoteLink(
    container: HTMLElement,
    textStart: string,
    textEnd: string,
    textDisplay: string,
    linkText: string,
    targetArticleId: string
  ): Promise<void> {
    try {
      const { exact, prefix, suffix } = this.getAnchorContext(
        textStart,
        textEnd,
        textDisplay
      );
      let range: Range | null = textQuote.toRange(container, {
        exact,
        prefix,
        suffix,
      });

      if (!range || range.collapsed) {
        range = this.findTextRange(container, exact);
      }

      if (!range) {
        console.warn(
          "[WritingView] Could not insert note link: text not found",
          exact
        );
        return;
      }

      range.collapse(false);

      const linkEl = document.createElement("span");
      linkEl.className = "idl-note-marker";
      linkEl.textContent = ` ${linkText}`;
      linkEl.style.cursor = "pointer";
      linkEl.style.fontWeight = "600";

      linkEl.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.onTxClick && targetArticleId.startsWith("Tx")) {
          this.onTxClick(targetArticleId);
        }
      });

      range.insertNode(linkEl);
      console.log(
        `[WritingView] Inserted note link ${linkText} after "${exact}"`
      );
    } catch (error) {
      console.error("[WritingView] Failed to insert note link:", error);
    }
  }

  private async addAnnotationHighlight(
    container: HTMLElement,
    textStart: string,
    textEnd: string,
    textDisplay: string,
    annotationText: string,
    type: "comment" | "note"
  ): Promise<void> {
    try {
      const { exact, prefix, suffix } = this.getAnchorContext(
        textStart,
        textEnd,
        textDisplay
      );

      let range: Range | null = textQuote.toRange(container, {
        exact,
        prefix,
        suffix,
      });

      if (!range || range.collapsed || range.startOffset >= range.endOffset) {
        console.warn("[WritingView] textQuote failed, using fallback search", {
          exact,
          prefix,
          suffix,
        });
        range = this.findTextRange(container, exact);
        if (!range) {
          console.warn(
            "[WritingView] Text not found even with fallback:",
            exact
          );
          return;
        }
      }

      if (range.startContainer.nodeType !== Node.TEXT_NODE) return;

      const textNode = range.startContainer as Text;
      const words = exact.split(/\s+/).filter(Boolean);

      await this.wrapWordsInTextNode(
        textNode,
        range.startOffset,
        range.endOffset,
        words,
        annotationText,
        type
      );
    } catch (error) {
      console.error("[WritingView] Error in addAnnotationHighlight:", error);
    }
  }

  private async wrapWordsInTextNode(
    textNode: Text,
    startOffset: number,
    endOffset: number,
    words: string[],
    annotationText: string,
    type: "comment" | "note"
  ): Promise<void> {
    const parent = textNode.parentNode;
    if (!parent) return;

    const fullText = textNode.textContent || "";
    const before = fullText.substring(0, startOffset);
    const rangeText = fullText.substring(startOffset, endOffset);
    const after = fullText.substring(endOffset);

    const fragment = document.createDocumentFragment();
    if (before) fragment.appendChild(document.createTextNode(before));

    let remaining = rangeText;
    let wrapped = false;

    for (const word of words) {
      const regex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, "i");
      const match = remaining.match(regex);
      if (!match) continue;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const idx = match.index!;
      if (idx > 0) {
        fragment.appendChild(
          document.createTextNode(remaining.substring(0, idx))
        );
      }

      const wrapper = document.createElement("span");
      wrapper.className = "idl-annotated-word";
      wrapper.textContent = word;
      wrapper.dataset.word = word;

      const container = document.createElement("span");
      container.className = "idl-annotation-container";
      container.style.display = "none";

      const item = document.createElement("div");
      item.className = `idl-annotation-item idl-annotation-${type}`;
      item.textContent = annotationText;
      container.appendChild(item);

      wrapper.addEventListener("click", (e) => {
        e.stopPropagation();
        container.style.display =
          container.style.display === "none" ? "block" : "none";
      });

      fragment.appendChild(wrapper);
      fragment.appendChild(container);
      wrapped = true;

      remaining = remaining.substring(idx + word.length);
    }

    if (remaining) fragment.appendChild(document.createTextNode(remaining));
    if (after) fragment.appendChild(document.createTextNode(after));

    if (wrapped) {
      parent.replaceChild(fragment, textNode);
      console.log(`[WritingView] Successfully wrapped: ${words.join(" ")}`);
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  flashText(text: string): void {
    if (!this.contentContainer || !text) return;

    this.contentContainer
      .querySelectorAll(".idl-target-flash")
      .forEach((el) => {
        const parent = el.parentNode;
        if (parent)
          parent.replaceChild(
            document.createTextNode(el.textContent || ""),
            el
          );
        parent?.normalize();
      });

    const walker = document.createTreeWalker(
      this.contentContainer,
      NodeFilter.SHOW_TEXT
    );
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const idx = node.textContent?.indexOf(text);
      if (idx === undefined || idx === -1) continue;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const before = node.textContent!.substring(0, idx);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const match = node.textContent!.substring(idx, idx + text.length);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const after = node.textContent!.substring(idx + text.length);

      const span = document.createElement("span");
      span.className = "idl-target-flash";
      span.textContent = match;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const parent = node.parentNode!;
      parent.insertBefore(document.createTextNode(before), node);
      parent.insertBefore(span, node);
      parent.insertBefore(document.createTextNode(after), node);
      parent.removeChild(node);

      span.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
  }
}
