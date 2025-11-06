import { App, WorkspaceLeaf, TFile } from "obsidian";
import { Annotation } from "./annotation-service";
import { ApiService } from "./api";
import { IdealogsFileTracker } from "./idealogs-file-tracker";

export class AnnotationHighlighter {
  private app: App;
  private annotationsByElement: Map<HTMLElement, Annotation[]> = new Map();
  private processedContainers: Set<HTMLElement> = new Set();
  private apiService: ApiService | null = null;
  private fileTracker: IdealogsFileTracker | null = null;
  private targetSplitLeaf: WorkspaceLeaf | null = null;
  private writingLinkCounters: Map<string, Map<string, number>> = new Map();

  constructor(app: App) {
    this.app = app;
  }

  setDependencies(
    apiService: ApiService,
    fileTracker: IdealogsFileTracker
  ): void {
    this.apiService = apiService;
    this.fileTracker = fileTracker;
  }

  highlightAnnotations(
    container: HTMLElement,
    annotations: Annotation[]
  ): void {
    // container has already been processed
    if (this.processedContainers.has(container)) {
      return;
    }

    // Check if this container already has highlighted annotations
    const existingHighlights = container.querySelectorAll(
      "span.idl-annotated-word"
    );
    if (existingHighlights.length > 0) {
      this.processedContainers.add(container);
      return;
    }

    this.clearHighlights(container);

    for (const annotation of annotations) {
      this.highlightAnnotation(container, annotation);
    }

    // Mark processed
    this.processedContainers.add(container);
  }

  private highlightAnnotation(
    container: HTMLElement,
    annotation: Annotation
  ): void {
    const searchText = annotation.sourceTextDisplay;

    if (!searchText) {
      console.warn("Annotation has no src_txt_display:", annotation);
      return;
    }

    let matches = this.findTextInDOM(
      container,
      searchText,
      annotation.sourceTextStart,
      annotation.sourceTextEnd
    );

    // primary search failed
    let noteLinkElement: Element | null = null;
    if (matches.length === 0) {
      if (annotation.kind === "COMMENT") {
        matches = this.findCommentInDOM(container, annotation);
      } else if (annotation.kind === "NOTE") {
        const result = this.findNoteInDOM(container, annotation);
        matches = result.matches;
        noteLinkElement = result.linkElement;
      }

      // both primary and fallback methods failed
      // containers without annotations will fail silently
      if (matches.length === 0) {
        return;
      }
    }

    for (const match of matches) {
      const highlightedSpan = this.wrapTextWithHighlight(
        match.node,
        match.startOffset,
        match.endOffset,
        annotation
      );

      if (highlightedSpan) {
        // Track annotations by element
        if (!this.annotationsByElement.has(highlightedSpan)) {
          this.annotationsByElement.set(highlightedSpan, []);
        }
        this.annotationsByElement.get(highlightedSpan)?.push(annotation);

        // click handler
        highlightedSpan.addEventListener("click", async (e) => {
          e.stopPropagation();
          // Removed popup behavior
          // await this.toggleAnnotationContainer(highlightedSpan, annotation);
          if (annotation.kind === "COMMENT" || annotation.kind === "NOTE") {
            await this.openTargetAndFlash(annotation);
          }
        });
      }
    }

    // Store annotation on the link element for NOTE annotations
    if (annotation.kind === "NOTE" && noteLinkElement) {
      (noteLinkElement as any).__annotation = annotation;
    }
  }

  /**
   * Finds text in the DOM, returns array of {node, startOffset, endOffset}
   */
  private findTextInDOM(
    container: HTMLElement,
    searchText: string,
    contextStart?: string,
    contextEnd?: string
  ): Array<{ node: Text; startOffset: number; endOffset: number }> {
    const matches: Array<{
      node: Text;
      startOffset: number;
      endOffset: number;
    }> = [];

    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    const searchVariations = this.generateSearchVariations(searchText);

    let currentNode: Node | null;
    while ((currentNode = walker.nextNode())) {
      const textNode = currentNode as Text;
      const text = textNode.textContent || "";

      for (const variation of searchVariations) {
        let index = text.indexOf(variation);

        while (index !== -1) {
          const hasValidContext = this.verifyContext(
            textNode,
            index,
            variation.length,
            contextStart,
            contextEnd
          );

          if (hasValidContext) {
            matches.push({
              node: textNode,
              startOffset: index,
              endOffset: index + variation.length,
            });
            return matches;
          }

          index = text.indexOf(variation, index + 1);
        }
      }
    }

    return matches;
  }

