import { ItemView, WorkspaceLeaf, MarkdownRenderer, Component } from 'obsidian';
import { WordProcessor } from '../utils/word-processor';
import { AnnotationData, AnnotationService } from '../utils/annotation-service';
import { ApiService } from '../utils/api';

export const IDEALOGS_READER = 'idealogs-reader';

export class IdealogsReaderView extends ItemView {
    private articleHeaderEl: HTMLElement; 
    private articleContentEl: HTMLElement;
    private articleId: string;
    private articleContent = '';
    private component: Component;
    private openedFromCommand = false;
    private annotationService: AnnotationService;
    private apiService: ApiService;
    private annotationsByWordIndex: Map<number, {annotation: AnnotationData, type: 'comment' | 'note'}[]> = new Map();
    private altKeyHandler: (e: KeyboardEvent) => void;
    
    private static writingNumbers: Map<string, number> = new Map();
    private static nextWritingNumber = 1;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.articleId = '';
        this.component = new Component();
        this.articleHeaderEl = this.contentEl.createDiv({ cls: 'idealogs-article-header' });
        this.articleContentEl = this.contentEl.createDiv({ cls: 'idealogs-article-content' });
        this.annotationService = new AnnotationService(this.app);
        this.apiService = new ApiService();
        
        this.altKeyHandler = (e: KeyboardEvent) => {
            if (e.type === 'keydown' && e.key === 'Alt') {
                this.articleContentEl.classList.add('alt-key-pressed');
            } else if (e.type === 'keyup' && e.key === 'Alt') {
                this.articleContentEl.classList.remove('alt-key-pressed');
            }
        };
        
