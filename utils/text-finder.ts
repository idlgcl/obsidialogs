export interface TextQuoteSelector {
  prefix?: string;
  exact: string;
  suffix?: string;
}

export interface WordPosition {
  word: string;
  index: number;
}

export interface TextQuoteSelectorResult {
  range: Range;
  fullText: string;
  textStart: number;
  textEnd: number;
}

export interface WordRangeInfo {
  word: string;
  startOffset: number;
  endOffset: number;
  range: Range;
}

export interface AnnotationTextRanges {
  fullRange: Range;
  fullText: string;
  displayRange: Range | null;
  wordRanges: Range[];
  displayWordInfo: WordRangeInfo[];
  startOffset: number;
  endOffset: number;
  displayOffset: number;
  error: null | {
    code: "START_END_NOT_FOUND" | "DISPLAY_NOT_IN_RANGE" | "DISPLAY_NOT_FOUND";
    message: string;
  };
}

interface TextNodePosition {
  node: Text;
  start: number;
  end: number;
}

export function splitIntoWords(textDisplay: string): WordPosition[] {
  const words: WordPosition[] = [];
  let currentIndex = 0;

  const parts = textDisplay.split(/(\s+)/);
  for (const part of parts) {
    if (part.trim()) {
      words.push({ word: part, index: currentIndex });
    }
    currentIndex += part.length;
  }

  return words;
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
 * Finds the containing block element for a node, skipping inline formatting elements.
 * Walks up the parent chain until finding a block-level element.
 */
function getContainingBlock(node: Node, root: Node): Node | null {
  let current = node.parentElement;

  while (current && current !== root) {
    const display = window.getComputedStyle(current).display;

    // Stop at block-level elements
    if (
      display !== "inline" &&
      display !== "inline-block" &&
      display !== "inline-flex" &&
      display !== "inline-grid"
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return root;
}

/**
 * Collects text nodes grouped by their containing block element.
 * Skips inline formatting elements like <strong>, <em>, <span>, etc.
 * Each group contains text nodes that share the same containing block.
 */
function collectTextNodesByParent(root: Node): Map<Node, TextNodePosition[]> {
  const groups = new Map<Node, TextNodePosition[]>();

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);

  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const length = node.nodeValue?.length ?? 0;
    if (length > 0) {
      // Find the containing block, not the immediate parent
      const parent = getContainingBlock(node, root);

      if (parent) {
        if (!groups.has(parent)) {
          groups.set(parent, []);
        }

        const group = groups.get(parent)!;
        const currentOffset = group.reduce(
          (sum, pos) => sum + (pos.end - pos.start),
          0
        );

        group.push({
          node,
          start: currentOffset,
          end: currentOffset + length,
        });
      }
    }
  }

  return groups;
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

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const isLast = i === positions.length - 1;

    // Use < for end boundary to avoid matching boundary positions to previous node
    // Exception: Allow <= for the last node to handle end-of-text positions
    if (
      offset >= pos.start &&
      (offset < pos.end || (isLast && offset === pos.end))
    ) {
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
 * Prefix and suffix can appear anywhere before/after the exact text.
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
      // Prefix ends with exact word
      prefix = prefix.substring(0, lastIndex).trim();
    } else {
      // Exact word is in the middle or beginning
      prefix = prefix.substring(0, lastIndex).trim();
    }
  }

  // Remove exact word from suffix if it's included at the start
  if (suffix && suffix.includes(exact)) {
    const firstIndex = suffix.indexOf(exact);
    if (firstIndex === 0) {
      // Suffix starts with exact word
      suffix = suffix.substring(exact.length).trim();
    } else {
      // Exact word is later in suffix
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

      const hasPrefixMatch =
        !normPrefix || normText.substring(0, exactStart).includes(normPrefix);

      const hasSuffixMatch =
        !normSuffix ||
        (exactEnd < normText.length &&
          normText.substring(exactEnd).includes(normSuffix));

      if (hasPrefixMatch && hasSuffixMatch) {
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
    let searchStart = 0;
    let idx: number;

    while ((idx = text.indexOf(exact, searchStart)) !== -1) {
      const exactStart = idx;
      const exactEnd = idx + exact.length;

      const hasPrefixMatch =
        !prefix || text.substring(0, exactStart).includes(prefix);

      const hasSuffixMatch =
        !suffix ||
        (exactEnd < text.length && text.substring(exactEnd).includes(suffix));

      if (hasPrefixMatch && hasSuffixMatch) {
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
 * Finds text quote matches constrained to single parent elements.
 * Searches within each containing block separately.
 */
function findTextQuoteInParents(
  container: Node,
  selector: TextQuoteSelector,
  options: {
    matchIndex: number;
    normalizeWs: boolean;
    requireUnique: boolean;
    useFullRange?: boolean;
  }
): TextQuoteSelectorResult | null {
  const {
    matchIndex,
    normalizeWs,
    requireUnique,
    useFullRange = false,
  } = options;

  // Collect text nodes grouped by parent
  const parentGroups = collectTextNodesByParent(container);

  if (parentGroups.size === 0) {
    return null;
  }

  // Search within each parent group
  const allMatches: Array<{
    match: {
      fullStart: number;
      fullEnd: number;
      exactStart: number;
      exactEnd: number;
    };
    positions: TextNodePosition[];
  }> = [];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const [_parent, positions] of Array.from(parentGroups.entries())) {
    const text = buildTextFromPositions(positions);
    const matches = findMatches(text, selector, { normalizeWs });

    for (const match of matches) {
      allMatches.push({ match, positions });
    }
  }

  // Fallback to normalized matching if no matches found
  if (allMatches.length === 0 && !normalizeWs) {
    const normalizedMatches: typeof allMatches = [];

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [_parent, positions] of Array.from(parentGroups.entries())) {
      const text = buildTextFromPositions(positions);
      const matches = findMatches(text, selector, { normalizeWs: true });

      for (const match of matches) {
        normalizedMatches.push({ match, positions });
      }
    }

    if (normalizedMatches.length > 0) {
      return findTextQuoteInParents(container, selector, {
        ...options,
        normalizeWs: true,
      });
    }

    return null;
  }

  if (allMatches.length === 0) {
    return null;
  }

  // Check uniqueness requirement
  if (requireUnique && allMatches.length > 1) {
    console.warn(
      `findTextQuote: Found ${allMatches.length} matches, but requireUnique is true`
    );
    return null;
  }

  // Select the requested match
  if (matchIndex < 0 || matchIndex >= allMatches.length) {
    console.warn(
      `findTextQuote: matchIndex ${matchIndex} out of bounds (${allMatches.length} matches)`
    );
    return null;
  }

  const { match, positions } = allMatches[matchIndex];

  // Convert character offsets to DOM positions
  // Use fullStart/fullEnd if useFullRange is true, otherwise use exactStart/exactEnd
  const rangeStart = useFullRange ? match.fullStart : match.exactStart;
  const rangeEnd = useFullRange ? match.fullEnd : match.exactEnd;

  const startPos = offsetToNodePosition(positions, rangeStart);
  const endPos = offsetToNodePosition(positions, rangeEnd);

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

  // Extract the full matched text from the parent's content
  const text = buildTextFromPositions(positions);
  const matchedFullText = text.slice(match.fullStart, match.fullEnd);

  return {
    range,
    fullText: matchedFullText,
    textStart: match.exactStart,
    textEnd: match.exactEnd,
  };
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
        map.push(i);
        inWhitespace = true;
      }
    } else {
      map.push(i);
      inWhitespace = false;
    }
  }

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

  /**
   * If true, only match text that is contained entirely within a single parent element.
   * The range from prefix start to suffix end must not cross sibling boundaries.
   * Default: false
   */
  sameParentOnly?: boolean;

  /**
   * If true, the returned range will include the prefix and suffix context.
   * By default, the range only covers the exact match, and prefix/suffix are used for disambiguation.
   * Set this to true when you want to highlight from the start of the prefix to the end of the suffix.
   * Default: false
   */
  useFullRange?: boolean;
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
    sameParentOnly = false,
    useFullRange = false,
  } = options;

  // Validate input
  if (!selector.exact) {
    console.warn("findTextQuote: exact string is required");
    return null;
  }

  // Use parent-constrained search if requested
  if (sameParentOnly) {
    return findTextQuoteInParents(container, selector, {
      matchIndex,
      normalizeWs,
      requireUnique,
      useFullRange,
    });
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

export function findAnnotationTextRanges(
  container: Node,
  textStart: string,
  textEnd: string,
  textDisplay: string,
  options: {
    sameParentOnly?: boolean;
    normalizeWhitespace?: boolean;
    matchIndex?: number;
  } = {}
): AnnotationTextRanges | null {
  const {
    sameParentOnly = false,
    normalizeWhitespace: normalizeWs = false,
    matchIndex = 0,
  } = options;

  if (!textStart || !textEnd || !textDisplay) return null;

  const parentGroups = sameParentOnly
    ? collectTextNodesByParent(container)
    : new Map([[container, collectTextNodes(container)]]);

  if (parentGroups.size === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const [_parent, positions] of Array.from(parentGroups.entries())) {
    const text = buildTextFromPositions(positions);

    let matches = findMatches(
      text,
      { exact: textStart, suffix: textEnd },
      { normalizeWs }
    );

    if (matches.length === 0 && !normalizeWs) {
      matches = findMatches(
        text,
        { exact: textStart, suffix: textEnd },
        { normalizeWs: true }
      );
    }

    if (matches.length === 0) continue;
    if (matchIndex >= matches.length) continue;

    const match = matches[matchIndex];
    const fullText = text.slice(match.fullStart, match.fullEnd);

    const displayIndex = fullText.indexOf(textDisplay);
    if (displayIndex === -1) {
      const startPos = offsetToNodePosition(positions, match.fullStart);
      const endPos = offsetToNodePosition(positions, match.fullEnd);

      if (!startPos || !endPos) continue;

      const fullRange = document.createRange();
      try {
        fullRange.setStart(startPos.node, startPos.offset);
        fullRange.setEnd(endPos.node, endPos.offset);
      } catch {
        continue;
      }

      return {
        fullRange,
        fullText,
        displayRange: null,
        wordRanges: [],
        displayWordInfo: [],
        startOffset: match.exactStart - match.fullStart,
        endOffset: match.exactEnd - match.fullStart,
        displayOffset: -1,
        error: {
          code: "DISPLAY_NOT_IN_RANGE",
          message: `Text display "${textDisplay}" not found within start→end range`,
        },
      };
    }

    const displayStartGlobal = match.fullStart + displayIndex;
    const displayEndGlobal =
      match.fullStart + displayIndex + textDisplay.length;

    const fullStartPos = offsetToNodePosition(positions, match.fullStart);
    const fullEndPos = offsetToNodePosition(positions, match.fullEnd);
    const displayStartPos = offsetToNodePosition(positions, displayStartGlobal);
    const displayEndPos = offsetToNodePosition(positions, displayEndGlobal);

    if (!fullStartPos || !fullEndPos || !displayStartPos || !displayEndPos) {
      continue;
    }

    const fullRange = document.createRange();
    const displayRange = document.createRange();

    try {
      fullRange.setStart(fullStartPos.node, fullStartPos.offset);
      fullRange.setEnd(fullEndPos.node, fullEndPos.offset);

      displayRange.setStart(displayStartPos.node, displayStartPos.offset);
      displayRange.setEnd(displayEndPos.node, displayEndPos.offset);
    } catch (e) {
      console.warn("Failed to create ranges:", e);
      continue;
    }

    // Find ranges for each word in textDisplay
    const words = splitIntoWords(textDisplay);
    const wordRanges: Range[] = [];
    const displayWordInfo: WordRangeInfo[] = [];

    for (const { word, index } of words) {
      // Calculate word position relative to displayStartGlobal
      const wordStartGlobal = displayStartGlobal + index;
      const wordEndGlobal = wordStartGlobal + word.length;

      const wordStartPos = offsetToNodePosition(positions, wordStartGlobal);
      const wordEndPos = offsetToNodePosition(positions, wordEndGlobal);

      if (wordStartPos && wordEndPos) {
        try {
          const wordRange = document.createRange();
          wordRange.setStart(wordStartPos.node, wordStartPos.offset);
          wordRange.setEnd(wordEndPos.node, wordEndPos.offset);
          wordRanges.push(wordRange);

          // Add detailed word info (use global offsets relative to the parent text)
          displayWordInfo.push({
            word,
            startOffset: wordStartGlobal,
            endOffset: wordEndGlobal,
            range: wordRange,
          });
        } catch (e) {
          console.warn("Failed to create word range for:", word, e);
          // Continue with other words even if one fails
        }
      }
    }

    return {
      fullRange,
      fullText,
      displayRange,
      wordRanges,
      displayWordInfo,
      startOffset: match.exactStart - match.fullStart,
      endOffset: match.exactEnd - match.fullStart,
      displayOffset: displayIndex,
      error: null,
    };
  }

  return null;
}

// Default export for convenience
export default findTextQuote;
