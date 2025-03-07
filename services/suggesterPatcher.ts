import { App } from 'obsidian';

export function patchDefaultSuggester(app: App): void {
    setTimeout(() => {
        // @ts-ignore 
        const suggesters = app.workspace.editorSuggest?.suggests;
        if (!suggesters || !suggesters.length) return;
        
        const defaultLinkSuggester = suggesters[0];
        if (!defaultLinkSuggester) return;
        
        const originalOnTrigger = defaultLinkSuggester.onTrigger;
        
        // @ts-ignore
        defaultLinkSuggester.onTrigger = function(cursor, editor, scope) {
            const line = editor.getLine(cursor.line);
            const textBeforeCursor = line.substring(0, cursor.ch);
            
            if (textBeforeCursor.match(/\[\[@[^[\]]*?$/)) {
                return null;
            }
            
            return originalOnTrigger.call(this, cursor, editor, scope);
        };
    }, 1000);
}
