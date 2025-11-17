export interface ValidationResult {
  valid: boolean;
  error?: string;
  startOffset?: number;
  endOffset?: number;
  rangeText?: string;
  displayOffsetInRange?: number;
}

export function validateTargetTextFields(
  articleContent: string,
  targetTextStart: string,
  targetTextEnd: string,
  targetTextDisplay: string
): ValidationResult {
  const startIndex = articleContent.indexOf(targetTextStart);
  if (startIndex === -1) {
    return { valid: false, error: "Start text not found in article" };
  }

  const endIndex = articleContent.indexOf(targetTextEnd, startIndex);
  if (endIndex === -1) {
    return { valid: false, error: "End text not found after start text" };
  }

  if (endIndex < startIndex) {
    return { valid: false, error: "End text appears before start text" };
  }

  const endPosition = endIndex + targetTextEnd.length;
  const rangeText = articleContent.substring(startIndex, endPosition);

  const displayIndexInRange = rangeText.indexOf(targetTextDisplay);
  if (displayIndexInRange === -1) {
    return { valid: false, error: "Display text not found within range" };
  }

  return {
    valid: true,
    startOffset: startIndex,
    endOffset: endPosition,
    rangeText: rangeText,
    displayOffsetInRange: displayIndexInRange,
  };
}
