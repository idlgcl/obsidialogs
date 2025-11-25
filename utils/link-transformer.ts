export class LinkTransformer {
  private writingLinkCounters: Map<string, Map<string, number>>;

  constructor() {
    this.writingLinkCounters = new Map();
  }

  /**
   * Transform Idealogs links in a container
   * @Fx -> [?], @Ix -> [!], @Tx -> [1], [2], [3]...
   * @param container - HTML container with rendered markdown
   * @param articleId - Current article ID (for tracking @Tx link numbers)
   * @param onTxClick - Callback when @Tx link is clicked
   */
  transformLinks(
    container: HTMLElement,
    articleId: string,
    onTxClick: (targetArticleId: string) => void
  ): void {
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
        // Get or create counter for this article
        if (!this.writingLinkCounters.has(articleId)) {
          this.writingLinkCounters.set(articleId, new Map());
        }
        const fileCounters = this.writingLinkCounters.get(articleId)!;

        if (!fileCounters.has(targetArticleId)) {
          // Next counter number
          fileCounters.set(targetArticleId, fileCounters.size + 1);
        }

        const counter = fileCounters.get(targetArticleId)!;
        newLinkText = `[${counter}]`;
      }

      // Update the link text
      if (newLinkText) {
        link.textContent = newLinkText;

        // Add click handler for @Tx links
        if (targetArticleId.startsWith("Tx")) {
          link.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            onTxClick(targetArticleId);
          });
        }
      }
    }
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
