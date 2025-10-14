// Trigger pattern for article suggestions: [[@query
export const ARTICLE_TRIGGER_PATTERN = /\[\[@[^[\]]*?$/;

// Delay before patching Obsidian's default suggester
export const SUGGESTER_PATCH_DELAY = 1000;

// Debounce delay for API calls (in milliseconds)
export const API_DEBOUNCE_DELAY = 300;

// Link prefix for writing articles
export const WRITING_LINK_PREFIX = "@Tx";

// Link prefixes for insights and questions
export const COMMON_LINK_PREFIXES = ["@Fx", "@Ix"] as const;
