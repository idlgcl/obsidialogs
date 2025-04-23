import { ItemView, WorkspaceLeaf, MarkdownRenderer, Component, setIcon, TFile, MarkdownView, Notice, ViewStateResult } from 'obsidian';
import { WordProcessor } from '../utils/word-processor';
import { ApiService } from '../utils/api';
import { IdealogsAnnotation } from '../types';
import { AnnotationData, AnnotationService } from '../utils/annotation-service';

export const IDEALOGS_ANNOTATOR = 'idealogs-annotator';

type AnnotatorMode = 'WEB' | 'LOCAL' | 'ANNOTATOR';

export class IdealogsAnnotator extends ItemView {
    private articleHeaderEl: HTMLElement;
    private articleContentEl: HTMLElement;
    private articleId: string;
    private articleTitle = '';
    private articleContent = '';
    private component: Component;
    private apiService: ApiService;
    private annotationService: AnnotationService;
    private annotationsByWordIndex: Map<number, {annotation: IdealogsAnnotation, isLocal: boolean}[]> = new Map();
    private localModeAnnotationsByWordIndex: Map<number, {annotation: AnnotationData}[]> = new Map();
    private mode: AnnotatorMode;
    private altKeyHandler: (e: KeyboardEvent) => void;
    private fileOpenHandlerRef: (file: TFile | null) => void;

    private writingNumbers: Map<string, number> = new Map();
    private nextWritingNumber = 1;

    constructor(leaf: WorkspaceLeaf, mode?: AnnotatorMode) {
        super(leaf);
        this.navigation = true;
        this.writingNumbers = new Map();
        this.nextWritingNumber = 1;

        this.articleId = '';
        this.component = new Component();
        this.articleHeaderEl = this.contentEl.createDiv();
        this.articleContentEl = this.contentEl.createDiv();
        this.apiService = new ApiService();
        this.annotationService = new AnnotationService(this.app);
        if (mode) {
            this.mode = mode;
        }

        this.altKeyHandler = (e: KeyboardEvent) => {
            if (e.type === 'keydown' && e.key === 'Alt') {
                this.articleContentEl.classList.add('alt-key-pressed');
            } else if (e.type === 'keyup' && e.key === 'Alt') {
                this.articleContentEl.classList.remove('alt-key-pressed');
            }
        };
        
        document.addEventListener('keydown', this.altKeyHandler);
        document.addEventListener('keyup', this.altKeyHandler);

        this.setUpActionButtons();

        this.fileOpenHandlerRef = this.handleFileOpen.bind(this);
        
        this.registerEvent(
            this.app.workspace.on('file-open', this.fileOpenHandlerRef)
        );
    }
    
    private handleFileOpen(file: TFile | null): void {
        if (this.mode === 'LOCAL' && file && file.basename !== this.articleId) {
            this.leaf.detach();
        }
    }
    
    setMode(mode: AnnotatorMode): void {
        this.mode = mode;
    }

    async setState(state: any, result: ViewStateResult): Promise<void> {
        this.writingNumbers = new Map();
        this.nextWritingNumber = 1;

        if (state && state.mode) {
            this.mode = state.mode;
        }
        if (state && state.articleId) {
            this.articleId = state.articleId;

            result.history = true;

            if (this.mode === 'WEB') {
                await this.loadWebArticleContent();
                await this.loadAnnotations(true, true)
            }
            else if (this.mode === 'LOCAL') {
                const fileName = `${this.articleId}.md`;
                const file = this.app.vault.getAbstractFileByPath(fileName);
                if (file instanceof TFile) {
                    const content = await this.app.vault.read(file);
                    await this.setLocalContent(content);
                }
            }
            else if (this.mode === 'ANNOTATOR') {
                await this.loadWebArticleContent();
            }
        }
    }

    getState(): any {
        return {
            articleId: this.articleId,
            mode: this.mode
        };
    }


