import { Annotation } from "./annotation-service";
import { ApiService } from "./api";

export class LinkTransformer {
  private writingLinkCounters: Map<string, Map<string, number>>;
  private apiService: ApiService;

  constructor(apiService: ApiService) {
    this.apiService = apiService;
    this.writingLinkCounters = new Map();
  }

  /**
   * Transform Idealogs links in a container
   * @Fx -> [?], @Ix -> [!], @Tx -> [1], [2], [3]...
   * @param container - HTML container with rendered markdown
   * @param articleId - Current article ID (for tracking @Tx link numbers)
   * @param onTxClick - Callback when @Tx link is clicked
   * @param notesWithoutSource - Optional map of targetId to notes without source (for quote block transformation)
   */
  async transformLinks(
    container: HTMLElement,
    articleId: string,
    onTxClick: (targetArticleId: string) => void,
    notesWithoutSource?: Map<string, Annotation[]>
  ): Promise<void> {
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
      let targetArticleId = "";
      const hrefMatch = linkHref.match(/@([TFI]x[^/\s]+)/);
      const textMatch = linkText.match(/@([TFI]x[^\]]+)/);

      if (hrefMatch) {
        targetArticleId = hrefMatch[1];
      } else if (textMatch) {
        targetArticleId = textMatch[1];
      }

      if (!targetArticleId) {
        continue;
      }

      // Strip hex counter from Tx article IDs
      if (targetArticleId.startsWith("Tx")) {
        const dotIndex = targetArticleId.lastIndexOf(".");
        if (dotIndex !== -1) {
          targetArticleId = targetArticleId.substring(0, dotIndex);
        }
      }

      let newLinkText = "";

      if (targetArticleId.startsWith("Fx")) {
        newLinkText = "[?]";
      } else if (targetArticleId.startsWith("Ix")) {
        newLinkText = "[!]";
      } else if (targetArticleId.startsWith("Tx")) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (!this.writingLinkCounters.has(articleId)) {
          this.writingLinkCounters.set(articleId, new Map());
        }

        const TXLinkCounter = this.writingLinkCounters.get(articleId)!;

        if (!TXLinkCounter.has(targetArticleId)) {
          TXLinkCounter.set(targetArticleId, TXLinkCounter.size + 1);
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const count = TXLinkCounter.get(targetArticleId)!;

        // note quote block
        if (notesWithoutSource) {
          const hexMatch = (linkHref + linkText).match(/@Tx[^.\]]+\.(\w+)/);
          const hexId = hexMatch?.[1];

          if (hexId) {
            const note = this.findNoteWithoutSourceByHexId(
              notesWithoutSource,
              targetArticleId,
              hexId
            );
            // Try to fetch article and use its title; fallback to [[id]] on error
            try {
              const article = await this.apiService.fetchArticleById(
                targetArticleId
              );
              link.textContent =
                `${article?.title} [${count}]` ||
                `${targetArticleId} [${count}]`;
            } catch (err) {
              // If fetching fails, keep a readable fallback
              link.textContent = `${targetArticleId} [${count}]`;
              console.error("Failed to fetch article for link title:", err);
            }

            const clickHandler = async (e: MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              onTxClick(linkHref);
            };

            link.addEventListener("click", clickHandler);

            if (note?.targetText) {
              this.transformLinkToQuoteBlock(
                link as HTMLElement,
                note,
                clickHandler
              );
              continue;
            }
          }
        }

        newLinkText = `[${count}]`;
      }

      // Update the link text
      if (newLinkText) {
        link.textContent = newLinkText;

        // Add click handler for @Tx links
        if (targetArticleId.startsWith("Tx")) {
          link.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            onTxClick(linkHref);
          });
        }
      }
    }
  }

  private findNoteWithoutSourceByHexId(
    notesWithoutSource: Map<string, Annotation[]>,
    targetId: string,
    hexId: string
  ): Annotation | null {
    const notes = notesWithoutSource.get(targetId);
    if (!notes) return null;
    return notes.find((note) => note.hexId === hexId) || null;
  }

  private transformLinkToQuoteBlock(
    linkElement: HTMLElement,
    note: Annotation,
    clickHandler?: (e: MouseEvent) => void
  ): void {
    const paragraph = linkElement.closest("p");
    if (!paragraph) return;

    const blockquote = document.createElement("blockquote");
    blockquote.className = "idl-note-quote";

    const textPara = document.createElement("p");
    textPara.textContent = note.targetText;
    blockquote.appendChild(textPara);

    const linkPara = document.createElement("p");
    const clonedLink = linkElement.cloneNode(true) as HTMLElement;

    if (clickHandler) {
      clonedLink.addEventListener("click", clickHandler);
    }

    linkPara.appendChild(clonedLink);
    blockquote.appendChild(linkPara);

    paragraph.replaceWith(blockquote);
  }

  /**
   * Clear counters for a specific article
   */
  clearCounters(articleId: string): void {
    this.writingLinkCounters.delete(articleId);
  }

  /**
   * Clear all counters
   */
  clearAllCounters(): void {
    this.writingLinkCounters.clear();
  }
}
