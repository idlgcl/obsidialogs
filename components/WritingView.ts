import { ItemView, WorkspaceLeaf, MarkdownRenderer, setIcon } from "obsidian";
import { ApiService } from "../utils/api";
import { LinkTransformer } from "../utils/link-transformer";
import { IdealogsAnnotation } from "../types";
import { findTextQuote } from "../utils/text-finder";

export const WRITING_VIEW_TYPE = "writing-view";
type ViewMode = "read" | "annotated";

interface SimpleAnnotation {
  id: string | number;
  textDisplay: string;
  textStart: string;
  textEnd: string;
  fullText: string;
  articleId: string;
}

// TODO comments dont work for source
export class WritingView extends ItemView {
  private currentArticleId: string | null = null;
  private currentTitle = "";
  private currentContent = "";
  private contentContainer: HTMLElement | null = null;
  private markdownContainer: HTMLElement | null = null;
  private annotationsMainContainer: HTMLElement | null = null;
  private notesMainContainer: HTMLElement | null = null;
  private mode: ViewMode = "read";
  private apiService: ApiService | null = null;
  private linkTransformer: LinkTransformer | null = null;
  private onTxClick: ((targetArticleId: string) => void) | null = null;
  private onFxIxClick: ((targetArticleId: string) => void) | null = null;
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

  setOnFxIxClick(callback: (targetArticleId: string) => void): void {
    this.onFxIxClick = callback;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    if (this.mode !== "read") {
      this.mode = "read";
      if (this.modeToggleButton) {
        setIcon(this.modeToggleButton, "highlighter");
        this.modeToggleButton.removeClass("is-active");
      }
    }

    await this.renderContent();
  }

  private async renderContent(): Promise<void> {
    if (!this.contentContainer) return;

    this.contentContainer.empty();

    const titleEl = this.contentContainer.createDiv({
      cls: "writing-view-title",
    });
    titleEl.createEl("h1", { text: this.currentTitle, cls: "inline-title" });

    this.markdownContainer = this.contentContainer.createDiv({
      cls: "writing-view-content markdown-preview-sizer markdown-preview-section",
    });
    this.annotationsMainContainer = this.contentContainer.createDiv({
      cls: "idl-annotations",
    });
    this.notesMainContainer = this.contentContainer.createDiv({
      cls: "idl-annotations",
    });

    await MarkdownRenderer.renderMarkdown(
      this.currentContent,
      this.markdownContainer,
      "",
      this
    );

    if (this.mode === "annotated") {
      this.txLinkCounter = 0;
      await this.processAnnotations();
    }
  }

  // AW = Annotated word
  private AWSpanIdFromOffset(
    displayText: string,
    textStart: number,
    textEnd: number
  ): string {
    return `${textStart}_${displayText}_${textEnd}`;
  }

  private AWTargetSpanId(awID: string): string {
    return `${awID}-target-span`;
  }

  private AWTargetDivId(awID: string): string {
    return `${awID}-target-div`;
  }

  // AC = Annotation Container
  private createACdiv(divId: string) {
    if (!this.annotationsMainContainer) return;

    const existing = document.getElementById(divId);
    if (existing) return existing;

    const ac = this.annotationsMainContainer.createDiv({
      cls: "idl-annotation-container",
    });
    ac.id = divId;
    return ac;
  }

  private createTargetSpan(targetSpanId: string) {
    // target span where annotation container will be teleported
    const sibling = document.createElement("span");
    sibling.className = "annotated-word-target";
    sibling.id = targetSpanId;
    return sibling;
  }

  private createAnnotationItem(
    annotationText: string,
    annotationLink: string,
    kind: string
  ) {
    const item = document.createElement("div");
    item.className = `idl-annotation-item idl-${kind}`;
    item.textContent = annotationText;
    const linkDiv = document.createElement("div");
    const link = document.createElement("a");
    link.href = `@${annotationLink}`;
    link.className = "internal-link";
    link.textContent = `[${annotationLink}]`;
    linkDiv.appendChild(link);
    item.appendChild(linkDiv);
    link.addEventListener("click", (evt) => {
      evt.preventDefault();
      if (this.onTxClick) {
        this.onTxClick(annotationLink);
      }
    });

    return item;
  }