    private getLinkDisplayText(articleId: string, kind: string): string {
        if (!kind) return articleId;
        
        switch (kind.toLowerCase()) {
            case 'question':
                return '[?]';
            case 'insight':
                return '[!]';
            case 'writing': {
                if (!this.writingNumbers.has(articleId)) {
                    this.writingNumbers.set(articleId, this.nextWritingNumber++);
                }
                const numberValue = this.writingNumbers.get(articleId);
                return numberValue !== undefined ? `[${numberValue.toString()}]` : '[0]';
            }
            default:
                return articleId;
        }
    }

    private async processIdealogsLinks(): Promise<void> {
        const internalLinks = this.articleContentEl.querySelectorAll('a.internal-link');
        
        Array.from(internalLinks).forEach(async (link) => {
            if (link instanceof HTMLAnchorElement) {
                const href = link.getAttribute('href');
                if (href) {
                    let kind = '';
                    if (href.startsWith('Tx')) {
                        kind = 'writing';
                    } else if (href.startsWith('Fx')) {
                        kind = 'question';
                    } else if (href.startsWith('Ix')) {
                        kind = 'insight';
                    }
                    
                    if (kind) {
                        const displayText = this.getLinkDisplayText(href, kind);
                        if (displayText !== href) {
                            link.textContent = displayText;
                        }
                    }
                }
            }
        });
    }
    
