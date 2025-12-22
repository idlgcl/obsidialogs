import { ItemView, WorkspaceLeaf, MarkdownRenderer, setIcon } from "obsidian";
import { ApiService } from "../utils/api";
import { LinkTransformer } from "../utils/link-transformer";
import { AnnotationService, Annotation } from "../utils/annotation-service";
import { IdealogsAnnotation } from "../types";
import { findAnnotationTextRanges, WordRangeInfo } from "../utils/text-finder";

export const WRITING_VIEW_TYPE = "writing-view";
type ViewMode = "read" | "annotated";

interface SimpleAnnotation {
  id: string | number;
  textDisplay: string;
  textStart: string;
  textEnd: string;
  fullText: string;
  articleId: string;
  kind: string;
  fromSource: boolean;
}

// TODO comments dont work for source
export class WritingView extends ItemView {
  private currentArticleId: string | null = null;
  private currentTitle = "";
  private currentContent = "";
  private contentContainer: HTMLElement | null = null;
  public markdownContainer: HTMLElement | null = null;
  private annotationsMainContainer: HTMLElement | null = null;
  private notesMainContainer: HTMLElement | null = null;
  private mode: ViewMode = "read";
  private apiService: ApiService | null = null;
  private linkTransformer: LinkTransformer | null = null;
  private annotationService: AnnotationService | null = null;
  private onTxClick: ((targetArticleId: string) => void) | null = null;
  private onFxIxClick: ((targetArticleId: string) => void) | null = null;
  private onLocalFileClick: ((filePath: string) => void) | null = null;
  private modeToggleButton: HTMLElement | null = null;
  private txLinkCounter = 0;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  setServices(
    apiService: ApiService,
    linkTransformer: LinkTransformer,
    annotationService: AnnotationService
  ): void {
    this.apiService = apiService;
    this.linkTransformer = linkTransformer;
    this.annotationService = annotationService;
  }

  setOnTxClick(callback: (targetArticleId: string) => void): void {
    this.onTxClick = callback;
  }

  setOnFxIxClick(callback: (targetArticleId: string) => void): void {
    this.onFxIxClick = callback;
  }