  private getAnnotationData(annotation: IdealogsAnnotation): SimpleAnnotation {
    const fromSource = annotation.sourceId === this.currentArticleId;

    if (fromSource) {
      return {
        id: annotation.id,
        textDisplay: annotation.sTxtDisplay,
        textStart: annotation.sTxtStart,
        textEnd: annotation.sTxtEnd,
        fullText: annotation.tTxt,
        articleId: annotation.targetId,
      };
    }

    return {
      id: annotation.id,
      textDisplay: annotation.tTxtDisplay,
      textStart: annotation.tTxtStart,
      textEnd: annotation.tTxtEnd,
      fullText: annotation.sTxt,
      articleId: annotation.sourceId,
    };
  }

  private setupAnnotatedWord(
    spanId: string,
    targetSpanId: string,
    targetDivId: string,
    range: Range
  ) {
    const existingSpan = document.getElementById(spanId);

    if (existingSpan) {
      console.log("Span already marked");
      return;
    }

    const span = document.createElement("span");
    span.className = "idl-annotated-word";
    span.id = spanId;
    span.dataset["span"] = targetSpanId;
    span.dataset["div"] = targetDivId;

    const contents = range.extractContents();

    span.appendChild(contents);

    range.insertNode(span);

    range.setStartAfter(span);
    range.collapse(true);

    return span;
  }

  private onCommentedWordClick(e: Event) {
    const span = e.target as HTMLElement;
    if (!span) return;

    const targetSpanID = span.dataset.span;
    if (!targetSpanID) return;

    const targetDivId = span.dataset.div;
    if (!targetDivId) return;

    const targetDiv = document.getElementById(targetDivId);
    if (!targetDiv) return;

    const targetSpan = document.getElementById(targetSpanID);
    if (!targetSpan) return;

    const originalParent = this.annotationsMainContainer;

    if (targetDiv.parentElement === targetSpan) {
      originalParent?.appendChild(targetDiv);
      return;
    }

    targetSpan.appendChild(targetDiv);
  }

  private getLinkText(articleId: string): string {
    if (articleId.startsWith("Fx")) return "[?]";
    if (articleId.startsWith("Ix")) return "[!]";
    if (articleId.startsWith("Tx")) return `[${++this.txLinkCounter}]`;
    return "";
  }

  private createNoteLinkContainer(spanId: string) {
    const existing = document.getElementById(spanId);
    if (existing) return existing;

    // target span where notelinks will be teleported
    const sibling = document.createElement("span");
    sibling.className = "note-link-container";
    sibling.id = spanId;
    return sibling;
  }

  private insertNoteLinks() {
    if (!this.notesMainContainer) return;

    const children = Array.from(this.notesMainContainer.children);

    for (const child of children) {
      console.log(child);
      const container = document.getElementById(
        child.getAttribute("data-note-container") as string
      );

      if (!container) {
        console.log("Note container not found");
        continue;
      }

      container.appendChild(child);
    }
  }

