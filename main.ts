import { 
    Plugin, 
    MarkdownView,
    EditorSuggest,
    EditorPosition,
    EditorSuggestContext,
    EditorSuggestTriggerInfo,
    Editor,
    TFile,
    MarkdownPostProcessorContext
} from 'obsidian';

// @ts-ignore - api url updated on build
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

// Custom Word Processor
interface WordProcessorOptions {
    articleId: string;
}

class WordProcessor {
    private wordCount = 0;
    private articleId: string;
    private wordRegex = /(\s*)(\S+)(\s*)/g;

    constructor(options: WordProcessorOptions) {
        this.articleId = options.articleId;
    }

    processMarkdown(element: HTMLElement): void {
        const paragraphs = element.querySelectorAll('p');
        paragraphs.forEach(paragraph => {
            this.processElement(paragraph);
        });
    }

    private processElement(element: HTMLElement): void {
        const fragment = document.createDocumentFragment();
        
        Array.from(element.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent) {
                this.processTextNode(node.textContent, fragment);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                const newEl = document.createElement(el.tagName);
                
                Array.from(el.attributes).forEach(attr => {
                    newEl.setAttribute(attr.name, attr.value);
                });
                
                this.processElement(el);
                
                while (el.firstChild) {
                    newEl.appendChild(el.firstChild);
                }
                
                fragment.appendChild(newEl);
            } else {
                fragment.appendChild(node.cloneNode(true));
            }
        });
        
        element.innerHTML = '';
        element.appendChild(fragment);
    }

    private processTextNode(text: string, parent: DocumentFragment): void {
        let match;
        let lastIndex = 0;
        
        this.wordRegex.lastIndex = 0;
        
        while ((match = this.wordRegex.exec(text)) !== null) {
            const [, leadingSpace, word, trailingSpace] = match;
            
            if (leadingSpace) {
                const spaceSpan = document.createElement('span');
                spaceSpan.textContent = leadingSpace;
                parent.appendChild(spaceSpan);
            }
            
            if (word) {
                const wordSpan = document.createElement('span');
                wordSpan.setAttribute('data-article-id', this.articleId);
                wordSpan.setAttribute('data-word-index', this.wordCount.toString());
                wordSpan.setAttribute('id', `${this.articleId}-${this.wordCount}`);
                wordSpan.textContent = word;
                parent.appendChild(wordSpan);
                this.wordCount++;
            }
            
            if (trailingSpace) {
                const spaceSpan = document.createElement('span');
                spaceSpan.textContent = trailingSpace;
                parent.appendChild(spaceSpan);
            }
            
            lastIndex = this.wordRegex.lastIndex;
        }
        
        if (lastIndex < text.length) {
            const remainingSpan = document.createElement('span');
            remainingSpan.textContent = text.substring(lastIndex);
            parent.appendChild(remainingSpan);
        }
    }
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

export default class IdealogsMDPlugin extends Plugin {
    private articleSuggest: ArticleSuggest;
    private currentIdealogsFile: TFile | null = null;
    private wordProcessor: WordProcessor | null = null;
    
    async onload() {
        this.articleSuggest = new ArticleSuggest(this);
        this.registerEditorSuggest(this.articleSuggest);
        
        this.patchDefaultSuggester();

        this.registerMarkdownPostProcessor(this.customMarkdownProcessor.bind(this));

        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (!file) return;
                
                if (this.currentIdealogsFile && 
                    file instanceof TFile && 
                    file.path !== this.currentIdealogsFile.path) {
                    try {
                        this.app.fileManager.trashFile(this.currentIdealogsFile);
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
                        this.wordProcessor = new WordProcessor({
                            articleId: file.basename
                        });
                        this.handleMarkdownFileOpen(file);
                    } else {
                        this.wordProcessor = null;
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
                        this.app.fileManager.trashFile(this.currentIdealogsFile);
                    } catch (error) {
                        console.error('Error deleting Idealogs file:', error);
                    }
                    this.currentIdealogsFile = null;
                    this.wordProcessor = null;
                }
            })
        );
    }

    onunload() {
        if (this.currentIdealogsFile) {
          try {
            this.app.fileManager.trashFile(this.currentIdealogsFile);
          } catch (error) {
            console.error('Error deleting Idealogs file during unload:', error);
          }
          this.currentIdealogsFile = null;
          this.wordProcessor = null;
        }
    }
    
    private customMarkdownProcessor(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
        // TODO
        if (this.wordProcessor) {
            const file = ctx.sourcePath ? this.app.vault.getAbstractFileByPath(ctx.sourcePath) : null;
            
            if (file instanceof TFile) {
                const patterns = ['Ix', '0x', 'Tx', 'Fx'];
                const isIdealogsFile = patterns.some(pattern => file.basename.startsWith(pattern));
                
                if (isIdealogsFile) {
                    this.wordProcessor.processMarkdown(el);
                }
            }
        }
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
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view && view.file && view.file.path === file.path) {
                    view.editor.setValue(data.content);
                }
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