  private findCommentInDOM(
    container: HTMLElement,
    annotation: Annotation
  ): Array<{ node: Text; startOffset: number; endOffset: number }> {
    const matches: Array<{
      node: Text;
      startOffset: number;
      endOffset: number;
    }> = [];

    const fullCommentText = annotation.sourceText;
    const titleText = annotation.sourceTextDisplay;

    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    let currentNode: Node | null;
    while ((currentNode = walker.nextNode())) {
      const textNode = currentNode as Text;
      const text = textNode.textContent || "";

      const fullLineIndex = text.indexOf(fullCommentText);
      const fullLineWithoutColon = fullCommentText.replace(/:$/, "");
      const fullLineIndexNoColon = text.indexOf(fullLineWithoutColon);

      const foundIndex =
        fullLineIndex !== -1 ? fullLineIndex : fullLineIndexNoColon;

      if (foundIndex !== -1) {
        const titleIndex = text.indexOf(titleText, foundIndex);

        if (titleIndex !== -1 && titleIndex >= foundIndex) {
          matches.push({
            node: textNode,
            startOffset: titleIndex,
            endOffset: titleIndex + titleText.length,
          });
          break;
        }
      }
    }

    return matches;
  }

  private findNoteInDOM(
    container: HTMLElement,
    annotation: Annotation
  ): {
    matches: Array<{ node: Text; startOffset: number; endOffset: number }>;
    linkElement: Element | null;
  } {
    const matches: Array<{
      node: Text;
      startOffset: number;
      endOffset: number;
    }> = [];
    let linkElement: Element | null = null;

    // Find all internal links (rendered [[@TxXXX]] links)
    const links = container.querySelectorAll("a.internal-link");

    for (const link of Array.from(links)) {
      const linkHref =
        link.getAttribute("href") || link.getAttribute("data-href") || "";
      const linkText = link.textContent || "";

      const targetId = annotation.target;

      if (linkHref.includes(targetId) || linkText.includes(targetId)) {
        // Found the link
        linkElement = link;
        const textBefore = this.getTextBeforeElement(link);
        const displayText = annotation.sourceTextDisplay;

        // Check if the text before the link contains our display text
        if (textBefore && textBefore.text.includes(displayText)) {
          const index = textBefore.text.lastIndexOf(displayText);

          if (index !== -1 && textBefore.node) {
            matches.push({
              node: textBefore.node,
              startOffset: index,
              endOffset: index + displayText.length,
            });
            break;
          }
        }
      }
    }

    return { matches, linkElement };
  }

