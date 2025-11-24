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

    // Add mode toggle button to header
    this.addModeToggleButton();
  }

  private addModeToggleButton(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leafContainer = (this.leaf as any).containerEl as HTMLElement;
    const actionsContainer = leafContainer?.querySelector(".view-actions");

    if (actionsContainer) {
      this.modeToggleButton = actionsContainer.createDiv({
        cls: "view-action clickable-icon",
        attr: {
          "aria-label": "Toggle Annotated Mode",
        },
      });
      setIcon(this.modeToggleButton, "highlighter");

      this.modeToggleButton.addEventListener("click", () => {
        this.toggleMode();
      });
    }
  }

  private async toggleMode(): Promise<void> {
    this.mode = this.mode === "read" ? "annotated" : "read";

    // Update button icon
    if (this.modeToggleButton) {
      setIcon(
        this.modeToggleButton,
        this.mode === "annotated" ? "highlighter" : "highlighter"
      );
      this.modeToggleButton.toggleClass("is-active", this.mode === "annotated");
    }

    // Re-render content
    await this.renderContent();
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
    this.currentArticleId = articleId;
    this.currentTitle = title;
    this.currentContent = content;

    this.updateHeader();
    await this.renderContent();
  }

  private async renderContent(): Promise<void> {
    if (!this.contentContainer) {
      return;
    }

    this.contentContainer.empty();

    // Create title element
    const titleEl = this.contentContainer.createDiv({
      cls: "writing-view-title",
    });
    titleEl.createEl("h1", { text: this.currentTitle, cls: "inline-title" });

    // Create content container
    const markdownContainer = this.contentContainer.createDiv({
      cls: "writing-view-content markdown-preview-sizer markdown-preview-section",
    });

    // Render markdown content
    await MarkdownRenderer.renderMarkdown(
      this.currentContent,
      markdownContainer,
      "",
      this
    );

    // Apply link transformation in read mode
    // if (this.mode === "read" && this.linkTransformer && this.currentArticleId) {
    //   this.linkTransformer.transformLinks(
    //     markdownContainer,
    //     this.currentArticleId,
    //     (targetArticleId) => {
    //       if (this.onTxClick) {
    //         this.onTxClick(targetArticleId);
    //       }
    //     }
    //   );
    // }

    // Apply annotations in annotated mode
    if (this.mode === "annotated") {
      await this.applyAnnotations(markdownContainer);
    }
  }

  private async applyAnnotations(container: HTMLElement): Promise<void> {
    if (!this.apiService || !this.currentArticleId) {
      console.log(
        "[WritingView] Cannot apply annotations: missing apiService or articleId"
      );
      return;
    }

    try {
      console.log(
        "[WritingView] Fetching annotations for article:",
        this.currentArticleId
      );

      // Fetch annotations where current article is either source or target
      const annotations = await this.apiService.fetchAnnotations(
        this.currentArticleId,
        this.currentArticleId
      );

      console.log(`[WritingView] Fetched ${annotations.length} annotations`);

      if (annotations.length === 0) {
        console.log("[WritingView] No annotations to apply");
        return;
      }

      // Reset Tx link counter
      this.txLinkCounter = 0;

      // Process annotations
      for (const annotation of annotations) {
        console.log(`[WritingView] Processing annotation:`, {
          id: annotation.id,
          kind: annotation.kind,
          sourceId: annotation.sourceId,
          targetId: annotation.targetId,
          isSource: annotation.sourceId === this.currentArticleId,
        });

        if (annotation.kind === "Comment") {
          await this.processCommentAnnotation(container, annotation);
        } else if (annotation.kind === "Note") {
          await this.processNoteAnnotation(container, annotation);
        }
      }

      console.log("[WritingView] Finished applying all annotations");
    } catch (error) {
      console.error("[WritingView] Error applying annotations:", error);
    }
  }

  private async processCommentAnnotation(
    container: HTMLElement,
    annotation: IdealogsAnnotation
  ): Promise<void> {
    const isSource = annotation.sourceId === this.currentArticleId;

    console.log(
      `[WritingView] Processing Comment annotation (isSource: ${isSource})`
    );

    if (isSource) {
      // Show target text (tTxt) based on source display
      console.log(
        `[WritingView] Comment - Showing tTxt for display: "${annotation.sTxtDisplay}"`
      );
      await this.addAnnotationHighlight(
        container,
        annotation.sTxtStart,
        annotation.sTxtEnd,
        annotation.sTxtDisplay,
        annotation.tTxt,
        "comment"
      );
    } else {
      // Show source text (sTxt) based on target display
      console.log(
        `[WritingView] Comment - Showing sTxt for display: "${annotation.tTxtDisplay}"`
      );
      await this.addAnnotationHighlight(
        container,
        annotation.tTxtStart,
        annotation.tTxtEnd,
        annotation.tTxtDisplay,
        annotation.sTxt,
        "comment"
      );
    }
  }

  private async processNoteAnnotation(
    container: HTMLElement,
    annotation: IdealogsAnnotation
  ): Promise<void> {
    const isSource = annotation.sourceId === this.currentArticleId;

    console.log(
      `[WritingView] Processing Note annotation (isSource: ${isSource})`
    );

    if (isSource) {
      // Insert link after source display
      const linkType = this.getLinkType(annotation.targetId);
      console.log(
        `[WritingView] Note - Inserting ${linkType} link after: "${annotation.sTxtDisplay}"`
      );
      await this.insertNoteLink(
        container,
        annotation.sTxtStart,
        annotation.sTxtEnd,
        annotation.sTxtDisplay,
        linkType,
        annotation.targetId
      );

      // If target has data, add annotation container with tTxt
      if (
        annotation.tTxtStart &&
        annotation.tTxtDisplay &&
        annotation.tTxtEnd
      ) {
        console.log(
          `[WritingView] Note - Adding tTxt container for: "${annotation.sTxtDisplay}"`
        );
        await this.addAnnotationHighlight(
          container,
          annotation.sTxtStart,
          annotation.sTxtEnd,
          annotation.sTxtDisplay,
          annotation.tTxt,
          "note"
        );
      }
    } else {
      // Insert link after target display
      const linkType = this.getLinkType(annotation.sourceId);
      console.log(
        `[WritingView] Note - Inserting ${linkType} link after: "${annotation.tTxtDisplay}"`
      );
      await this.insertNoteLink(
        container,
        annotation.tTxtStart,
        annotation.tTxtEnd,
        annotation.tTxtDisplay,
        linkType,
        annotation.sourceId
      );

      // If source has data, add annotation container with sTxt
      if (
        annotation.sTxtStart &&
        annotation.sTxtDisplay &&
        annotation.sTxtEnd
      ) {
        console.log(
          `[WritingView] Note - Adding sTxt container for: "${annotation.tTxtDisplay}"`
        );
        await this.addAnnotationHighlight(
          container,
          annotation.tTxtStart,
          annotation.tTxtEnd,
          annotation.tTxtDisplay,
          annotation.sTxt,
          "note"
        );
      }
    }
  }

  private getLinkType(articleId: string): string {
    if (articleId.startsWith("Fx")) {
      return "[?]";
    } else if (articleId.startsWith("Ix")) {
      return "[!]";
    } else if (articleId.startsWith("Tx")) {
      this.txLinkCounter++;
      return `[${this.txLinkCounter}]`;
    }
    return "";
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
      // Find the text range
      const range = textQuote.toRange(container, {
        exact: textDisplay,
        prefix: textStart,
        suffix: textEnd,
      });

      if (!range) {
        return;
      }

      // Move to end of range
      range.collapse(false);

      // Create link element
      const linkEl = document.createElement("span");
      linkEl.className = "idl-note-marker";
      linkEl.textContent = ` ${linkText}`;
      linkEl.style.cursor = "pointer";
      linkEl.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.onTxClick && targetArticleId.startsWith("Tx")) {
          this.onTxClick(targetArticleId);
        }
      });

      // Insert the link
      range.insertNode(linkEl);
    } catch (error) {
      console.error("[WritingView] Error inserting note link:", error);
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
      console.log(
        `[WritingView] Adding highlight for "${textDisplay}" with context:`,
        {
          start: textStart.substring(textStart.length - 20),
          end: textEnd.substring(0, 20),
        }
      );

      // Use dom-anchor-text-quote to find the exact range
      const range = textQuote.toRange(container, {
        exact: textDisplay,
        prefix: textStart,
        suffix: textEnd,
      });

      if (!range) {
        console.log(`[WritingView] Could not find range for "${textDisplay}"`);
        return;
      }

      console.log(`[WritingView] Found range for "${textDisplay}"`);

      // Get the text node and position
      if (range.startContainer.nodeType !== Node.TEXT_NODE) {
        console.log(`[WritingView] Range doesn't start in a text node`);
        return;
      }

      const textNode = range.startContainer as Text;
      const startOffset = range.startOffset;
      const endOffset = range.endOffset;

      console.log(
        `[WritingView] Range spans from offset ${startOffset} to ${endOffset} in text node`
      );

      // Extract the text content from the range
      const fullText = textNode.textContent || "";
      const rangeText = fullText.substring(startOffset, endOffset);

      console.log(`[WritingView] Range text: "${rangeText}"`);

      // Split into words
      const words = textDisplay.trim().split(/\s+/);
      console.log(`[WritingView] Splitting into ${words.length} words:`, words);

      // Wrap all words in a single operation
      await this.wrapWordsInTextNode(
        textNode,
        startOffset,
        endOffset,
        words,
        annotationText,
        type
      );
    } catch (error) {
      console.error("[WritingView] Error adding annotation highlight:", error);
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
    if (!parent) {
      console.log(`[WritingView] No parent node`);
      return;
    }

    const fullText = textNode.textContent || "";
    const beforeRange = fullText.substring(0, startOffset);
    const rangeText = fullText.substring(startOffset, endOffset);
    const afterRange = fullText.substring(endOffset);

    console.log(
      `[WritingView] Wrapping words in text node. Before: "${beforeRange.substring(
        beforeRange.length - 20
      )}", Range: "${rangeText}", After: "${afterRange.substring(0, 20)}"`
    );

    // Build the new content with wrapped words
    const fragment = document.createDocumentFragment();

    // Add text before the range
    if (beforeRange) {
      fragment.appendChild(document.createTextNode(beforeRange));
    }

    // Process each word in the range
    let remainingText = rangeText;
    let processedAnyWord = false;

    for (const word of words) {
      const wordRegex = new RegExp(`\\b${this.escapeRegex(word)}\\b`);
      const match = wordRegex.exec(remainingText);

      if (match) {
        processedAnyWord = true;
        const matchIndex = match.index;

        // Add text before the word
        const textBefore = remainingText.substring(0, matchIndex);
        if (textBefore) {
          fragment.appendChild(document.createTextNode(textBefore));
        }

        // Check if this word already has a wrapper
        const existingWrapper = this.findAnnotationWrapper(parent, word);

        if (!existingWrapper) {
          // Create wrapper for the word
          const wrapper = document.createElement("span");
          wrapper.className = "idl-annotated-word";
          wrapper.textContent = word;
          wrapper.dataset.word = word;
          wrapper.dataset.annotationCount = "1";

          // Create annotation container
          const annotationContainer = document.createElement("span");
          annotationContainer.className = "idl-annotation-container";
          annotationContainer.style.display = "none";
          annotationContainer.dataset.word = word;

          // Add annotation text
          const annotationDiv = document.createElement("div");
          annotationDiv.className = `idl-annotation-item idl-annotation-${type}`;
          annotationDiv.textContent = annotationText;
          annotationContainer.appendChild(annotationDiv);

          // Add click handler
          wrapper.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const display =
              annotationContainer.style.display === "none" ? "block" : "none";
            annotationContainer.style.display = display;
            console.log(
              `[WritingView] Toggled "${word}" annotation to: ${display}`
            );
          });

          fragment.appendChild(wrapper);
          fragment.appendChild(annotationContainer);

          console.log(`[WritingView] Created wrapper for "${word}"`);
        } else {
          // Word already wrapped, just add the text
          fragment.appendChild(document.createTextNode(word));

          // Add annotation to existing container
          const annotationContainer =
            existingWrapper.nextSibling as HTMLElement;
          if (
            annotationContainer?.classList?.contains("idl-annotation-container")
          ) {
            const annotationDiv = document.createElement("div");
            annotationDiv.className = `idl-annotation-item idl-annotation-${type}`;
            annotationDiv.textContent = annotationText;
            annotationContainer.appendChild(annotationDiv);

            const currentCount = parseInt(
              existingWrapper.dataset.annotationCount || "0"
            );
            existingWrapper.dataset.annotationCount = (
              currentCount + 1
            ).toString();
            console.log(`[WritingView] Added annotation to existing "${word}"`);
          }
        }

        // Update remaining text (skip past the matched word)
        remainingText = remainingText.substring(matchIndex + word.length);
      } else {
        console.log(
          `[WritingView] Word "${word}" not found in remaining text: "${remainingText.substring(
            0,
            50
          )}"`
        );
      }
    }

    // Add any remaining text from the range
    if (remainingText) {
      fragment.appendChild(document.createTextNode(remainingText));
    }

    // Add text after the range
    if (afterRange) {
      fragment.appendChild(document.createTextNode(afterRange));
    }

    // Replace the original text node with our fragment
    if (processedAnyWord) {
      parent.replaceChild(fragment, textNode);
      console.log(`[WritingView] Successfully wrapped ${words.length} words`);
    } else {
      console.log(`[WritingView] No words were wrapped`);
    }
  }

  private findAnnotationWrapper(
    parent: Node,
    word: string
  ): HTMLElement | null {
    const children = parent.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      if (
        child.classList?.contains("idl-annotated-word") &&
        child.dataset?.word === word
      ) {
        return child;
      }
    }
    return null;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      console.log(text);
    }
  }
}
