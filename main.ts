import { 
    Plugin, 
    MarkdownView,
    EditorSuggest,
    EditorPosition,
    EditorSuggestContext,
    EditorSuggestTriggerInfo,
    Editor,
    TFile
} from 'obsidian';

// @ts-ignore
const API_ENDPOINT = API_ENDPOINT_VALUE;

interface ArticleResponse {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    page: number;
    totalPages: number;
    nextPage: number;
    previousPage: number;
    items: Article[];
}

interface Article {
    id: string;
    title: string;
    kind: string;
    ledeHtml?: string;
    authorId?: number;
    orgId?: number;
    isWorkspace?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

class ArticleSuggest extends EditorSuggest<Article> {
    limit = 100;
    
    constructor(plugin: Plugin) {
        super(plugin.app);
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
            const kinds = ['Writing', 'Question', 'Insight', 'Subject'].join('&kind=');
            const url = `${API_ENDPOINT}/articles?kind=${kinds}&query=${encodeURIComponent(searchTerm)}`;
            
            const response = await fetch(url);
            if (!response.ok) {
                console.error('API request failed:', response.statusText);
                return [];
            }
            
            const data = await response.json() as ArticleResponse;
            
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

    selectSuggestion(article: Article): void {
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
        }
    }
}

export default class ArticleSuggestPlugin extends Plugin {
    private articleSuggest: ArticleSuggest;
    private currentIdealogsFile: TFile | null = null;
    
    async onload() {
        this.articleSuggest = new ArticleSuggest(this);
        this.registerEditorSuggest(this.articleSuggest);
        
        this.patchDefaultSuggester();


        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (!file) return;
                
                
                if (this.currentIdealogsFile && 
                    file instanceof TFile && 
                    file.path !== this.currentIdealogsFile.path) {
                    try {
                        this.app.vault.delete(this.currentIdealogsFile);
                    } catch (error) {
                        console.error('Error deleting Idealogs file:', error);
                    }
                    this.currentIdealogsFile = null;
                }
                
                if (file instanceof TFile && file.extension === 'md') {
                    const patterns = ['Ix', '0x', 'Tx', 'Fx'];
                    const isIdealogsFile = patterns.some(pattern => file.basename.startsWith(pattern));
                    
                    if (isIdealogsFile) {
                        this.currentIdealogsFile = file;
                        this.handleMarkdownFileOpen(file);
                    } else {
                        this.setViewToEditMode(file);
                    }
                }
            })
        );
        
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                if (!this.currentIdealogsFile) return;
                
                const stillOpen = this.app.workspace.getLeavesOfType('markdown')
                    .some(leaf => {
                        const view = leaf.view;
                        return view instanceof MarkdownView && 
                               view.file && 
                               view.file.path === this.currentIdealogsFile?.path;
                    });
                
                if (!stillOpen) {
                    try {
                        this.app.vault.delete(this.currentIdealogsFile);
                    } catch (error) {
                        console.error('Error deleting Idealogs file:', error);
                    }
                    this.currentIdealogsFile = null;
                }
            })
        );
    }
    
    private patchDefaultSuggester() {
        setTimeout(() => {
            // @ts-ignore 
            const suggesters = this.app.workspace.editorSuggest?.suggests;
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

    
    private async handleMarkdownFileOpen(file: TFile) {
        const patterns = ['Ix', '0x', 'Tx', 'Fx'];
        const isIdealogsFile = patterns.some(pattern => file.basename.startsWith(pattern));
        
        if (!isIdealogsFile) return;

        try {
            const url = `${API_ENDPOINT}/commits/head/${file.basename}/Content`;
            
            const response = await fetch(url);
            
            if (!response.ok) {
                console.error(`API request failed: ${response.status} ${response.statusText}`);
                return;
            }
            
            const data = await response.json();
            
            if (data && data.content) {
                await this.app.vault.modify(file, data.content);
                
                this.setViewToReadOnly(file);
            } else {
                console.error(`No content received for ${file.basename}`);
            }
        } catch (error) {
            console.error('Error fetching or updating content:', error);
        }
    }

    private setViewToReadOnly(file: TFile) {
        setTimeout(() => {
            const leaves = this.app.workspace.getLeavesOfType('markdown');
            for (const leaf of leaves) {
                const view = leaf.view;
                if (view instanceof MarkdownView && 
                    view.file && 
                    view.file.path === file.path) {
                    
                    if (view.getMode() !== 'preview') {
                        // @ts-ignore
                        this.app.commands.executeCommandById('markdown:toggle-preview');
                    }
                }
            }
        }, 100);
    }

    private setViewToEditMode(file: TFile) {
        setTimeout(() => {
            const leaves = this.app.workspace.getLeavesOfType('markdown');
            for (const leaf of leaves) {
                const view = leaf.view;
                if (view instanceof MarkdownView && 
                    view.file && 
                    view.file.path === file.path) {
                    
                    if (view.getMode() !== 'source') {
                        // @ts-ignore
                        this.app.commands.executeCommandById('markdown:toggle-preview');
                    }
                }
            }
        }, 100);
    }
}
