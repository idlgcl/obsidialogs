import { 
    Plugin,
    MarkdownView,
    normalizePath,
    TFile,
} from 'obsidian';

// @ts-ignore
const API_ENDPOINT = API_ENDPOINT_VALUE;

export default class IdealogsArticleSuggestions extends Plugin {
    private currentIdealogsFile: TFile | null = null;
    
    async onload() {
        this.loadStyles();

        // @ts-ignore
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

            if (query && query.startsWith('@')) {
                try {
                    const searchTerm = query.substring(1);
                    
                    const kinds = ['Writing', 'Question', 'Insight', 'Subject'].join('&kind=');
                    const url = `${API_ENDPOINT}/articles?kind=${kinds}&query=${encodeURIComponent(searchTerm)}`;
                    
                    const response = await fetch(url);
                    if (!response.ok) {
                        console.error('API request failed:', response.statusText);
                        return originalGetSuggestions.call(this, context);
                    }

                    const data = await response.json();
                    
                    if (!data.items || !data.items.length) {
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
                
                if (this.currentIdealogsFile && 
                    file instanceof TFile && 
                    file.path !== this.currentIdealogsFile.path) {
                    console.log(`Deleting previous Idealogs file after switching: ${this.currentIdealogsFile.path}`);
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
                    console.log(`Deleting closed Idealogs file: ${this.currentIdealogsFile.path}`);
                    try {
                        this.app.vault.delete(this.currentIdealogsFile);
                    } catch (error) {
                        console.error('Error deleting Idealogs file:', error);
                    }
                    this.currentIdealogsFile = null;
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
            const url = `${API_ENDPOINT}/commits/head/${file.basename}/Content`;
            console.log(`Fetching content for: ${file.basename}`);
            
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

    private loadStyles() {
    }

    onunload() {
        if (this.currentIdealogsFile) {
            try {
                this.app.vault.delete(this.currentIdealogsFile);
            } catch (error) {
                console.error('Error deleting Idealogs file during plugin unload:', error);
            }
            this.currentIdealogsFile = null;
        }
        
        console.log('Unloading Idealogs Link Suggestions plugin');
    }
}

async function saveArticleToJson(article: { id: string; title: string; }) {
    console.log('Saving article to JSON:', article.id, article.title);
    
    const folderPath = '.idealogs';
    const filePath = normalizePath(`${folderPath}/articles.json`);
    
    if (!await this.app.vault.adapter.exists(folderPath)) {
        await this.app.vault.createFolder(folderPath);
    }
    
    const articleData = {
        id: article.id,
        title: article.title
    };
    
    let articles = [];
    
    if (await this.app.vault.adapter.exists(filePath)) {
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
        articles.push(articleData);
        await this.app.vault.adapter.write(filePath, JSON.stringify(articles, null, 2));
        console.log('Successfully saved article to JSON file');
    }
}
