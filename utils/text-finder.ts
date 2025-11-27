export interface TextQuoteSelector {
  /** Context text that should appear before the target (optional, improves accuracy) */
  prefix?: string;
  /** The exact text to find and select */
  exact: string;
  /** Context text that should appear after the target (optional, improves accuracy) */
  suffix?: string;
}

export interface TextQuoteSelectorResult {
  /** Range covering only the 'exact' text */
  range: Range;
  /** The full matched text including context (prefix + exact + suffix) */
  fullText: string;
  /** Character offset where the exact match starts in the flattened text (stable across DOM changes) */
  textStart: number;
  /** Character offset where the exact match ends in the flattened text (stable across DOM changes) */
  textEnd: number;
}

interface TextNodePosition {
  node: Text;
  /** Start offset of this text node's content in the flattened text */
  start: number;
  /** End offset (exclusive) of this text node's content in the flattened text */
  end: number;
}

/**
 * Collects all text nodes within a container, building a position map.
 * This allows us to translate character offsets in the flattened text
 * back to specific (node, offset) pairs for Range creation.
 */
function collectTextNodes(root: Node): TextNodePosition[] {
  const positions: TextNodePosition[] = [];
  let currentOffset = 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);

  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const length = node.nodeValue?.length ?? 0;
    if (length > 0) {
      positions.push({
        node,
        start: currentOffset,
        end: currentOffset + length,
      });
      currentOffset += length;
    }
  }

  return positions;
}

/**
 * Converts a character offset in the flattened text to a (node, offset) pair.
 * This is the critical bridge between "position in string" and "position in DOM".
 */
function offsetToNodePosition(
  positions: TextNodePosition[],
  offset: number
): { node: Text; offset: number } | null {
  // Handle edge case: offset at the very end
  if (positions.length === 0) return null;

  for (const pos of positions) {
    if (offset >= pos.start && offset <= pos.end) {
      return {
        node: pos.node,
        offset: offset - pos.start,
      };
    }
  }

  // If offset is beyond all text, return end of last node
  const last = positions[positions.length - 1];
  if (offset >= last.end) {
    return {
      node: last.node,
      offset: last.node.nodeValue?.length ?? 0,
    };
  }

  return null;
}

/**
 * Builds the flattened text content from the position map.
 * More efficient than calling textContent again.
 */
function buildTextFromPositions(positions: TextNodePosition[]): string {
  return positions.map((p) => p.node.nodeValue ?? "").join("");
}

/**
 * Normalizes whitespace in text for more flexible matching.
 * Collapses runs of whitespace into single spaces.
 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

/**
 * Finds all occurrences of the selector pattern in the text using context-based matching.
 * Prefix and suffix can appear anywhere before/after the exact text (not necessarily adjacent).
 * Returns the character ranges for each match.
 */
