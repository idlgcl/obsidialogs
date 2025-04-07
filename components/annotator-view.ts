import { ItemView, WorkspaceLeaf, MarkdownRenderer, Component } from 'obsidian';
import { WordProcessor } from '../utils/word-processor';
import { ApiService } from '../utils/api';
import { IdealogsAnnotation } from '../types';

export const ANNOTATOR_VIEW = 'annotator-view';

// @ts-ignore
const ANNOTATION_ENDPOINT = ANNOTATION_ENDPOINT_VALUE;

export interface AnnotationsResponse {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    page: number;
    totalPages: number;
    nextPage: number;
    previousPage: number;
    items: IdealogsAnnotation[];
}

export class AnnotatorView extends ItemView {
    private articleHeaderEl: HTMLElement; 
    private articleContentEl: HTMLElement;
    private articleId: string;
    private articleContent = '';
    private component: Component;
    private apiService: ApiService;
    private annotationsByWordIndex: Map<number, IdealogsAnnotation[]> = new Map();
    private altKeyHandler: (e: KeyboardEvent) => void;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.articleId = '';
        this.component = new Component();
        this.articleHeaderEl = this.contentEl.createDiv({ cls: 'idealogs-article-header' });
        this.articleContentEl = this.contentEl.createDiv({ cls: 'idealogs-article-content' });
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
            await this.loadArticleContent();
            await this.loadAnnotations();
        }
    }

    getViewType(): string {
        return ANNOTATOR_VIEW;
    }

    getDisplayText(): string {
        return 'Article Annotator';
    }

    async loadArticleContent(): Promise<void> {
        try {
            const content = await this.apiService.fetchFileContent(this.articleId);
            this.articleContent = content;

            this.articleHeaderEl.empty();
            this.articleHeaderEl.createEl('h1', { text: this.articleId });
            
            await this.render();
        } catch (error) {
            console.error('Error loading article content:', error);
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
            this.annotationsByWordIndex.clear();
            const annotations = await this.fetchAllAnnotations(this.articleId, this.articleId);
            
            const allWordSpans = this.getAllWordSpans();
            allWordSpans.forEach(span => {
                span.classList.remove('idl-annotated-word', 'source-annotation', 'target-annotation');
                span.removeAttribute('data-has-annotations');
                
                const newSpan = span.cloneNode(true) as HTMLElement;
                span.parentNode?.replaceChild(newSpan, span);
            });
            
            const existingContainers = this.articleContentEl.querySelectorAll('.idl-annotations-container');
            existingContainers.forEach(el => el.remove());
            
            for (const annotation of annotations) {
                this.markAnnotatedWords(annotation);
            }
        } catch (error) {
            console.error('Error loading annotations:', error);
        }
    }
    
    private async fetchAllAnnotations(sourceId: string, targetId: string): Promise<IdealogsAnnotation[]> {
        let page = 1;
        const limit = 50;
        let hasMore = true;
        const allAnnotations: IdealogsAnnotation[] = [];
        
        try {
            while (hasMore) {
                const url = `${ANNOTATION_ENDPOINT}/annotations?target_id=${targetId}&source_id=${sourceId}&is_valid=true&commit_is_merged=true&page=${page}&limit=${limit}`;
                
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`API request failed: ${response.statusText}`);
                }
                
                const data = await response.json() as AnnotationsResponse;
                allAnnotations.push(...data.items);
                
                hasMore = data.hasMore;
                page++;
            }
            
            return allAnnotations;
        } catch (error) {
            console.error('Error fetching annotations:', error);
            return [];
        }
    }
    
    getAllWordSpans(): HTMLElement[] {
        if (!this.articleContentEl) return [];
        const spans = this.articleContentEl.querySelectorAll('span[data-word-index]');
        return Array.from(spans) as HTMLElement[];
    }
    
    markAnnotatedWords(annotation: IdealogsAnnotation): void {
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
            this.annotationsByWordIndex.get(index)?.push(annotation);
        });
        
        indices.forEach((index: number) => {
            const span = this.articleContentEl.querySelector(`span[data-word-index="${index}"]`);
            if (!span) return;
            
            span.classList.add('idl-annotated-word');
            span.classList.add(isFromCurrentArticle ? 'source-annotation' : 'target-annotation');
            
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
        
        annotations.forEach((annotation) => {
            const isFromCurrentArticle = this.articleId === annotation.sourceId;
            const annotationEl = document.createElement('div');
            annotationEl.className = 'idl-annotation-item';
            
            annotationEl.classList.add(isFromCurrentArticle ? 'from-current' : 'to-current');
            
            const textEl = document.createElement('div');
            textEl.textContent = isFromCurrentArticle ? annotation.tTxt : annotation.sTxt;
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

    async onClose() {
        document.removeEventListener('keydown', this.altKeyHandler);
        document.removeEventListener('keyup', this.altKeyHandler);
        
        this.component.unload();
        return super.onClose();
    }
}
