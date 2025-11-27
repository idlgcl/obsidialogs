import { ItemView, WorkspaceLeaf, MarkdownRenderer, setIcon } from "obsidian";
import { ApiService } from "../utils/api";
import { LinkTransformer } from "../utils/link-transformer";
import { AnnotationService, Annotation } from "../utils/annotation-service";
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
      await this.processWebAnnotations();
      await this.processLocalAnnotations();
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

  private removeMD(id: string): string {
    return id.endsWith(".md") ? id.slice(0, -3) : id;
  }

  private getLocalAnnotationData(annotation: Annotation): SimpleAnnotation {
    const fromSource = annotation.sourceId === this.currentArticleId;

    if (fromSource) {
      return {
        id: annotation.id,
        textDisplay: annotation.sourceDisplay || "",
        textStart: annotation.sourceStart || "",
        textEnd: annotation.sourceEnd || "",
        fullText: annotation.targetText || "",
        articleId: this.removeMD(annotation.targetId),
      };
    }

    return {
      id: annotation.id,
      textDisplay: annotation.targetDisplay,
      textStart: annotation.targetStart,
      textEnd: annotation.targetEnd,
      fullText: annotation.sourceText || "",
      articleId: this.removeMD(annotation.sourceId),
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

  private async processWebAnnotations() {
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
          const { range, textStart, textEnd } = result;

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

          span.onclick = (e) => {
            this.onCommentedWordClick(e);
          };

          span.after(targetSpan); // Insert targetSpan after AnnotatedWord span

          const acDiv = this.createACdiv(targetDivId);

          const item = this.createAnnotationItem(
            comment.fullText,
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
        } else {
          // TODO :: Duplicate with comment
          // Note with text data
          const note = this.getAnnotationData(ann);
          const displays = note.textDisplay.split(" ");
          for (const display of displays) {
            const result = findTextQuote(this.markdownContainer, {
              exact: display,
              prefix: note.textStart,
              suffix: note.textEnd,
            });

            if (!result) {
              continue;
            }
            const { range, textStart, textEnd } = result;

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

            span.onclick = (e) => {
              this.onCommentedWordClick(e);
            };

            span.after(targetSpan); // Insert targetSpan after AnnotatedWord span

            const acDiv = this.createACdiv(targetDivId);

            const item = this.createAnnotationItem(
              note.fullText,
              note.articleId,
              "comment"
            );

            acDiv?.appendChild(item);
          }
        }
      }
    }

    this.insertNoteLinks();
  }

  private async processLocalAnnotations() {
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
      // Skip invalid
      if (ann.isValid === false) continue;

      if (ann.kind === "Comment") {
        const comment = this.getLocalAnnotationData(ann);

        // Only process comments with source text
        if (comment.textDisplay && comment.textStart && comment.textEnd) {
          const displays = comment.textDisplay.split(" ");
          for (const display of displays) {
            const result = findTextQuote(this.markdownContainer, {
              exact: display,
              prefix: comment.textStart,
              suffix: comment.textEnd,
            });

            if (!result) continue;

            const { range, textStart, textEnd } = result;

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

            span.onclick = (e) => {
              this.onCommentedWordClick(e);
            };

            span.after(targetSpan);

            const acDiv = this.createACdiv(targetDivId);
            const item = this.createAnnotationItem(
              comment.fullText,
              comment.articleId,
              "comment",
              true
            );

            acDiv?.appendChild(item);
          }
        }
      } else if (ann.kind === "Note") {
        const note = this.getLocalAnnotationData(ann);

        if (!note.fullText || !note.textDisplay) {
          const linkText = this.getLinkText(note.articleId);
          const lastDisplayText = note.textDisplay
            ? note.textDisplay.trim().split(" ").pop() || ""
            : "";

          if (!lastDisplayText) continue;

          const result = findTextQuote(this.markdownContainer, {
            exact: lastDisplayText,
            prefix: note.textStart,
            suffix: note.textEnd,
          });

          if (!result) continue;

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
              this.onTxClick(note.articleId);
            }
          });

          this.notesMainContainer?.appendChild(linkEl);
        } else {
          const displays = note.textDisplay.split(" ");
          for (const display of displays) {
            const result = findTextQuote(this.markdownContainer, {
              exact: display,
              prefix: note.textStart,
              suffix: note.textEnd,
            });

            if (!result) continue;

            const { range, textStart, textEnd } = result;

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

            span.onclick = (e) => {
              this.onCommentedWordClick(e);
            };

            span.after(targetSpan);

            const acDiv = this.createACdiv(targetDivId);
            const item = this.createAnnotationItem(
              note.fullText,
              note.articleId,
              "note",
              true
            );

            acDiv?.appendChild(item);
          }
        }
      }
    }

    this.insertNoteLinks();
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
