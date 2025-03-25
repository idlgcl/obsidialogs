import { 
    Plugin,
    MarkdownView,
    EditorSuggest,
    EditorPosition,
    EditorSuggestContext,
    EditorSuggestTriggerInfo,
    Editor,
} from 'obsidian';
import { Article } from './types';
import { ApiService } from './api';
import { ArticleView, ARTICLE_VIEW_TYPE } from './components/article-view';

export class ArticleSuggest extends EditorSuggest<Article> {
    limit = 100;
    private apiService: ApiService;
    
    constructor(plugin: Plugin) {
        super(plugin.app);
        this.apiService = new ApiService();
    }

    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line);
        const linePrefix = line.substring(0, cursor.ch);
        
        const match = linePrefix.match(/\[\[@([^[\]]*?)$/);
        if (!match) return null;
        
        const query = match[1];
        const startPos = cursor.ch - (match[0].length - 2);
        
        return {
            start: { line: cursor.line, ch: startPos },
            end: cursor,
            query: query
        };
    }

    async getSuggestions(context: EditorSuggestContext): Promise<Article[]> {
        const searchTerm = context.query;
        
        try {
            const data = await this.apiService.fetchArticleSuggestions(searchTerm);
            
            if (!data.items || !data.items.length) {
                return [];
            }
            
            return data.items;
        } catch (error) {
            console.error('Error fetching article suggestions:', error);
            return [];
        }
    }

    renderSuggestion(article: Article, el: HTMLElement): void {
        el.empty();
        el.addClass('idealogs-article');
        
        const container = el.createDiv({ cls: 'idealogs-suggestion-container' });
        
        const titleRow = container.createDiv({ cls: 'article-title-row' });
        
        titleRow.createDiv({ 
            cls: 'article-title',
            text: article.title
        });
        
        titleRow.createDiv({
            cls: 'article-kind',
            text: article.kind
        });
    }

    async selectSuggestion(article: Article): Promise<void> {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        
        const editor = view.editor;
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);

        const textAfterCursor = line.substring(cursor.ch);
        const hasClosingBrackets = textAfterCursor.startsWith(']]');

        let endPos = cursor;
        if (hasClosingBrackets) {
            endPos = { line: cursor.line, ch: cursor.ch + 2 };
        }
        
        const bracketStart = line.lastIndexOf('[[', cursor.ch);
        
        if (bracketStart >= 0) {
            const articleLink = `[[${article.id}]]`;
            
            editor.replaceRange(
                articleLink,
                { line: cursor.line, ch: bracketStart },
                endPos
            );
            
            editor.setCursor({
                line: cursor.line,
                ch: bracketStart + articleLink.length
            });
            
            try {
                const leaf = this.app.workspace.getLeaf('split');
                
                await leaf.setViewState({
                    type: ARTICLE_VIEW_TYPE,
                    active: true,
                    state: { articleId: article.id }
                });
                
                const articleView = leaf.view as ArticleView;
                
                try {
                    const content = await this.apiService.fetchFileContent(article.id);
                    await articleView.setContent(content);
                } catch (error) {
                    console.error('Error fetching article content:', error);
                }
            } catch (error) {
                console.error('Error opening article in new pane:', error);
            }
        }
    }
}
