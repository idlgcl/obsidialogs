import { 
    App,
    Editor,
    EditorPosition,
    EditorSuggest,
    EditorSuggestContext,
    EditorSuggestTriggerInfo,
    Plugin,
    MarkdownView
} from 'obsidian';

interface Article {
    id: string;
    title: string;
    kind: 'Writing' | 'Question' | 'Insight' | 'Subject';
    ledeHtml: string;
    authorId: number;
    orgId: number;
    isWorkspace: boolean;
    createdAt: string;
    updatedAt: string;
}

interface APIResponse {
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

class ArticleSuggester extends EditorSuggest<Article> {
    private plugin: ArticleSuggestPlugin;

    constructor(app: App, plugin: ArticleSuggestPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onTrigger(
        cursor: EditorPosition,
        editor: Editor
    ): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line);
        const trigger = '\\@';
        
        const triggerIndex = line.lastIndexOf(trigger, cursor.ch);
        if (triggerIndex === -1) return null;

        const query = line.slice(triggerIndex + trigger.length, cursor.ch);
        return {
            start: {
                line: cursor.line,
                ch: triggerIndex,
            },
            end: cursor,
            query,
        };
    }

    async getSuggestions(context: EditorSuggestContext): Promise<Article[]> {
        const query = context.query.trim();
        try {
            const kinds = ['Writing', 'Question', 'Insight', 'Subject'].join('&kind=');
            const url = `http://localhost:8002/api/articles?kind=${kinds}&query=${encodeURIComponent(query)}`;
            
            const response = await fetch(url);
            if (!response.ok) return [];

            const data: APIResponse = await response.json();
            return data.items || [];
        } catch (error) {
            console.error('Error fetching suggestions:', error);
            return [];
        }
    }

    renderSuggestion(article: Article, el: HTMLElement): void {
        const container = createDiv({
            cls: 'suggestion-item',
            parent: el
        });

        const titleRow = container.createDiv({ cls: 'suggestion-title-row' });
        
        titleRow.createDiv({
            text: article.title,
            cls: 'suggestion-title'
        });

        titleRow.createDiv({
            text: article.kind,
            cls: 'suggestion-kind'
        });

        if (article.ledeHtml) {
            const plainLede = article.ledeHtml.replace(/<[^>]*>/g, '');
            container.createDiv({
                text: plainLede.length > 60 ? plainLede.slice(0, 60) + '...' : plainLede,
                cls: 'suggestion-lede'
            });
        }
    }

    selectSuggestion(article: Article, evt: MouseEvent | KeyboardEvent): void {
        if (!this.context) return;

        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return;

        activeView.editor.replaceRange(
            `[[${article.id}]]`,
            this.context.start,
            this.context.end
        );
    }
}

export default class ArticleSuggestPlugin extends Plugin {
    private suggester: ArticleSuggester;

    async onload() {
        this.suggester = new ArticleSuggester(this.app, this);
        this.registerEditorSuggest(this.suggester);
        this.loadStyles();
    }

    private loadStyles() {
        const styleEl = document.createElement('style');
        styleEl.textContent = `
            .suggestion-item {
                padding: 8px 10px;
                
            }
            .suggestion-title-row {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 4px;
            }
            .suggestion-title {
                font-weight: 500;
                flex-grow: 1;
            }
            .suggestion-kind {
                font-size: 0.7em;
                padding: 2px 6px;
                border-radius: 4px;
                background: var(--background-modifier-border);
                color: var(--text-muted);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .suggestion-lede {
                font-size: 0.85em;
                color: var(--text-muted);
                line-height: 1.4;
            }
            .suggestion-item.is-selected {
                background-color: var(--background-modifier-hover);
            }
        `;
        document.head.appendChild(styleEl);
    }
}
