import { ItemView, WorkspaceLeaf, MarkdownRenderer, Component } from 'obsidian';
import { WordProcessor } from '../utils/word-processor';
import { AnnotationData, AnnotationService } from '../utils/annotation-service';

export const IDEALOGS_READER = 'idealogs-reader';

export class IdealogsReaderView extends ItemView {
    private articleContentEl: HTMLElement;
    private articleId: string;
    private articleContent = '';
    private component: Component;
    private openedFromCommand = false;
    private annotationService: AnnotationService;
    private annotationsByWordIndex: Map<number, {annotation: AnnotationData, type: 'comment' | 'note'}[]> = new Map();

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.articleId = '';
        this.component = new Component();
        this.articleContentEl = this.contentEl.createDiv({ cls: 'idealogs-article-content' });
        this.annotationService = new AnnotationService(this.app);
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
        return 'Idealogs Article';
    }

    async setContent(content: string): Promise<void> {
        this.articleContent = content;
        await this.render();
        
        if (this.articleId) {
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
    }
    
    private async loadAnnotations(): Promise<void> {
        if (!this.articleId) return;
        
        try {
            const allWordSpans = this.getAllWordSpans();
            allWordSpans.forEach(span => {
                span.classList.remove('idl-highlighted-word');
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
            
        } catch (error) {
            console.error('Error loading annotations:', error);
        }
    }
    
    getAllWordSpans(): HTMLElement[] {
        if (!this.articleContentEl) return [];
        const spans = this.articleContentEl.querySelectorAll('span[data-word-index]');
        return Array.from(spans) as HTMLElement[];
    }
    
    highlightComments(comment: any): void {
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
            
            span.classList.add('idl-highlighted-word');
            
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
        
        annotations.forEach(({annotation, type}, i) => {
            if (type === 'comment') {
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
            }
        });
        
        element.after(container);
    }

    async onClose() {
        this.component.unload();
        return super.onClose();
    }
}
