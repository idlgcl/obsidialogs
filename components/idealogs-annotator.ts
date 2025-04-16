import { ItemView, WorkspaceLeaf, MarkdownRenderer, Component } from 'obsidian';
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
    private mode: AnnotatorMode;
    private altKeyHandler: (e: KeyboardEvent) => void;

    constructor(leaf: WorkspaceLeaf, mode?: AnnotatorMode) {
        super(leaf);
        this.articleId = '';
        this.component = new Component();
        this.articleHeaderEl = this.contentEl.createDiv({ cls: 'idealogs-article-header' });
        this.articleContentEl = this.contentEl.createDiv({ cls: 'idealogs-article-content' });
        this.apiService = new ApiService();
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
    }
    
    setMode(mode: AnnotatorMode): void {
        this.mode = mode;
    }

    async setState(state: any, result: any): Promise<void> {
        if (state && state.mode) {
            this.mode = state.mode;
        }
        if (state && state.articleId) {
            this.articleId = state.articleId;
            await this.loadWebArticleContent();
            if (this.mode === 'WEB') {
                await this.loadAnnotations(true, true)
            }

        }
    }

    getViewType(): string {
        return IDEALOGS_ANNOTATOR;
    }

    getDisplayText(): string {
        return this.articleTitle || this.articleId;
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
    }

    async onClose() {
        document.removeEventListener('keydown', this.altKeyHandler);
        document.removeEventListener('keyup', this.altKeyHandler);
        this.component.unload();
        return super.onClose();
    }
}