  setOnLocalFileClick(callback: (filePath: string) => void): void {
    this.onLocalFileClick = callback;
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

  getMarkdownContainer(): HTMLElement | null {
    return this.markdownContainer;
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
      await this.applyWebAnnotations();
      await this.applyObsidianAnnotations();
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
    const existing = document.getElementById(targetSpanId);
    if (existing) return existing;

    const sibling = document.createElement("span");
    sibling.className = "annotated-word-target";
    sibling.id = targetSpanId;
    return sibling;
  }

  private createAnnotationItem(
    annotationText: string,
    annotationLink: string,
    kind: string,
    local = false
  ) {
    const item = document.createElement("div");
    item.className = `idl-annotation-item idl-${kind} ${local ? " local" : ""}`;
    item.textContent = annotationText;
    const linkDiv = document.createElement("div");
    const link = document.createElement("a");
    link.href = `@${annotationLink}`;
    link.className = "internal-link";
    link.textContent = `[${annotationLink}]`;
    linkDiv.appendChild(link);
    item.appendChild(linkDiv);

    if (!local) {
      link.addEventListener("click", (evt) => {
        evt.preventDefault();
        if (this.onTxClick) {
          this.onTxClick(annotationLink);
        }
      });
    } else {
      link.addEventListener("click", (evt) => {
        evt.preventDefault();
        if (this.onLocalFileClick) {
          this.onLocalFileClick(annotationLink);
        }
      });
    }

    return item;
  }

  private simplifyWebAnnotation(
    annotation: IdealogsAnnotation
  ): SimpleAnnotation {
    const fromSource = annotation.sourceId === this.currentArticleId;

    if (fromSource) {
      return {
        id: annotation.id,
        textDisplay: annotation.sourceTextDisplay,
        textStart: annotation.sourceTextStart,
        textEnd: annotation.sourceTextEnd,
        fullText: annotation.targetText,
        articleId: annotation.targetId,
        kind: annotation.kind,
        fromSource: fromSource,
      };
    }

    return {
      id: annotation.id,
      textDisplay: annotation.targetTextDisplay,
      textStart: annotation.targetTextStart,
      textEnd: annotation.targetTextEnd,
      fullText: annotation.sourceText,
      articleId: annotation.sourceId,
      kind: annotation.kind,
      fromSource: fromSource,
    };
  }

  private removeMD(id: string): string {
    return id.endsWith(".md") ? id.slice(0, -3) : id;
  }

  private simplifyObsidianAnnotation(annotation: Annotation): SimpleAnnotation {
    const fromSource = annotation.sourceId === this.currentArticleId;

    if (fromSource) {
      return {
        id: annotation.id,
        textDisplay: annotation.sourceDisplay || "",
        textStart: annotation.sourceStart || "",
        textEnd: annotation.sourceEnd || "",
        fullText: annotation.targetText || "",
        articleId: this.removeMD(annotation.targetId),
        kind: annotation.kind,
        fromSource: fromSource,
      };
    }

    return {
      id: annotation.id,
      textDisplay: annotation.targetDisplay,
      textStart: annotation.targetStart,
      textEnd: annotation.targetEnd,
      fullText: annotation.sourceText || "",
      articleId: this.removeMD(annotation.sourceId),
      kind: annotation.kind,
      fromSource: fromSource,
    };
  }

  private findExistingAnnotationSpan(range: Range): HTMLElement | null {
    let node: Node | null = range.startContainer;
    while (node && node !== this.markdownContainer) {
      if (
        node instanceof HTMLElement &&
        node.classList.contains("idl-annotated-word")
      ) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  private setupAnnotatedWord(
    spanId: string,
    targetSpanId: string,
    targetDivId: string,
    range: Range
  ) {
    const existingSpan = document.getElementById(spanId);

    if (existingSpan) {
      return existingSpan;
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

  private onAnnotatedWordClick(e: Event) {
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

  private insertNoteLinks() {
    if (!this.notesMainContainer) return;

    const children = Array.from(this.notesMainContainer.children);

    for (const child of children) {
      const container = document.getElementById(
        child.getAttribute("data-note-container") as string
      );

      if (!container) {
        console.error(
          "Note container not found",
          child.getAttribute("data-note-container")
        );
        continue;
      }

      container.appendChild(child);
    }
  }

  private commentSpanId(
    displayText: string,
    commentId: number | string
  ): string {
    const slug = displayText
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return `comment-${commentId}_${slug}`;
  }

  private processCommentFromSource(comment: SimpleAnnotation) {
    const result = findAnnotationTextRanges(
      this.markdownContainer as HTMLElement,
      comment.textStart,
      comment.textEnd,
      comment.textDisplay,
      { sameParentOnly: true }
    );

    if (!result || result.error) {
      console.warn("Failed to find comment: ", comment.id, result?.error);
    }

    const spanId = this.commentSpanId(comment.textDisplay, comment.id);
    const targetSpanId = this.AWTargetSpanId(spanId);
    const targetDivId = this.AWTargetDivId(spanId);

    const annotatedWordSpan = this.setupAnnotatedWord(
      spanId,
      targetSpanId,
      targetDivId,
      result?.displayRange as Range
    );

    const targetSpan = this.createTargetSpan(targetSpanId);
    annotatedWordSpan.after(targetSpan);

    annotatedWordSpan.onclick = (e) => this.onAnnotatedWordClick(e);

    const acDiv = this.createACdiv(targetDivId);

    const item = this.createAnnotationItem(
      comment.fullText,
      comment.articleId,
      comment.kind
    );

    acDiv?.appendChild(item);
  }

  private processWordAnnotation(annotation: SimpleAnnotation, local = false) {
    if (annotation.kind === "Comment" && annotation.fromSource) {
      return;
    }
    const result = findAnnotationTextRanges(
      this.markdownContainer as HTMLElement,
      annotation.textStart,
      annotation.textEnd,
      annotation.textDisplay,
      { sameParentOnly: true }
    );

    if (!result) {
      console.warn("Could not find annotation range", annotation);
      return;
    }

    if (result.error) {
      console.warn("Error finding annotation:", result.error.message);
      return;
    }

    const { displayWordInfo } = result;

    for (const wordInfo of displayWordInfo) {
      if (!wordInfo.range) {
        console.warn("No range found for word:", wordInfo.word, annotation.id);
        continue;
      }

      const existingSpan = this.findExistingAnnotationSpan(wordInfo.range);

      let annotatedWordSpan: HTMLElement;
      let targetDivId: string;

      if (existingSpan) {
        annotatedWordSpan = existingSpan;
        targetDivId = existingSpan.dataset.div as string;
      } else {
        const spanId = this.AWSpanIdFromOffset(
          wordInfo.word,
          wordInfo.startOffset,
          wordInfo.endOffset
        );
        const targetSpanId = this.AWTargetSpanId(spanId);
        targetDivId = this.AWTargetDivId(spanId);

        annotatedWordSpan = this.setupAnnotatedWord(
          spanId,
          targetSpanId,
          targetDivId,
          wordInfo.range
        );

        const targetSpan = this.createTargetSpan(targetSpanId);
        annotatedWordSpan.after(targetSpan);

        annotatedWordSpan.onclick = (e) => this.onAnnotatedWordClick(e);
      }

      const acDiv = this.createACdiv(targetDivId);

      const item = this.createAnnotationItem(
        annotation.fullText,
        annotation.articleId,
        annotation.kind,
        local
      );

      acDiv?.appendChild(item);
    }
  }

  private processNoteLink(annotation: SimpleAnnotation) {
    const result = findAnnotationTextRanges(
      this.markdownContainer as HTMLElement,
      annotation.textStart,
      annotation.textEnd,
      annotation.textDisplay,
      { sameParentOnly: true }
    );

    if (!result) {
      console.warn("Could not find text start and end for note link");
      return;
    }

    const textDisplayIndex = result.fullText.indexOf(annotation.textDisplay);

    if (textDisplayIndex === -1) {
      console.warn(
        "Text display not found within start-end range for note link"
      );
      return;
    }

    const { displayWordInfo } = result;
    const lastWordInfo = displayWordInfo.pop() as WordRangeInfo;

    const noteLinkContainerId = this.AWTargetSpanId(
      this.AWSpanIdFromOffset(
        lastWordInfo.word as string,
        lastWordInfo.startOffset,
        lastWordInfo.endOffset
      )
    );

    let noteLinkContainer = document.getElementById(
      noteLinkContainerId
    ) as HTMLElement | null;

    if (!noteLinkContainer) {
      noteLinkContainer = document.createElement("span");
      noteLinkContainer.className = "note-links-container";
      noteLinkContainer.id = noteLinkContainerId;

      lastWordInfo.range.collapse(false);
      lastWordInfo.range.insertNode(noteLinkContainer);
      // range.collapse(true);
    }

    const linkText = this.getLinkText(annotation.articleId);
    const link = document.createElement("a");
    link.href = `/${annotation.articleId}`;
    link.className = "idl-note-link test";
    link.textContent = ` ${linkText} `;
    link.dataset.noteContainer = noteLinkContainerId;
    link.addEventListener("click", (evt) => {
      evt.preventDefault();
      if (this.onTxClick) {
        this.onTxClick(annotation.articleId);
      }
    });

    this.notesMainContainer?.appendChild(link);
  }

  private processWebNoteAnnotation(annotation: SimpleAnnotation) {
    if (!annotation.fullText || annotation.fullText.trim() === "") {
      this.processNoteLink(annotation);
    } else {
      this.processWordAnnotation(annotation);
    }

    this.insertNoteLinks();
  }

  private async applyWebAnnotations() {
    if (!this.apiService || !this.currentArticleId || !this.markdownContainer) {
      console.error("Services are note setup!");
      return;
    }

    const annotations = await this.apiService.fetchAnnotations(
      this.currentArticleId,
      this.currentArticleId
    );

    if (annotations.length === 0) return;

    for (const ann of annotations) {
      if (ann.kind === "Comment") {
        const comment = this.simplifyWebAnnotation(ann);
        if (comment.fromSource) {
          this.processCommentFromSource(comment);
        } else {
          this.processWordAnnotation(comment);
        }
      } else if (ann.kind === "Note") {
        const note = this.simplifyWebAnnotation(ann);
        this.processWebNoteAnnotation(note);
      }
    }

    this.insertNoteLinks();
  }

  private async applyObsidianAnnotations() {
    if (
      !this.annotationService ||
      !this.currentArticleId ||
      !this.markdownContainer
    ) {
      console.error("Services are not setup!");
      return;
    }

    const annotationsFile = await this.annotationService.getAnnotations(
      this.currentArticleId
    );

    const annotations: Annotation[] = [
      ...Object.values(annotationsFile.notes),
      ...Object.values(annotationsFile.comments),
    ];

    if (annotations.length === 0) return;

    for (const ann of annotations) {
      if (ann.isValid === false) continue;

      if (ann.kind === "Comment") {
        const comment = this.simplifyObsidianAnnotation(ann);

        this.processWordAnnotation(comment, true);
      } else if (ann.kind === "Note") {
        const note = this.simplifyObsidianAnnotation(ann);

        if (note.fullText.length > 0) {
          this.processWordAnnotation(note, true);
        }
      }
    }
  }
}