function findMatches(
  text: string,
  selector: TextQuoteSelector,
  options: { normalizeWs?: boolean } = {}
): Array<{
  fullStart: number;
  fullEnd: number;
  exactStart: number;
  exactEnd: number;
}> {
  // eslint-disable-next-line prefer-const
  let { prefix = "", exact, suffix = "" } = selector;
  const matches: Array<{
    fullStart: number;
    fullEnd: number;
    exactStart: number;
    exactEnd: number;
  }> = [];

  if (!exact) return matches;

  // This will be removed when we implement No overlap validation
  // Remove exact word from prefix if it's included at the end
  if (prefix && prefix.includes(exact)) {
    const lastIndex = prefix.lastIndexOf(exact);
    if (lastIndex + exact.length === prefix.length) {
      // Prefix ends with exact word - trim it
      prefix = prefix.substring(0, lastIndex).trim();
    } else {
      // Exact word is in the middle or beginning - remove it and everything after
      prefix = prefix.substring(0, lastIndex).trim();
    }
  }

  // Remove exact word from suffix if it's included at the start
  if (suffix && suffix.includes(exact)) {
    const firstIndex = suffix.indexOf(exact);
    if (firstIndex === 0) {
      // Suffix starts with exact word - trim it
      suffix = suffix.substring(exact.length).trim();
    } else {
      // Exact word is later in suffix - remove it and everything before
      suffix = suffix.substring(firstIndex + exact.length).trim();
    }
  }

  if (options.normalizeWs) {
    const posMap = buildNormalizedPositionMap(text);
    const normText = normalizeWhitespace(text);
    const normPrefix = normalizeWhitespace(prefix);
    const normExact = normalizeWhitespace(exact);
    const normSuffix = normalizeWhitespace(suffix);

    // Find all occurrences of exact text
    let searchStart = 0;
    let idx: number;

    while ((idx = normText.indexOf(normExact, searchStart)) !== -1) {
      const exactStart = idx;
      const exactEnd = idx + normExact.length;

      // Check if prefix exists before this match (if prefix is specified)
      const hasPrefixMatch =
        !normPrefix ||
        (exactStart > 0 &&
          normText.substring(0, exactStart).includes(normPrefix));

      // Check if suffix exists after this match (if suffix is specified)
      const hasSuffixMatch =
        !normSuffix ||
        (exactEnd < normText.length &&
          normText.substring(exactEnd).includes(normSuffix));

      if (hasPrefixMatch && hasSuffixMatch) {
        // Find the actual prefix and suffix positions for context
        let contextStart = exactStart;
        let contextEnd = exactEnd;

        if (normPrefix) {
          const prefixPos = normText.lastIndexOf(normPrefix, exactStart - 1);
          if (prefixPos !== -1) {
            contextStart = prefixPos;
          }
        }

        if (normSuffix) {
          const suffixPos = normText.indexOf(normSuffix, exactEnd);
          if (suffixPos !== -1) {
            contextEnd = suffixPos + normSuffix.length;
          }
        }

        matches.push({
          fullStart: mapNormalizedToOriginal(posMap, contextStart),
          fullEnd: mapNormalizedToOriginal(posMap, contextEnd),
          exactStart: mapNormalizedToOriginal(posMap, exactStart),
          exactEnd: mapNormalizedToOriginal(posMap, exactEnd),
        });
      }

      searchStart = idx + 1;
    }
  } else {
    // Find all occurrences of exact text
    let searchStart = 0;
    let idx: number;

    while ((idx = text.indexOf(exact, searchStart)) !== -1) {
      const exactStart = idx;
      const exactEnd = idx + exact.length;

      // Check if prefix exists before this match (if prefix is specified)
      const hasPrefixMatch =
        !prefix ||
        (exactStart > 0 && text.substring(0, exactStart).includes(prefix));

      // Check if suffix exists after this match (if suffix is specified)
      const hasSuffixMatch =
        !suffix ||
        (exactEnd < text.length && text.substring(exactEnd).includes(suffix));

      if (hasPrefixMatch && hasSuffixMatch) {
        // Find the actual prefix and suffix positions for context
        let contextStart = exactStart;
        let contextEnd = exactEnd;

        if (prefix) {
          const prefixPos = text.lastIndexOf(prefix, exactStart - 1);
          if (prefixPos !== -1) {
            contextStart = prefixPos;
          }
        }

        if (suffix) {
          const suffixPos = text.indexOf(suffix, exactEnd);
          if (suffixPos !== -1) {
            contextEnd = suffixPos + suffix.length;
          }
        }

        matches.push({
          fullStart: contextStart,
          fullEnd: contextEnd,
          exactStart: exactStart,
          exactEnd: exactEnd,
        });
      }

      searchStart = idx + 1;
    }
  }

  return matches;
}

/**
 * Builds a position map from normalized text positions to original positions.
 */
function buildNormalizedPositionMap(original: string): number[] {
  const map: number[] = [];
  let inWhitespace = false;

  for (let i = 0; i < original.length; i++) {
    const char = original[i];
    const isWs = /\s/.test(char);

    if (isWs) {
      if (!inWhitespace) {
        map.push(i); // First whitespace char becomes a space
        inWhitespace = true;
      }
      // Skip subsequent whitespace
    } else {
      map.push(i);
      inWhitespace = false;
    }
  }

  // Add end position for mapping the end offset
  map.push(original.length);

  return map;
}

/**
 * Maps a position in normalized text back to the original text.
 */
function mapNormalizedToOriginal(map: number[], normPos: number): number {
  if (normPos >= map.length) {
    return map[map.length - 1];
  }
  return map[normPos];
}

export interface FindTextQuoteOptions {
  /**
   * If multiple matches exist, which one to select (0-indexed).
   * Default: 0 (first match)
   */
  matchIndex?: number;

  /**
   * Normalize whitespace when matching (collapse runs of whitespace to single space).
   * Useful for matching across element boundaries where whitespace may vary.
   * Default: false
   */
  normalizeWhitespace?: boolean;

  /**
   * If true, returns null when multiple matches exist (ambiguous).
   * Default: false
   */
  requireUnique?: boolean;
}