        document.addEventListener('keydown', this.altKeyHandler);
        document.addEventListener('keyup', this.altKeyHandler);
    }
    
    async setState(state: any, result: any): Promise<void> {
        if (state && state.articleId) {
            this.articleId = state.articleId;
        }
        if (state && state.openedFromCommand !== undefined) {
            this.openedFromCommand = state.openedFromCommand;
        }
    }

    isOpenedFromCommand(): boolean {
        return this.openedFromCommand;
    }

    getViewType(): string {
        return IDEALOGS_READER;
    }

    getDisplayText(): string {
        return 'Idealogs Reader';
    }

    private getLinkDisplayText(articleId: string, kind: string): string {
        if (!kind) return articleId;
        
        switch (kind.toLowerCase()) {
            case 'question':
                return '[?]';
            case 'insight':
                return '[!]';
            case 'writing': {
                if (!IdealogsReaderView.writingNumbers.has(articleId)) {
                    IdealogsReaderView.writingNumbers.set(articleId, IdealogsReaderView.nextWritingNumber++);
                }
                const numberValue = IdealogsReaderView.writingNumbers.get(articleId);
                return numberValue !== undefined ? `[${numberValue.toString()}]` : '[0]';
            }
            default:
                return articleId;
        }
    }
    
    private async processInternalLinks(): Promise<void> {
        const internalLinks = this.articleContentEl.querySelectorAll('a.internal-link');
        console.log(internalLinks)
        
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

    async setContent(content: string): Promise<void> {
        this.articleContent = content;

        this.articleHeaderEl.empty();
        this.articleHeaderEl.createEl('div', { text: this.articleId, cls: 'inline-title' });
        
        await this.render();
        
        await this.processInternalLinks();
        
        if (this.articleId && this.isOpenedFromCommand()) {
            await this.loadAnnotations();
        }
    }

    private async render(): Promise<void> {
        this.articleContentEl.empty();
        
        await MarkdownRenderer.render(
            this.app,
            this.articleContent,
            this.articleContentEl,
            '',
            this.component
        );
        
        const processor = new WordProcessor({ articleId: this.articleId });
        processor.processMarkdown(this.articleContentEl);
        
        this.attachLinkHandlers();
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
    
    async loadAnnotations(): Promise<void> {
        if (!this.articleId) return;
        
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
                this.highlightComments(comment);
            }
            
            for (const noteId in annotations.notes) {
                const note = annotations.notes[noteId];
                this.highlightNotes(note);
            }
            
        } catch (error) {
            console.error('Error loading annotations:', error);
        }
    }
    
    getAllWordSpans(): HTMLElement[] {
        if (!this.articleContentEl) return [];
        const spans = this.articleContentEl.querySelectorAll('span[data-word-index]');
        return Array.from(spans) as HTMLElement[];
    }
    
    highlightComments(comment: AnnotationData): void {
        if (!comment.src_txt_display_range || comment.src_txt_display_range.length === 0) return;
        
        const indices = comment.src_txt_display_range;
        
        indices.forEach((index: number) => {
            if (!this.annotationsByWordIndex.has(index)) {
                this.annotationsByWordIndex.set(index, []);
            }
            this.annotationsByWordIndex.get(index)?.push({
                annotation: comment,
                type: 'comment'
            });
        });
        
        indices.forEach((index: number) => {
            const span = this.articleContentEl.querySelector(`span[data-word-index="${index}"]`);
            if (!span) return;
            
            span.classList.add('idl-annotated-word');
            span.classList.add('source-annotation');
            
            if (!span.hasAttribute('data-has-annotations')) {
                span.setAttribute('data-has-annotations', 'true');
                
                span.addEventListener('click', (e) => {
                    this.toggleAnnotationsForWord(index, span as HTMLElement);
                    e.stopPropagation();
                });
            }
        });
    }
    
    highlightNotes(note: AnnotationData): void {
        const { src_txt, src_txt_display, src_txt_start, src_txt_end } = note;
        
        if (!src_txt || !src_txt_display) return;
        
        const wordSpans = this.getAllWordSpans();
        
        const displaySpans = this.findNoteTextDisplay(wordSpans, src_txt, src_txt_display, src_txt_start, src_txt_end);
        
        if (displaySpans.length === 0) return;
        
        const indices = displaySpans.map(span => 
            parseInt(span.getAttribute('data-word-index') || '0')
        );
        
        indices.forEach(index => {
            if (!this.annotationsByWordIndex.has(index)) {
                this.annotationsByWordIndex.set(index, []);
            }
            this.annotationsByWordIndex.get(index)?.push({
                annotation: note,
                type: 'note'
            });
        });
        
        indices.forEach(index => {
            const span = this.articleContentEl.querySelector(`span[data-word-index="${index}"]`);
            if (!span) return;
            
            span.classList.add('idl-annotated-word');
            span.classList.add('target-annotation');
            
            if (!span.hasAttribute('data-has-annotations')) {
                span.setAttribute('data-has-annotations', 'true');
                
                span.addEventListener('click', (e) => {
                    this.toggleAnnotationsForWord(index, span as HTMLElement);
                    e.stopPropagation();
                });
            }
        });
    }
    
    private findNoteTextDisplay(
        spans: HTMLElement[], 
        fullText: string, 
        displayText: string, 
        startText?: string, 
        endText?: string
    ): HTMLElement[] {
        if (startText && displayText && endText) {
            const fullPhrase = fullText;
            const fullPhraseWords = fullPhrase.split(/\s+/).filter(w => w.length > 0);
            
            for (let i = 0; i <= spans.length - fullPhraseWords.length; i++) {
                let found = true;
                const sequence: HTMLElement[] = [];
                
                for (let j = 0; j < fullPhraseWords.length; j++) {
                    if (!spans[i + j] || spans[i + j].textContent !== fullPhraseWords[j]) {
                        found = false;
                        break;
                    }
                    sequence.push(spans[i + j]);
                }
                
                if (found) {
                    const displayWords = displayText.split(/\s+/).filter(w => w.length > 0);
                    const startWords = startText.split(/\s+/).filter(w => w.length > 0);
                    return sequence.slice(startWords.length, startWords.length + displayWords.length);
                }
            }
        }
        
        const displayWords = displayText.split(/\s+/).filter(w => w.length > 0);
        if (displayWords.length === 0) return [];
        
        if (displayWords.length === 1) {
            return spans.filter(span => span.textContent === displayWords[0]);
        }
        
        const result: HTMLElement[] = [];
        
        for (let i = 0; i <= spans.length - displayWords.length; i++) {
            let found = true;
            const sequence: HTMLElement[] = [];
            
            for (let j = 0; j < displayWords.length; j++) {
                if (!spans[i + j] || spans[i + j].textContent !== displayWords[j]) {
                    found = false;
                    break;
                }
                sequence.push(spans[i + j]);
            }
            
            if (found) {
                result.push(...sequence);
                break;
            }
        }
        
        return result;
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
        
        annotations.forEach(({annotation, type}, i) => {
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
        
        this.component.unload();
        return super.onClose();
    }
}