  /**
   * Transform ALL Idealogs links
   * @Fx -> [?], @Ix -> [!], @Tx -> [1], [2], [3]...
   */
  transformAllIdealogsLinks(container: HTMLElement, sourcePath: string): void {
    const links = container.querySelectorAll("a.internal-link");

    for (const link of Array.from(links)) {
      const linkHref =
        link.getAttribute("href") || link.getAttribute("data-href") || "";
      const linkText = link.textContent || "";

      // Skip already transformed
      if (
        linkText.match(/^\[\d+\]$/) ||
        linkText === "[?]" ||
        linkText === "[!]"
      ) {
        continue;
      }

      // Extract article ID from href or text (look for @Tx, @Fx, @Ix pattern)
      let articleId = "";
      const hrefMatch = linkHref.match(/@([TFI]x[^/\s]+)/);
      const textMatch = linkText.match(/@([TFI]x[^\]]+)/);

      if (hrefMatch) {
        articleId = hrefMatch[1];
      } else if (textMatch) {
        articleId = textMatch[1];
      }

      if (!articleId) {
        continue;
      }

      let newLinkText = "";

      if (articleId.startsWith("Fx")) {
        newLinkText = "[?]";
      } else if (articleId.startsWith("Ix")) {
        newLinkText = "[!]";
      } else if (articleId.startsWith("Tx")) {
        // Get or create counter for this file
        if (!this.writingLinkCounters.has(sourcePath)) {
          this.writingLinkCounters.set(sourcePath, new Map());
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const fileCounters = this.writingLinkCounters.get(sourcePath)!;

        if (!fileCounters.has(articleId)) {
          // next counter number
          fileCounters.set(articleId, fileCounters.size + 1);
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const counter = fileCounters.get(articleId)!;
        newLinkText = `[${counter}]`;
      }

      // Update the link text
      if (newLinkText) {
        link.textContent = newLinkText;

        // Add click handler to open the article
        link.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();

          // Check if this link has a saved annotation (set in highlightAnnotation)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const annotation = (link as any).__annotation;
          if (annotation) {
            // Use the flash-enabled handler for saved annotations
            await this.openTargetAndFlash(annotation);
          } else {
            // Use generic handler for links without saved annotations
            this.app.workspace.openLinkText(`@${articleId}`, sourcePath, false);
          }
        });
      }
    }
  }

  private getTextBeforeElement(
    element: Element
  ): { text: string; node: Text | null } | null {
    // eslint-disable-next-line prefer-const
    let previousNode: Node | null = element.previousSibling;

    // If the previous sibling is a text node
    if (previousNode && previousNode.nodeType === Node.TEXT_NODE) {
      return {
        text: previousNode.textContent || "",
        node: previousNode as Text,
      };
    }

    // else, look in the parent's text content
    const parent = element.parentNode;
    if (!parent) return null;

    // Get all text nodes in parent
    const walker = document.createTreeWalker(
      parent,
      NodeFilter.SHOW_TEXT,
      null
    );

    let lastTextNode: Text | null = null;
    let currentNode: Node | null;

    while ((currentNode = walker.nextNode())) {
      if (currentNode === element) {
        break;
      }

      // Check if this text node comes before the element
      if (currentNode.nodeType === Node.TEXT_NODE) {
        lastTextNode = currentNode as Text;
      }
    }

    if (lastTextNode) {
      return {
        text: lastTextNode.textContent || "",
        node: lastTextNode,
      };
    }

    return null;
  }

  private generateSearchVariations(searchText: string): string[] {
    const variations = [searchText];

    if (searchText.endsWith(".")) {
      variations.push(searchText);
    }

    return variations;
  }

  private verifyContext(
    textNode: Text,
    matchIndex: number,
    matchLength: number,
    contextStart?: string,
    contextEnd?: string
  ): boolean {
    if (!contextStart && !contextEnd) {
      return true;
    }

    const fullText = this.getFullTextContent(textNode);
    const nodeStartIndex = this.getTextNodeStartIndex(textNode);
    const absoluteMatchIndex = nodeStartIndex + matchIndex;

    if (contextStart) {
      const beforeText = fullText.substring(
        Math.max(0, absoluteMatchIndex - 100),
        absoluteMatchIndex
      );
      if (!beforeText.includes(contextStart)) {
        return false;
      }
    }

    if (contextEnd) {
      const afterText = fullText.substring(
        absoluteMatchIndex + matchLength,
        Math.min(fullText.length, absoluteMatchIndex + matchLength + 100)
      );
      if (!afterText.includes(contextEnd)) {
        return false;
      }
    }

    return true;
  }

  private getFullTextContent(node: Node): string {
    let parent = node.parentElement;
    while (parent && !parent.classList.contains("markdown-preview-view")) {
      if (parent.parentElement) {
        parent = parent.parentElement;
      } else {
        break;
      }
    }
    return parent?.textContent || "";
  }

  private getTextNodeStartIndex(textNode: Text): number {
    const parent = textNode.parentElement;
    if (!parent) return 0;

    let index = 0;
    const walker = document.createTreeWalker(
      parent,
      NodeFilter.SHOW_TEXT,
      null
    );

    let currentNode: Node | null;
    while ((currentNode = walker.nextNode())) {
      if (currentNode === textNode) {
        break;
      }
      index += (currentNode.textContent || "").length;
    }

    return index;
  }

  private wrapTextWithHighlight(
    textNode: Text,
    startOffset: number,
    endOffset: number,
    annotation: Annotation
  ): HTMLElement | null {
    try {
      const text = textNode.textContent || "";

      // Split into three parts
      const beforeText = text.substring(0, startOffset);
      const matchText = text.substring(startOffset, endOffset);
      const afterText = text.substring(endOffset);

      // highlighting span
      const span = document.createElement("span");
      span.className = "idl-annotated-word";

      // invalid class if annotation is not valid
      if (annotation.isValid === false) {
        span.classList.add("idl-annotation-invalid");
      }

      // bold class for comments
      if (annotation.kind === "COMMENT") {
        span.classList.add("idl-comment-bold");
      }

      span.setAttribute("data-annotation-id", annotation.id as string);

      // validation message as title for tooltip
      if (annotation.validationMessage) {
        span.setAttribute("title", `Invalid: ${annotation.validationMessage}`);
      }

      span.textContent = matchText;

      // fragment to replace the text node
      const fragment = document.createDocumentFragment();

      if (beforeText) {
        fragment.appendChild(document.createTextNode(beforeText));
      }

      fragment.appendChild(span);

      if (afterText) {
        fragment.appendChild(document.createTextNode(afterText));
      }

      // Replace the text node with the fragment
      textNode.parentNode?.replaceChild(fragment, textNode);

      return span;
    } catch (error) {
      console.error("Error wrapping text with highlight:", error);
      return null;
    }
  }

  // popup annotation logic - No longer used - I'm keeping it here because I have a feeling we might need it again.
  // private async toggleAnnotationContainer(
  //   element: HTMLElement,
  //   annotation: AnnotationData
  // ): Promise<void> {
  //   const existingContainer = document.querySelector(
  //     `.idl-annotations-container[data-annotation-id="${annotation.id}"]`
  //   );

  //   if (existingContainer) {
  //     existingContainer.remove();
  //     return;
  //   }

  //   const container = await this.createAnnotationContainer(annotation);

  //   element.after(container);
  // }

  // private getArticleLinkFromId(articleId: string): string {
  //   return `@${articleId}`;
  // }

  // private buildParentHierarchyLinks(
  //   article: Article,
  //   containerEl: HTMLElement,
  //   sourcePath: string
  // ): void {
  //   const parents: { id: string; title: string }[] = [];

  //   if (article.parents && article.parents.length > 0) {
  //     let current: (typeof article.parents)[0] | null | undefined =
  //       article.parents[0];
  //     while (current) {
  //       parents.unshift({ id: current.id, title: current.title });
  //       current = current.parent;
  //     }
  //   }

  //   parents.push({ id: article.id, title: article.title });

  //   parents.forEach((parent, index) => {
  //     if (index > 0) {
  //       containerEl.appendText(" \\ ");
  //     }

  //     const link = document.createElement("a");
  //     link.className = "internal-link";
  //     link.setAttribute("href", parent.id);
  //     link.textContent = parent.title;

  //     link.addEventListener("click", (e) => {
  //       e.preventDefault();
  //       e.stopPropagation();
  //       const linkText = this.getArticleLinkFromId(parent.id);
  //       this.app.workspace.openLinkText(linkText, sourcePath, false);
  //     });

  //     containerEl.appendChild(link);
  //   });
  // }

  // private async createAnnotationContainer(
  //   annotation: AnnotationData
  // ): Promise<HTMLElement> {
  //   const container = document.createElement("div");
  //   container.className = "idl-annotations-container";
  //   container.setAttribute("data-annotation-id", annotation.id);

  //   const annotationEl = document.createElement("div");
  //   annotationEl.className = "idl-annotation-item";

  //   const textEl = document.createElement("div");
  //   textEl.textContent = annotation.target_txt;
  //   annotationEl.appendChild(textEl);

  //   if (annotation.target && this.apiService) {
  //     const linkEl = document.createElement("div");
  //     linkEl.style.marginTop = "4px";
  //     linkEl.style.fontSize = "0.85em";

  //     try {
  //       const article = await this.apiService.fetchArticleById(
  //         annotation.target
  //       );

  //       this.buildParentHierarchyLinks(article, linkEl, annotation.src);
  //     } catch (error) {
  //       console.error("[AnnotationHighlighter] Error fetching article:", error);

  //       const link = document.createElement("a");
  //       link.className = "internal-link";
  //       link.setAttribute("href", annotation.target);
  //       link.textContent = annotation.target;

  //       link.addEventListener("click", (e) => {
  //         e.preventDefault();
  //         e.stopPropagation();
  //         const linkText = this.getArticleLinkFromId(annotation.target);
  //         this.app.workspace.openLinkText(linkText, annotation.src, false);
  //       });

  //       linkEl.appendChild(link);
  //     }

  //     annotationEl.appendChild(linkEl);
  //   }

  //   container.appendChild(annotationEl);

  //   return container;
  // }

  async openTargetAndFlash(annotation: Annotation): Promise<void> {
    if (!this.apiService || !this.fileTracker) {
      console.warn(
        "[AnnotationHighlighter] Dependencies not set, falling back to default"
      );
      this.app.workspace.openLinkText(annotation.target, "", "tab");
      return;
    }

    try {
      const targetId = annotation.target;

      const articleData = await this.apiService.fetchArticleById(targetId);
      const content = await this.apiService.fetchFileContent(targetId);

      const sanitizedTitle = articleData.title.replace(/[/\\:*?"<>|]/g, "");
      const fileName = `${sanitizedTitle}.md`;

      let file = this.app.vault.getAbstractFileByPath(fileName);

      if (file instanceof TFile) {
        await this.app.vault.modify(file, content);
      } else {
        file = await this.app.vault.create(fileName, content);
      }

      this.fileTracker.track(fileName, targetId);

      let isLeafValid = false;
      if (this.targetSplitLeaf && this.targetSplitLeaf.view) {
        try {
          isLeafValid = this.targetSplitLeaf.view.containerEl.isConnected;
        } catch (error) {
          isLeafValid = false;
        }
      }

      if (isLeafValid) {
        await this.targetSplitLeaf?.openFile(file as TFile, {
          state: { mode: "preview" },
        });
      } else {
        const leaf = this.app.workspace.getLeaf("split");
        this.targetSplitLeaf = leaf;
        await leaf.openFile(file as TFile, { state: { mode: "preview" } });
      }

      if (annotation.targetText) {
        setTimeout(() => {
          this.flashTargetText(annotation.targetText);
        }, 500);
      }
    } catch (error) {
      console.error("[AnnotationHighlighter] Error opening target:", error);
    }
  }

  flashTargetText(targetText: string, leaf?: WorkspaceLeaf): void {
    const targetLeaf = leaf || this.targetSplitLeaf;

    if (!targetLeaf || !targetLeaf.view) {
      console.warn("[AnnotationHighlighter] No target leaf available");
      return;
    }

    const view = targetLeaf.view;
    // @ts-ignore - accessing containerEl
    const container = view.containerEl?.querySelector(".markdown-preview-view");

    if (!container) {
      console.warn("[AnnotationHighlighter] Could not find preview container");
      return;
    }

    // Find the target text in the DOM
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    let currentNode: Node | null;
    // let nodesChecked = 0;
    while ((currentNode = walker.nextNode())) {
      // nodesChecked++;
      const textNode = currentNode as Text;
      const text = textNode.textContent || "";
      const index = text.indexOf(targetText);

      if (index !== -1) {
        const beforeText = text.substring(0, index);
        const matchText = text.substring(index, index + targetText.length);
        const afterText = text.substring(index + targetText.length);

        const span = document.createElement("span");
        span.className = "idl-target-flash";
        span.textContent = matchText;

        const fragment = document.createDocumentFragment();
        if (beforeText) {
          fragment.appendChild(document.createTextNode(beforeText));
        }
        fragment.appendChild(span);
        if (afterText) {
          fragment.appendChild(document.createTextNode(afterText));
        }

        textNode.parentNode?.replaceChild(fragment, textNode);

        span.scrollIntoView({ behavior: "smooth", block: "center" });

        setTimeout(() => {
          const textNode = document.createTextNode(matchText);
          span.parentNode?.replaceChild(textNode, span);
        }, 3000);

        break;
      }
    }
  }

  private clearHighlights(container: HTMLElement): void {
    const highlightedSpans = container.querySelectorAll(
      "span.idl-annotated-word"
    );
    highlightedSpans.forEach((span) => {
      const textNode = document.createTextNode(span.textContent || "");
      span.parentNode?.replaceChild(textNode, span);
    });

    const containers = container.querySelectorAll(".idl-annotations-container");
    containers.forEach((el) => el.remove());

    this.annotationsByElement.clear();
  }

  clearProcessedContainers(): void {
    this.processedContainers.clear();
    this.writingLinkCounters.clear();
  }
}
