import { 
    Plugin,
    MarkdownView,
    normalizePath,
    TFile
} from 'obsidian';

export default class IdealogsArticleSuggestions extends Plugin {
    async onload() {
        console.log('Loading Enhanced Link Suggestions plugin');

        this.loadStyles();

        // @ts-ignore - Accessing private API
        const defaultLinkSuggester = this.app.workspace.editorSuggest.suggests[0];
        if (!defaultLinkSuggester) {
            console.error('Could not find default link suggester');
            return;
        }

        // original methods
        const originalGetSuggestions = defaultLinkSuggester.getSuggestions;
        const originalRenderSuggestion = defaultLinkSuggester.renderSuggestion;
        const originalSelectSuggestion = defaultLinkSuggester.selectSuggestion;

        // @ts-ignore
        defaultLinkSuggester.getSuggestions = async function(context) {
            const query = context.query;
            console.log('Link suggestion query:', query);

            if (query && query.startsWith('\\@')) {
                console.log('Detected \\@ pattern, fetching articles');
                
                try {
                    const searchTerm = query.substring(2);
                    console.log('Searching for:', searchTerm);
                    
                    const kinds = ['Writing', 'Question', 'Insight', 'Subject'].join('&kind=');
                    const url = `http://localhost:8002/api/articles?kind=${kinds}&query=${encodeURIComponent(searchTerm)}`;
                    
                    const response = await fetch(url);
                    if (!response.ok) {
                        console.error('API request failed:', response.statusText);
                        return originalGetSuggestions.call(this, context);
                    }

                    const data = await response.json();
                    
                    if (!data.items || !data.items.length) {
                        console.log('No articles found');
                        return originalGetSuggestions.call(this, context);
                    }
                    
                    // @ts-ignore
                    const articleSuggestions = data.items.map(article => ({
                        type: "special-article",
                        article: article,
                        path: article.title,
                        alias: article.title,
                        score: 100,  // Hack the score
                    }));
                    
                    
                    return Promise.resolve(articleSuggestions);
                } catch (error) {
                    console.error('Error fetching suggestions:', error);
                }
            }
            
            return originalGetSuggestions.call(this, context);
        };

        // @ts-ignore
        defaultLinkSuggester.renderSuggestion = function(suggestion, el) {
            if (suggestion.type === "special-article") {
                
                const article = suggestion.article;
                el.addClass('article-suggestion-item');
                
                const container = el.createDiv({ cls: 'article-suggestion-container' });
                
                const titleRow = container.createDiv({ cls: 'article-title-row' });
                titleRow.createDiv({ 
                    cls: 'article-title',
                    text: article.title
                });
                
                titleRow.createDiv({
                    cls: 'article-kind',
                    text: article.kind
                });
                
                return;
            }
            
            originalRenderSuggestion.call(this, suggestion, el);
        };

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const pluginRef = this;

        // @ts-ignore
        defaultLinkSuggester.selectSuggestion = async function(suggestion, evt) {
            if (suggestion.type === "special-article") {
                console.log('Selected article:', suggestion.article.id);
                
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) return;
                
                const editor = view.editor;
                const cursor = editor.getCursor();
                
                const line = editor.getLine(cursor.line);
                const linkStart = line.lastIndexOf('[[', cursor.ch);
                
                if (linkStart >= 0) {
                    const line = editor.getLine(cursor.line);
                    const textAfterCursor = line.substring(cursor.ch);
                    const hasClosingBrackets = textAfterCursor.startsWith(']]');
                    
                    let endPos = cursor;
                    if (hasClosingBrackets) {
                        endPos = { line: cursor.line, ch: cursor.ch + 2 };
                    }
                    
                    const articleLink = `[[${suggestion.article.id}]]`;
                    
                    editor.replaceRange(
                        articleLink,
                        { line: cursor.line, ch: linkStart },
                        endPos
                    );
                    
                    editor.setCursor({
                        line: cursor.line,
                        ch: linkStart + articleLink.length
                    });

                    try {
                        await saveArticleToJson.call(pluginRef, suggestion.article);
                    } catch (error) {
                        console.error('Error saving article to JSON:', error);
                    }
                    
                    // @ts-ignore
                    this.close();
                }
                
                return;
            }
            
            originalSelectSuggestion.call(this, suggestion, evt);
        };

        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (!file) return;
                console.log('File opened:', file.path);
                
                if (file instanceof TFile && file.extension === 'md') {
                    this.handleMarkdownFileOpen(file);
                }
            })
        );

        console.log('Idealogs Link Suggestions plugin loaded');
    }

    private async handleMarkdownFileOpen(file: TFile) {

        const patterns = ['Ix', '0x', 'Tx', 'Fx'];
        const isIdealogsFile = patterns.some(pattern => file.basename.startsWith(pattern));
        
        if (!isIdealogsFile) return;


        try {
            const url = `http://localhost:8002/api/commits/head/${file.basename}/Content`;
            console.log(`Fetching content from: ${url}`);
            
            const response = await fetch(url);
            
            if (!response.ok) {
                console.error(`API request failed: ${response.status} ${response.statusText}`);
                return;
            }
            
            const data = await response.json();
            
            if (data && data.content) {
                await this.app.vault.modify(file, data.content);
            } else {
                console.error(`No content received for ${file.basename}`);
            }
        } catch (error) {
            console.error('Error fetching or updating content:', error);
        }
    }

    private loadStyles() {
        const styleEl = document.createElement('style');
        styleEl.textContent = `
            .article-suggestion-item {
                padding: 0 !important;
            }
            .article-suggestion-container {
                padding: 8px 10px;
            }
            .article-title-row {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 4px;
            }
            .article-title {
                font-weight: 500;
                flex-grow: 1;
            }
            .article-kind {
                font-size: 0.7em;
                padding: 2px 6px;
                border-radius: 4px;
                background: var(--background-modifier-border);
                color: var(--text-muted);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .article-lede {
                font-size: 0.85em;
                color: var(--text-muted);
                line-height: 1.4;
            }
        `;
        document.head.appendChild(styleEl);
    }

    onunload() {
        console.log('Unloading Idealogs Link Suggestions plugin');
    }
}

async function saveArticleToJson(article: { id: string; title: string; }) {
    console.log('Saving article to JSON:', article.id, article.title);
    
    const folderPath = '.idealogs';
    const filePath = normalizePath(`${folderPath}/articles.json`);
    
    if (!await this.app.vault.adapter.exists(folderPath)) {
        console.log(`Creating folder: ${folderPath}`);
        await this.app.vault.createFolder(folderPath);
    }
    
    const articleData = {
        id: article.id,
        title: article.title
    };
    
    let articles = [];
    
    if (await this.app.vault.adapter.exists(filePath)) {
        console.log(`Reading existing file: ${filePath}`);
        const fileContent = await this.app.vault.adapter.read(filePath);
        
        try {
            articles = JSON.parse(fileContent);
        } catch (error) {
            console.error('Error parsing existing JSON file:', error);
            articles = [];
        }
    } else {
        console.log(`File doesn't exist, will create: ${filePath}`);
    }
    
    const articleExists = articles.some((item: { id: string; }) => item.id === articleData.id);
    
    if (!articleExists) {
        console.log(`Adding new article to list: ${articleData.id}`);
        articles.push(articleData);
        
        console.log(`Writing ${articles.length} articles to file`);
        await this.app.vault.adapter.write(filePath, JSON.stringify(articles, null, 2));
        console.log('Successfully saved article to JSON file');
    }
}