  private async processAnnotations() {
    if (!this.apiService || !this.currentArticleId || !this.markdownContainer) {
      console.log("failed");
      return;
    }

    const annotations = await this.apiService.fetchAnnotations(
      this.currentArticleId,
      this.currentArticleId
    );

    if (annotations.length === 0) return;

    for (const ann of annotations) {
      if (ann.kind === "Comment") {
        const comment = this.getAnnotationData(ann);
        const displays = comment.textDisplay.split(" ");
        for (const display of displays) {
          const result = findTextQuote(this.markdownContainer, {
            exact: display,
            prefix: comment.textStart,
            suffix: comment.textEnd,
          });

          if (!result) {
            continue;
          }
          const { range, fullText, textStart, textEnd } = result;

          // Setup IDs
          const spanId = this.AWSpanIdFromOffset(display, textStart, textEnd);
          const targetSpanId = this.AWTargetSpanId(spanId);
          const targetDivId = this.AWTargetDivId(spanId);

          const span = this.setupAnnotatedWord(
            spanId,
            targetSpanId,
            targetDivId,
            range
          );
          const targetSpan = this.createTargetSpan(targetSpanId);

          span?.addEventListener("click", (e) => {
            this.onCommentedWordClick(e);
          });
          span?.after(targetSpan); // Insert targetSpan after AnnotatedWord span

          const acDiv = this.createACdiv(targetDivId);

          const item = this.createAnnotationItem(
            fullText,
            comment.articleId,
            "comment"
          );

          acDiv?.appendChild(item);
        }
      } else if (ann.kind === "Note") {
        const note = this.getAnnotationData(ann);

        // Note does not have text data
        if (!note.fullText) {
          const linkText = this.getLinkText(note.articleId);

          // only use last word
          const lastDisplayText = note.textDisplay
            .trim()
            .split(" ")
            .pop() as string;

          const result = findTextQuote(this.markdownContainer, {
            exact: lastDisplayText,
            prefix: note.textStart,
            suffix: note.textEnd,
          });

          if (!result) {
            continue;
          }

          const { range, textStart, textEnd } = result;

          const noteLinkContainerId = this.AWTargetSpanId(
            this.AWSpanIdFromOffset(lastDisplayText, textStart, textEnd)
          );

          const noteLinkContainer =
            this.createNoteLinkContainer(noteLinkContainerId);

          range.collapse(false);
          range.insertNode(noteLinkContainer);
          range.collapse(true);

          const linkEl = document.createElement("span");
          linkEl.className = "idl-note-link";
          linkEl.dataset.noteContainer = noteLinkContainerId;
          linkEl.textContent = ` ${linkText} `;

          linkEl.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!this.onFxIxClick || !this.onTxClick) return;
            if (
              note.articleId.startsWith("Fx") ||
              note.articleId.startsWith("Ix")
            ) {
              this.onFxIxClick(note.articleId);
            } else {
              //its a writing
              this.onTxClick(note.articleId);
            }
          });

          this.notesMainContainer?.appendChild(linkEl);
        }
      }
    }

    this.insertNoteLinks();
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
        console.log("[WritingView] Processing annotation:", {
          id: annotation.id,
          kind: annotation.kind,
          sourceId: annotation.sourceId,
          targetId: annotation.targetId,
          sTxtDisplay: annotation.sTxtDisplay,
        });
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
    console.log("[WritingView] processCommentAnnotation:", {
      id: annotation.id,
      isSource,
      currentArticleId: this.currentArticleId,
      textDisplay: isSource ? annotation.sTxtDisplay : annotation.tTxtDisplay,
    });
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
        "comment",
        annotation.targetId
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
        "comment",
        annotation.sourceId
      );
    }
  }

  private async processNoteAnnotation(
    container: HTMLElement,
    annotation: IdealogsAnnotation
  ): Promise<void> {
    const isSource = annotation.sourceId === this.currentArticleId;
    const linkType = this.getLinkText(
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
          "note",
          annotation.targetId
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
          "note",
          annotation.sourceId
        );
      }
    }
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private safeToRange(container: HTMLElement, descriptor: any): Range | null {
    try {
      const range = textQuote.toRange(container, descriptor);
      if (!range || range.collapsed) {
        return null;
      }

      // range touches an annotation container → discard
      const common = range.commonAncestorContainer;

      //  common ancestor or any parent is an annotation container
      let checkNode: Node | null = common;
      while (checkNode && checkNode !== container) {
        if (
          checkNode instanceof HTMLElement &&
          checkNode.classList.contains("idl-annotation-container")
        ) {
          return null;
        }
        checkNode = checkNode.parentNode;
      }

      return range;
    } catch (e) {
      return null;
    }
  }

  // Fallback: simple text search
  private findTextRange(container: HTMLElement, text: string): Range | null {
    let nodesChecked = 0;
    let nodesRejected = 0;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: (node: Node) => {
        nodesChecked++;
        // Reject any text node that lives inside an annotation container
        let el: HTMLElement | null = node.parentElement;
        const parentChain: string[] = [];
        while (el && el !== container) {
          parentChain.push(el.className || el.nodeName);
          if (el.classList?.contains("idl-annotation-container")) {
            nodesRejected++;
            return NodeFilter.FILTER_REJECT;
          }
          el = el.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

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

    console.error(
      `[findTextRange] NOT FOUND "${text}". Checked ${nodesChecked} nodes, rejected ${nodesRejected}`
    );
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
      let range: Range | null = this.safeToRange(container, {
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
        } else if (
          this.onFxIxClick &&
          (targetArticleId.startsWith("Fx") || targetArticleId.startsWith("Ix"))
        ) {
          this.onFxIxClick(targetArticleId);
        }
      });

      range.insertNode(linkEl);
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
    type: "comment" | "note",
    annotationSource: string
  ): Promise<void> {
    try {
      console.log("[WritingView] addAnnotationHighlight:", {
        textStart,
        textEnd,
        textDisplay,
      });
      const { exact, prefix, suffix } = this.getAnchorContext(
        textStart,
        textEnd,
        textDisplay
      );

      console.log("[WritingView] Anchor context:", { exact, prefix, suffix });

      let range: Range | null = this.safeToRange(container, {
        exact,
        prefix,
        suffix,
      });

      console.log("[WritingView] safeToRange result:", {
        hasRange: !!range,
        collapsed: range?.collapsed,
        startOffset: range?.startOffset,
        endOffset: range?.endOffset,
      });

      if (!range || range.collapsed || range.startOffset >= range.endOffset) {
        console.warn("[WritingView] textQuote failed, using fallback search", {
          exact,
          prefix,
          suffix,
        });
        range = this.findTextRange(container, exact);
        console.log("[WritingView] Fallback range result:", {
          hasRange: !!range,
        });
        if (!range) {
          console.warn(
            "[WritingView] Text not found even with fallback:",
            exact
          );
          return;
        }
      }

      console.log("[WritingView] Range container nodeType:", {
        nodeType: range.startContainer.nodeType,
        isTextNode: range.startContainer.nodeType === Node.TEXT_NODE,
      });

      let textNode: Text;
      if (range.startContainer.nodeType !== Node.TEXT_NODE) {
        console.log(
          "[WritingView] startContainer is ELEMENT_NODE, finding first text node"
        );
        // Navigate to first text node within the element
        const walker = document.createTreeWalker(
          range.startContainer,
          NodeFilter.SHOW_TEXT,
          null
        );
        const firstTextNode = walker.nextNode() as Text;
        if (!firstTextNode) {
          console.warn("[WritingView] No text node found in element");
          return;
        }
        textNode = firstTextNode;
        range.setStart(textNode, 0);
        range.setEnd(textNode, Math.min(exact.length, textNode.length));
        console.log("[WritingView] Found text node:", {
          textContent: textNode.textContent?.substring(0, 50),
          newStartOffset: range.startOffset,
          newEndOffset: range.endOffset,
        });
      } else {
        textNode = range.startContainer as Text;
      }

      const words = exact.split(/\s+/).filter(Boolean);

      console.log("[WritingView] Calling wrapWordsInTextNode:", {
        words,
        startOffset: range.startOffset,
        endOffset: range.endOffset,
        textNodeLength: textNode.textContent?.length,
      });

      await this.wrapWordsInTextNode(
        textNode,
        range.startOffset,
        range.endOffset,
        words,
        annotationText,
        type,
        annotationSource
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
    type: "comment" | "note",
    annotationSource: string
  ): Promise<void> {
    const parent = textNode.parentNode;
    if (!parent) return;

    const fullText = textNode.textContent || "";
    const before = fullText.substring(0, startOffset);
    const rangeText = fullText.substring(startOffset, endOffset);
    const after = fullText.substring(endOffset);

    console.log("[WritingView] wrapWordsInTextNode start:", {
      fullTextLength: fullText.length,
      rangeText,
      words,
    });

    const fragment = document.createDocumentFragment();
    if (before) fragment.appendChild(document.createTextNode(before));

    let remaining = rangeText;
    let wrapped = false;

    for (const word of words) {
      const regex = new RegExp(`\\b${this.escapeRegex(word)}`, "i");
      const match = remaining.match(regex);
      console.log("[WritingView] Word match attempt:", {
        word,
        regex: regex.toString(),
        hasMatch: !!match,
        remaining: remaining.substring(0, 50),
      });
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
      const linkDiv = document.createElement("div");
      const link = document.createElement("a");
      link.href = `@${annotationSource}`;
      link.className = "internal-link";
      link.textContent = annotationSource;
      linkDiv.appendChild(link);
      item.appendChild(linkDiv);
      // TODO Click handler
      link.addEventListener("click", (evt) => {
        evt.preventDefault();
        if (this.onTxClick) {
          this.onTxClick(annotationSource);
        }
      });
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
      console.log("[WritingView] Word wrapped successfully:", {
        word,
        newRemaining: remaining.substring(0, 50),
      });
    }

    if (remaining) fragment.appendChild(document.createTextNode(remaining));
    if (after) fragment.appendChild(document.createTextNode(after));

    console.log("[WritingView] wrapWordsInTextNode end:", {
      wrapped,
      updatingDOM: wrapped,
    });

    if (wrapped) {
      parent.replaceChild(fragment, textNode);
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
