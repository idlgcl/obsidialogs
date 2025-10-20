import { App, WorkspaceLeaf, TFile } from "obsidian";
import { AnnotationData } from "./annotation-service";
import { ApiService } from "./api";
import { IdealogsFileTracker } from "./idealogs-file-tracker";

export class AnnotationHighlighter {
  private app: App;
  private annotationsByElement: Map<HTMLElement, AnnotationData[]> = new Map();
  private apiService: ApiService | null = null;
  private fileTracker: IdealogsFileTracker | null = null;
  private targetSplitLeaf: WorkspaceLeaf | null = null;

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
    annotations: AnnotationData[]
  ): void {
    this.clearHighlights(container);

    for (const annotation of annotations) {
      this.highlightAnnotation(container, annotation);
    }
  }

  private highlightAnnotation(
    container: HTMLElement,
    annotation: AnnotationData
  ): void {
    const searchText = annotation.src_txt_display;

    if (!searchText) {
      console.warn("Annotation has no src_txt_display:", annotation.id);
      return;
    }

    let matches = this.findTextInDOM(
      container,
      searchText,
      annotation.src_txt_start,
      annotation.src_txt_end
    );

    if (matches.length === 0 && annotation.kind === "COMMENT") {
      matches = this.findCommentInDOM(container, annotation);
    } else if (matches.length === 0 && annotation.kind === "NOTE") {
      matches = this.findNoteInDOM(container, annotation);
    }

    if (matches.length === 0) {
      console.warn(
        "Could not find text for annotation:",
        annotation.id,
        searchText
      );
      return;
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
          // Show the popup below (existing behavior)
          this.toggleAnnotationContainer(highlightedSpan, annotation);
          // Also open target in split and flash (new behavior)
          await this.openTargetAndFlash(annotation);
        });
      }
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

    // Try multiple search variations for comments (with/without trailing colon and body)
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
    annotation: AnnotationData
  ): Array<{ node: Text; startOffset: number; endOffset: number }> {
    const matches: Array<{
      node: Text;
      startOffset: number;
      endOffset: number;
    }> = [];

    const fullCommentText = annotation.src_txt;
    const titleText = annotation.src_txt_display;

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
    annotation: AnnotationData
  ): Array<{ node: Text; startOffset: number; endOffset: number }> {
    const matches: Array<{
      node: Text;
      startOffset: number;
      endOffset: number;
    }> = [];

    // Find all internal links (rendered [[@TxXXX]] links)
    const links = container.querySelectorAll("a.internal-link");

    for (const link of Array.from(links)) {
      const linkHref =
        link.getAttribute("href") || link.getAttribute("data-href") || "";
      const linkText = link.textContent || "";

      const targetId = annotation.target;

      if (linkHref.includes(targetId) || linkText.includes(targetId)) {
        // Found the link
        const textBefore = this.getTextBeforeElement(link);
        const displayText = annotation.src_txt_display;

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

    return matches;
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
    annotation: AnnotationData
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
      span.setAttribute("data-annotation-id", annotation.id);
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

  private toggleAnnotationContainer(
    element: HTMLElement,
    annotation: AnnotationData
  ): void {
    const existingContainer = document.querySelector(
      `.idl-annotations-container[data-annotation-id="${annotation.id}"]`
    );

    if (existingContainer) {
      existingContainer.remove();
      return;
    }

    const container = this.createAnnotationContainer(annotation);

    element.after(container);
  }

  private createAnnotationContainer(annotation: AnnotationData): HTMLElement {
    const container = document.createElement("div");
    container.className = "idl-annotations-container";
    container.setAttribute("data-annotation-id", annotation.id);

    const annotationEl = document.createElement("div");
    annotationEl.className = "idl-annotation-item";

    const textEl = document.createElement("div");
    textEl.textContent = annotation.target_txt;
    annotationEl.appendChild(textEl);

    if (annotation.target) {
      const linkEl = document.createElement("div");
      linkEl.style.marginTop = "4px";
      linkEl.style.fontSize = "0.85em";

      const link = document.createElement("a");
      link.className = "internal-link";
      link.setAttribute("href", annotation.target);
      link.textContent = annotation.target;

      link.addEventListener("click", (e) => {
        e.preventDefault();
        this.app.workspace.openLinkText(annotation.target, "", "tab");
      });

      linkEl.appendChild(link);
      annotationEl.appendChild(linkEl);
    }

    container.appendChild(annotationEl);

    return container;
  }

  private async openTargetAndFlash(annotation: AnnotationData): Promise<void> {
    console.log(
      "[AnnotationHighlighter] Opening target and flashing:",
      annotation
    );

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

      if (annotation.target_txt) {
        setTimeout(() => {
          this.flashTargetText(annotation.target_txt);
        }, 500);
      }
    } catch (error) {
      console.error("[AnnotationHighlighter] Error opening target:", error);
    }
  }

  private flashTargetText(targetText: string): void {
    console.log("[AnnotationHighlighter] Flashing target text:", targetText);

    if (!this.targetSplitLeaf || !this.targetSplitLeaf.view) {
      console.warn("[AnnotationHighlighter] No target leaf available");
      return;
    }

    const view = this.targetSplitLeaf.view;
    // @ts-ignore - accessing containerEl
    const container = view.containerEl?.querySelector(".markdown-preview-view");

    if (!container) {
      console.warn("[AnnotationHighlighter] Could not find preview container");
      return;
    }

    console.log("[AnnotationHighlighter] Searching for text in container...");

    // Find the target text in the DOM
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    let currentNode: Node | null;
    let nodesChecked = 0;
    while ((currentNode = walker.nextNode())) {
      nodesChecked++;
      const textNode = currentNode as Text;
      const text = textNode.textContent || "";
      const index = text.indexOf(targetText);

      if (index !== -1) {
        console.log("[AnnotationHighlighter] Found text at node", nodesChecked);

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

    console.log("[AnnotationHighlighter] Checked", nodesChecked, "nodes");
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
}