/**
 * Finds text within a container using a TextQuoteSelector and returns a Range.
 *
 * @param container - The DOM node to search within
 * @param selector - Object containing prefix, exact, and suffix strings
 * @param options - Optional configuration
 * @returns Result object with Range and metadata, or null if not found
 *
 * @example
 * ```typescript
 * // Find "world" that has "Hello" before it and "everyone" after it
 * const result = findTextQuote(document.body, {
 *   prefix: 'Hello',
 *   exact: 'world',
 *   suffix: 'everyone'
 * });
 *
 * if (result) {
 *   // Highlight the exact match
 *   const selection = window.getSelection();
 *   selection?.removeAllRanges();
 *   selection?.addRange(result.range);
 *
 *   console.log(result.fullText); // e.g., "Hello beautiful world, everyone!"
 * }
 * ```
 */
export function findTextQuote(
  container: Node,
  selector: TextQuoteSelector,
  options: FindTextQuoteOptions = {}
): TextQuoteSelectorResult | null {
  const {
    matchIndex = 0,
    normalizeWhitespace: normalizeWs = false,
    requireUnique = false,
  } = options;

  // Validate input
  if (!selector.exact) {
    console.warn("findTextQuote: exact string is required");
    return null;
  }

  // Collect all text nodes with their positions
  const textPositions = collectTextNodes(container);
  if (textPositions.length === 0) {
    return null;
  }

  // Build the full text content
  const fullText = buildTextFromPositions(textPositions);

  // Find all matches
  const matches = findMatches(fullText, selector, { normalizeWs });

  if (matches.length === 0) {
    // Try with whitespace normalization as fallback if not already enabled
    if (!normalizeWs) {
      const normalizedMatches = findMatches(fullText, selector, {
        normalizeWs: true,
      });
      if (normalizedMatches.length > 0) {
        return findTextQuote(container, selector, {
          ...options,
          normalizeWhitespace: true,
        });
      }
    }
    return null;
  }

  // Check uniqueness requirement
  if (requireUnique && matches.length > 1) {
    console.warn(
      `findTextQuote: Found ${matches.length} matches, but requireUnique is true`
    );
    return null;
  }

  // Select the requested match
  if (matchIndex < 0 || matchIndex >= matches.length) {
    console.warn(
      `findTextQuote: matchIndex ${matchIndex} out of bounds (${matches.length} matches)`
    );
    return null;
  }

  const match = matches[matchIndex];

  // Convert character offsets to DOM positions
  const startPos = offsetToNodePosition(textPositions, match.exactStart);
  const endPos = offsetToNodePosition(textPositions, match.exactEnd);

  if (!startPos || !endPos) {
    console.warn("findTextQuote: Failed to map offsets to DOM positions");
    return null;
  }

  // Create the Range
  const range = document.createRange();
  try {
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);
  } catch (e) {
    console.warn("findTextQuote: Failed to create Range:", e);
    return null;
  }

  // Extract the full matched text from the original content
  const matchedFullText = fullText.slice(match.fullStart, match.fullEnd);

  return {
    range,
    fullText: matchedFullText,
    textStart: match.exactStart,
    textEnd: match.exactEnd,
  };
}

/**
 * Finds ALL matches of a TextQuoteSelector within a container.
 * Useful for highlighting all occurrences.
 *
 * @param container - The DOM node to search within
 * @param selector - Object containing prefix, exact, and suffix strings
 * @param options - Optional configuration (matchIndex is ignored)
 * @returns Array of results, one for each match
 */
export function findAllTextQuotes(
  container: Node,
  selector: TextQuoteSelector,
  options: Omit<FindTextQuoteOptions, "matchIndex" | "requireUnique"> = {}
): TextQuoteSelectorResult[] {
  const results: TextQuoteSelectorResult[] = [];
  const { normalizeWhitespace: normalizeWs = false } = options;

  if (!selector.exact) return results;

  const textPositions = collectTextNodes(container);
  if (textPositions.length === 0) return results;

  const fullText = buildTextFromPositions(textPositions);
  let matches = findMatches(fullText, selector, { normalizeWs });

  // Fallback to normalized matching
  if (matches.length === 0 && !normalizeWs) {
    matches = findMatches(fullText, selector, { normalizeWs: true });
  }

  for (const match of matches) {
    const startPos = offsetToNodePosition(textPositions, match.exactStart);
    const endPos = offsetToNodePosition(textPositions, match.exactEnd);

    if (!startPos || !endPos) continue;

    const range = document.createRange();
    try {
      range.setStart(startPos.node, startPos.offset);
      range.setEnd(endPos.node, endPos.offset);
    } catch {
      continue;
    }

    results.push({
      range,
      fullText: fullText.slice(match.fullStart, match.fullEnd),
      textStart: match.exactStart,
      textEnd: match.exactEnd,
    });
  }

  return results;
}

// Default export for convenience
export default findTextQuote;