    private attachLinkHandlers(): void {
        const internalLinks = this.articleContentEl.querySelectorAll('a.internal-link');
        internalLinks.forEach(link => {
            if (link instanceof HTMLAnchorElement) {
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    const href = link.getAttribute('href');
                    if (href) {
                        this.app.workspace.openLinkText(href, '', false);
                    }
                });
            }
        });
        
        const externalLinks = this.articleContentEl.querySelectorAll('a.external-link');
        externalLinks.forEach(link => {
            if (link instanceof HTMLAnchorElement && !link.hasAttribute('data-href-handled')) {
                link.setAttribute('data-href-handled', 'true');
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    const href = link.getAttribute('href');
                    if (href) {
                        window.open(href, '_blank');
                    }
                });
            }
        });
    }

    setUpActionButtons(): void {
        this.addAction("book-open", "Open in Editor", () => {
            if (this.mode === 'WEB') {
                new Notice('Cant open web article in editor.')
                return;
            }
            this.openInEditor()
        });
        this.addAction("edit", "Open in Editor", () => {
            if (this.mode === 'WEB') {
                new Notice('Cant open web article in editor.')
                return;
            }
            this.openInEditor()
        });
    }

    async openInEditor(): Promise<void> {
            if (!this.articleId) return;
            
            const fileName = `${this.articleId}.md`;
            const file = this.app.vault.getAbstractFileByPath(fileName);
            
            if (file instanceof TFile) {
                const leaf = this.app.workspace.getLeaf('tab');
                await leaf.openFile(file);
                this.app.workspace.revealLeaf(leaf);
    
                // @ts-ignore
                const plugin = this.app.plugins.plugins['idealogs-annotator'];
                if (plugin && plugin.fileHandler) {
                    plugin.fileHandler.handleFileOpen(file);
                }
    
                this.leaf.detach();
                
                setTimeout(() => {
                    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (!view) return;
                    
                    const existingButton = view.containerEl.querySelector('.idealogs-reader-button');
                    if (existingButton) existingButton.remove();
                    
                    const viewActionsEl = view.containerEl.querySelector('.view-actions');
                    if (!viewActionsEl) return;
                    
                    const button = document.createElement('button');
                    button.className = 'view-action clickable-icon idealogs-reader-button';
                    button.setAttribute('aria-label', 'Open in Idealogs Reader');
                    setIcon(button, 'book-open-text');
                    
                    button.addEventListener('click', () => {
                        // @ts-ignore
                        const plugin = this.app.plugins.plugins['idealogs-annotator'];
                        if (plugin && typeof plugin.openAnnotatorViewByFile === 'function') {
                            plugin.openAnnotatorViewByFile(file);
                        }
                    });
                    
                    viewActionsEl.insertAdjacentElement('afterbegin', button);
                }, 100); 
            }
        }

    getViewType(): string {
        return IDEALOGS_ANNOTATOR;
    }

    getDisplayText(): string {
        return this.articleTitle || this.articleId;
    }

    async setLocalContent(content: string): Promise<void> {
        this.articleContent = content;
    
        this.articleHeaderEl.empty();
        this.articleHeaderEl.createEl('div', { text: this.articleId, cls: 'inline-title' });
        
        await this.render();
        
        // Use reader-style annotation loading for LOCAL mode
        try {
            const allWordSpans = this.getAllWordSpans();
            allWordSpans.forEach(span => {
                span.classList.remove('idl-annotated-word', 'source-annotation', 'target-annotation');
                span.removeAttribute('data-has-annotations');
                
                const newSpan = span.cloneNode(true) as HTMLElement;
                span.parentNode?.replaceChild(newSpan, span);
            });
            
            const existingContainers = this.articleContentEl.querySelectorAll('.idl-annotations-container');
            existingContainers.forEach(el => el.remove());
            
            this.annotationsByWordIndex.clear();
            
            const annotations = await this.annotationService.loadAnnotations(this.articleId);
            
            for (const commentId in annotations.comments) {
                const comment = annotations.comments[commentId];
                if (comment.isValid !== false) {
                    this.highlightComments(comment);
                }
            }
            
            for (const noteId in annotations.notes) {
                const note = annotations.notes[noteId];
                if (note.isValid !== false) {
                    this.highlightNotes(note);
                }
            }
        } catch (error) {
            console.error('Error loading annotations:', error);
        }
        
        await this.processIdealogsLinks();
    }
    

    async loadWebArticleContent(): Promise<void> {
        try {
            const [content, articleDetails] = await Promise.allSettled([
                this.apiService.fetchFileContent(this.articleId),
                this.apiService.fetchArticleById(this.articleId)
            ]);

            if (content.status === 'fulfilled') {
                this.articleContent = content.value;
            } else {
                this.articleContent = 'Failed to load article content';
                console.error('Error loading article content:', content.reason);
            }

            this.articleHeaderEl.empty();
            if (articleDetails.status === 'fulfilled') {
                this.articleTitle = articleDetails.value.title || this.articleId;
            } else {
                this.articleTitle = this.articleId;
            }
                
            this.articleHeaderEl.createEl('div', { text: this.articleTitle, cls: 'inline-title' });
            
            await this.render();

            await this.processIdealogsLinks();
        } catch (error) {
            console.error('Unexpected error in loadWebArticleContent:', error);
            this.articleContent = 'An error occurred while loading the article';
            this.articleTitle = this.articleId;
            this.articleHeaderEl.empty();
            await this.render();
        }
    }

    async loadAnnotations(local: boolean, web: boolean): Promise<void> {
        if (!this.articleId) return;

        if (!local && !web) return;
        
        try {
            const allWordSpans = this.getAllWordSpans();
            allWordSpans.forEach(span => {
                span.classList.remove('idl-annotated-word', 'source-annotation', 'target-annotation');
                span.removeAttribute('data-has-annotations');
                
                const newSpan = span.cloneNode(true) as HTMLElement;
                span.parentNode?.replaceChild(newSpan, span);
            });
            
            const existingContainers = this.articleContentEl.querySelectorAll('.idl-annotations-container');
            existingContainers.forEach(el => el.remove());
            
            this.annotationsByWordIndex.clear();

            const webAnnotations = web === true ? await this.apiService.fetchAnnotations(this.articleId, this.articleId) : [];
            const localAnnotations = local === true ? await this.getLocalAnnotations() : [];

            for (const annotation of localAnnotations) {
                this.markAnnotatedWords(annotation, true);
            }
            
            for (const annotation of webAnnotations) {
                this.markAnnotatedWords(annotation, false);
            }
        } catch (error) {
            console.error('Error loading annotations:', error);
        }
    }

    private async getLocalAnnotations(): Promise<IdealogsAnnotation[]> {
        try {
            const annotations = await this.annotationService.loadAnnotations(this.articleId);
            const idealogsAnnotations: IdealogsAnnotation[] = [];
            
            
            for (const commentId in annotations.comments) {
                const comment = annotations.comments[commentId];
                idealogsAnnotations.push(this.mapToIdealogsAnnotation(comment, 'Comment'));
            }
            
            for (const noteId in annotations.notes) {
                const note = annotations.notes[noteId];
                idealogsAnnotations.push(this.mapToIdealogsAnnotation(note, 'Note'));
            }
            
            return idealogsAnnotations;
        } catch (error) {
            console.error('Error loading local annotations:', error);
            return [];
        }
    }

    private mapToIdealogsAnnotation(annotation: AnnotationData, kind: string): IdealogsAnnotation {
        const isValid = annotation.isValid !== false;
        
        return {
            id: parseInt(annotation.id) || 0,
            kind: kind,
            commitId: 0,
            isValid: isValid,
            validationMessage: annotation.validationMessage,
            commitIsMerged: true,
            
            sourceId: annotation.src,
            sTxtStart: annotation.src_txt_start,
            sTxtEnd: annotation.src_txt_end,
            sTxtDisplay: annotation.src_txt_display,
            sTxt: annotation.src_txt,
            sTxtDisplayRange: annotation.src_txt_display_range,
            sTxtRange: annotation.src_range,
            
            targetId: this.articleId,
            tTxtStart: annotation.target_txt_start,
            tTxtEnd: annotation.target_txt_end,
            tTxtDisplay: annotation.target_txt_display,
            tTxt: annotation.target_txt,
            tTxtDisplayRange: annotation.target_txt_display_range,
            tTxtRange: annotation.target_range
        };
    }

    getAllWordSpans(): HTMLElement[] {
        if (!this.articleContentEl) return [];
        const spans = this.articleContentEl.querySelectorAll('span[data-word-index]');
        return Array.from(spans) as HTMLElement[];
    }

    markAnnotatedWords(annotation: IdealogsAnnotation, isLocal: boolean): void {
        const isFromCurrentArticle = this.articleId === annotation.sourceId;
        const isToCurrentArticle = this.articleId === annotation.targetId;

        if (!isFromCurrentArticle && !isToCurrentArticle) return;
        
        const indices = isFromCurrentArticle 
            ? annotation.sTxtDisplayRange 
            : annotation.tTxtDisplayRange;
        
        if (!indices || indices.length === 0) return;
        
        indices.forEach((index: number) => {
            if (!this.annotationsByWordIndex.has(index)) {
                this.annotationsByWordIndex.set(index, []);
            }
            
            const annotationsArray = this.annotationsByWordIndex.get(index);
            if (isLocal) {
                annotationsArray?.unshift({annotation, isLocal: true});
            } else {
                annotationsArray?.push({annotation, isLocal: false});
            }
        });
        
        indices.forEach((index: number) => {
            const span = this.articleContentEl.querySelector(`span[data-word-index="${index}"]`);
            if (!span) return;
            
            span.classList.add('idl-annotated-word');
            span.classList.add(isFromCurrentArticle ? 'source-annotation' : 'target-annotation');
            
            if (isLocal) {
                span.classList.add('local-annotation');
            }
            
            if (!span.hasAttribute('data-has-annotations')) {
                span.setAttribute('data-has-annotations', 'true');
                
                span.addEventListener('click', (e) => {
                    this.toggleAnnotationsForWord(index, span as HTMLElement);
                    e.stopPropagation();
                });
            }
        });
    }

    private toggleAnnotationsForWord(wordIndex: number, element: HTMLElement): void {
        const existingContainer = this.articleContentEl.querySelector(`.idl-annotations-container[data-for-word="${wordIndex}"]`);
        
        if (existingContainer) {
            existingContainer.remove();
            return;
        }
        
        const annotations = this.annotationsByWordIndex.get(wordIndex);
        if (!annotations || annotations.length === 0) return;
        
        const container = document.createElement('div');
        container.className = 'idl-annotations-container';
        container.setAttribute('data-for-word', wordIndex.toString());
        
        annotations.forEach(({annotation, isLocal}) => {
            const isFromCurrentArticle = this.articleId === annotation.sourceId;
            const annotationEl = document.createElement('div');
            annotationEl.className = 'idl-annotation-item';
            
            annotationEl.classList.add(isFromCurrentArticle ? 'from-current' : 'to-current');
            
            if (isLocal) {
                annotationEl.classList.add('local-annotation-item');
            }
            
            if (annotation.isValid === false) {
                annotationEl.classList.add('idl-invalid-annotation');
            }
            
            const textEl = document.createElement('div');
            let textContent = isFromCurrentArticle ? annotation.tTxt : annotation.sTxt;
            
            if (annotation.kind === 'Comment') {
                textContent = textContent.replace(annotation.sTxtDisplay, '').trim()
            }

            textEl.textContent = textContent;
            
            annotationEl.appendChild(textEl);
            
            const relatedArticleId = isFromCurrentArticle ? annotation.targetId : annotation.sourceId;
            if (relatedArticleId && relatedArticleId !== this.articleId) {
                const linkEl = document.createElement('div');
                linkEl.style.marginTop = '4px';
                linkEl.style.fontSize = '0.85em';
                
                const link = document.createElement('a');
                link.className = 'internal-link';
                link.setAttribute('href', relatedArticleId);
                link.textContent = relatedArticleId;
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.app.workspace.openLinkText(relatedArticleId, '', 'tab');
                });
                
                linkEl.appendChild(link);
                annotationEl.appendChild(linkEl);
            }
            
            container.appendChild(annotationEl);
        });
        
        element.after(container);
    }


    private async render(): Promise<void> {
        this.articleHeaderEl.empty();
        this.articleContentEl.empty();
        
        this.articleContentEl.addClass('markdown-reading-view');
        
        const previewView = this.articleContentEl.createDiv({
            cls: 'markdown-preview-view markdown-rendered node-insert-event is-readable-line-width allow-fold-headings allow-fold-lists show-indentation-guide show-properties'
        });
        
        const previewSection = previewView.createDiv({
            cls: 'markdown-preview-sizer markdown-preview-section idealogs-article-content'
        });
        
        previewSection.createDiv({ cls: 'markdown-preview-pusher', attr: { style: 'width: 1px; height: 0.1px; margin-bottom: 0px;' } });
        
        const headerDiv = previewSection.createDiv({ cls: 'mod-header mod-ui' });
        headerDiv.createDiv({ 
            cls: 'inline-title', 
            text: this.articleTitle || this.articleId,
            attr: { 
                contenteditable: 'false',
                spellcheck: 'true',
                autocapitalize: 'on',
                tabindex: '-1',
                enterkeyhint: 'done'
            }
        });
        
        await MarkdownRenderer.render(
            this.app,
            this.articleContent,
            previewSection,
            '',
            this.component
        );
        
        const processor = new WordProcessor({ articleId: this.articleId });
        processor.processMarkdown(previewSection);
        
        this.attachLinkHandlers();
    }

    // for LOCAL mode
    private highlightComments(comment: AnnotationData): void {
        if (comment.isValid === false) return;
    
        if (!comment.src_txt_display_range || comment.src_txt_display_range.length === 0) return;
        
        const indices = comment.src_txt_display_range;
        
        indices.forEach((index: number) => {
            if (!this.localModeAnnotationsByWordIndex.has(index)) {
                this.localModeAnnotationsByWordIndex.set(index, []);
            }
            this.localModeAnnotationsByWordIndex.get(index)?.push({
                annotation: comment
            });
        });
        
        indices.forEach((index: number) => {
            const span = this.articleContentEl.querySelector(`span[data-word-index="${index}"]`);
            if (!span) return;
            
            span.classList.add('idl-annotated-word');
            span.classList.add('source-annotation');
            span.classList.add('local-annotation');
            
            if (!span.hasAttribute('data-has-annotations')) {
                span.setAttribute('data-has-annotations', 'true');
                
                span.addEventListener('click', (e) => {
                    this.toggleLocalModeAnnotationsForWord(index, span as HTMLElement);
                    e.stopPropagation();
                });
            }
        });
    }
    
    private highlightNotes(note: AnnotationData): void {
        if (note.isValid === false) return;
        
        const displayText = note.src_txt_display;
        if (!displayText) return;
        
        const allSpans = this.getAllWordSpans();
        if (allSpans.length === 0) return;
        
        const matchingSpans: HTMLElement[] = [];
        
        if (note.noteMeta && note.noteMeta.previousWordsIndex && note.noteMeta.linkTextIndex) {
            const linkIndex = note.noteMeta.linkTextIndex[0];
            const linkSpan = allSpans.find(span => {
                const index = parseInt(span.getAttribute('data-word-index') || '-1');
                return index === linkIndex;
            });
            
            if (linkSpan) {
                const previousIndices = note.noteMeta.previousWordsIndex;
                for (const index of previousIndices) {
                    const span = allSpans.find(s => 
                        parseInt(s.getAttribute('data-word-index') || '-1') === index
                    );
                    if (span) matchingSpans.push(span);
                }
                
                const displayWords = displayText.split(/\s+/).filter(w => w.length > 0);
                const filteredSpans = matchingSpans.filter(span => 
                    displayWords.some(word => span.textContent === word || 
                                             span.textContent?.includes(word))
                );
                
                if (filteredSpans.length > 0) {
                    const indices = filteredSpans.map(span => 
                        parseInt(span.getAttribute('data-word-index') || '0')
                    );
                    
                    indices.forEach(index => {
                        if (!this.localModeAnnotationsByWordIndex.has(index)) {
                            this.localModeAnnotationsByWordIndex.set(index, []);
                        }
                        this.localModeAnnotationsByWordIndex.get(index)?.push({
                            annotation: note,
                        });
                    });
                    
                    indices.forEach(index => {
                        const span = this.articleContentEl.querySelector(`span[data-word-index="${index}"]`);
                        if (!span) return;
                        
                        span.classList.add('idl-annotated-word');
                        span.classList.add('source-annotation');
                        span.classList.add('local-annotation');
                        
                        if (!span.hasAttribute('data-has-annotations')) {
                            span.setAttribute('data-has-annotations', 'true');
                            
                            span.addEventListener('click', (e) => {
                                this.toggleLocalModeAnnotationsForWord(index, span as HTMLElement);
                                e.stopPropagation();
                            });
                        }
                    });
                    
                    return; 
                }
            }
        }
    }

    private toggleLocalModeAnnotationsForWord(wordIndex: number, element: HTMLElement): void {
        const existingContainer = this.articleContentEl.querySelector(`.idl-annotations-container[data-for-word="${wordIndex}"]`);
        
        if (existingContainer) {
            existingContainer.remove();
            return;
        }
        
        const annotations = this.localModeAnnotationsByWordIndex.get(wordIndex);
        if (!annotations || annotations.length === 0) return;
        
        const container = document.createElement('div');
        container.className = 'idl-annotations-container';
        container.setAttribute('data-for-word', wordIndex.toString());
        
        annotations.forEach(({annotation}, i) => {
            const annotationEl = document.createElement('div');
            annotationEl.className = 'idl-annotation-item';
            
            const textEl = document.createElement('div');
            textEl.textContent = annotation.target_txt;
            annotationEl.appendChild(textEl);
            
            if (annotation.target) {
                const linkEl = document.createElement('div');
                linkEl.style.marginTop = '4px';
                linkEl.style.fontSize = '0.85em';
                
                const link = document.createElement('a');
                link.className = 'internal-link';
                link.setAttribute('href', annotation.target);
                link.textContent = `${annotation.target}`;
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.app.workspace.openLinkText(annotation.target, '', 'tab');
                });
                
                linkEl.appendChild(link);
                annotationEl.appendChild(linkEl);
            }
            
            container.appendChild(annotationEl);
        });
        
        element.after(container);
    }
    

    async onClose() {
        document.removeEventListener('keydown', this.altKeyHandler);
        document.removeEventListener('keyup', this.altKeyHandler);
        
        this.app.workspace.off('file-open', this.fileOpenHandlerRef);
        
        this.component.unload();
        return super.onClose();
    }
}
