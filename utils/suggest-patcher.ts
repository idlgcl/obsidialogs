import { App } from "obsidian";
import { ARTICLE_TRIGGER_PATTERN, SUGGESTER_PATCH_DELAY } from "../constants";

export function patchDefaultSuggester(app: App): void {
  setTimeout(() => {
    // @ts-ignore - Accessing internal Obsidian API
    const suggesters = app.workspace.editorSuggest?.suggests;
    if (!suggesters || !suggesters.length) return;

    const defaultLinkSuggester = suggesters[0];
    if (!defaultLinkSuggester) return;

    const originalOnTrigger = defaultLinkSuggester.onTrigger;

    // @ts-ignore - Patching internal method
    defaultLinkSuggester.onTrigger = function (cursor, editor, scope) {
      const line = editor.getLine(cursor.line);
      const textBeforeCursor = line.substring(0, cursor.ch);

      // Don't trigger default suggester if we're in article suggestion mode
      if (textBeforeCursor.match(ARTICLE_TRIGGER_PATTERN)) {
        return null;
      }

      return originalOnTrigger.call(this, cursor, editor, scope);
    };
  }, SUGGESTER_PATCH_DELAY);
}
