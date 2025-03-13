import { 
    ItemView, 
    WorkspaceLeaf, 
    TFile,
    MarkdownRenderer,
} from 'obsidian';
import { WordProcessor } from './WordProcessor';
import { ANNOTATE_FORM_VIEW_TYPE, AnnotateFormView } from './AnnotateForm';
import { Comment } from 'types/interfaces';
import { AnnotationService } from '../services/annotationService';

export const ANNOTATOR_VIEW_TYPE = 'idl-annotator-view';

export class AnnotatorView extends ItemView {
    private contentContainer: HTMLElement;
    private wordProcessor: WordProcessor | null = null;
    private currentFile: TFile | null = null;
    private comments: Comment[] = [];
    private originalFile: TFile | null = null;
    private mode: 'display' | 'annotate' = 'display';
    private annotateButton: HTMLElement | null = null;
    private annotationService: AnnotationService;
    
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.annotationService = new AnnotationService(this.app);
    }

    getCurrentFile(): TFile | null {
        return this.currentFile;
    }
    
    getViewType(): string {
        return ANNOTATOR_VIEW_TYPE;
    }
    
    getDisplayText(): string {
        return 'Idealogs Annotator';
    }

    async onOpen(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();
        
        const toolbar = containerEl.createDiv({
            cls: 'idl-annotator-toolbar'
        });
        
        this.annotateButton = toolbar.createEl('button', {
            text: 'Annotate',
            cls: 'idl-open-form-button'
        });
        
        this.annotateButton.addEventListener('click', () => {
            if (this.mode === 'display') {
                this.setMode('annotate');
            } else {
                this.setMode('display');
            }
        });
        
        this.contentContainer = containerEl.createDiv({
            cls: 'idl-annotator-content-container'
        });
        
        if (!this.currentFile) {
            this.contentContainer.createEl('div', {
                text: 'Idealogs Annotator',
                cls: 'idl-annotator-placeholder'
            });
        }
    }
    
    setMode(mode: 'display' | 'annotate'): void {
        this.mode = mode;
        
        if (mode === 'display') {
            if (this.annotateButton) {
                this.annotateButton.setText('Annotate');
            }
            
            if (this.originalFile) {
                this.setFile(this.originalFile);
            }
            
            const existingFormLeaves = this.app.workspace.getLeavesOfType(ANNOTATE_FORM_VIEW_TYPE);
            existingFormLeaves.forEach(leaf => {
                leaf.detach();
            });
        } else {
            if (this.annotateButton) {
                this.annotateButton.setText('Back to Display Mode');
            }
            
            const existingFormLeaves = this.app.workspace.getLeavesOfType(ANNOTATE_FORM_VIEW_TYPE);
            
            if (existingFormLeaves.length > 0) {
                const leaf = existingFormLeaves[0];
                this.app.workspace.revealLeaf(leaf);
                const formView = leaf.view as AnnotateFormView;
                formView.setComments(this.comments);
                if (this.originalFile) {
                    formView.setOriginalFile(this.originalFile);
                }
            } else {
                const rightLeaf = this.app.workspace.getRightLeaf(false) || 
                                 this.app.workspace.getLeaf('split', 'vertical');
                
                if (rightLeaf) {
                    rightLeaf.setViewState({
                        type: ANNOTATE_FORM_VIEW_TYPE,
                        active: true
                    });
                    
                    this.app.workspace.revealLeaf(rightLeaf);
                    
                    setTimeout(() => {
                        const formView = rightLeaf.view as AnnotateFormView;
                        formView.setComments(this.comments);
                        if (this.originalFile) {
                            formView.setOriginalFile(this.originalFile);
                        }
                    }, 10);
                }
            }
        }
    }
    
    async setFile(file: TFile): Promise<void> {
        if (!this.originalFile) {
            this.originalFile = file;
        }
        
        if (this.mode === 'display') {
            this.currentFile = this.originalFile;
        } else {
            this.currentFile = file;
        }
        
        this.wordProcessor = new WordProcessor({
            articleId: this.currentFile.basename
        });
        
        await this.loadContent();
        
        if (this.currentFile && this.currentFile.basename.startsWith('Tx') && this.mode === 'display') {
            await this.loadAnnotations();
        }
    }
    
    async loadContent(): Promise<void> {
        if (!this.currentFile) return;
        
        this.contentContainer.empty();
        
        const content = await this.app.vault.read(this.currentFile);
        
        const renderContainer = this.contentContainer.createDiv({
            cls: 'idl-annotator-render-container'
        });
        
        const titleEl = renderContainer.createDiv({
            cls: 'inline-title idl-annotator-title'
        });
        
        titleEl.setText(this.currentFile.basename);
        
        await MarkdownRenderer.render(
            this.app,
            content, 
            renderContainer, 
            this.currentFile.path, 
            this
        );
        
        if (this.wordProcessor) {
            this.wordProcessor.processMarkdown(renderContainer);
            this.comments = this.parseComments(content, renderContainer);
        }
        
        this.setupLinkClickHandlers(renderContainer);
    }
    
    private parseComments(text: string, container: HTMLElement): Comment[] {
        const segments = text.split('\n');
        const pattern = /^(.*?)\.\s+(.*)$/;
        const results: Comment[] = [];
        
        const wordSpans = container.querySelectorAll('span[data-word-index]');
        
        for (const segment of segments) {
            if (segment.startsWith('## ')) {
                continue;
            }

            if (!segment.endsWith(':')) {
                continue;
            }

            const match = segment.match(pattern);
            
            if (!match) {
                continue;
            }

            const [, title, description] = match;
            const fullText = title.trim() + '. ' + description.trim();
            
            const foundIndices = this.findCommentIndices(wordSpans, fullText);
            
            if (foundIndices.length > 0) {
                results.push({
                    title: title.trim() + '.',
                    body: description.trim(),
                    indices: foundIndices
                });
            }
        }

        return results;
    }
    
    private findCommentIndices(wordSpans: NodeListOf<Element>, commentText: string): number[] {
        const commentWords = commentText.split(/\s+/).filter(w => w.length > 0);
        const indices: number[] = [];
        
        if (commentWords.length === 0) {
            return indices;
        }
        
        const spans = Array.from(wordSpans) as HTMLElement[];
        
        for (let i = 0; i <= spans.length - commentWords.length; i++) {
            let allWordsMatched = true;
            const tempIndices: number[] = [];
            
            for (let j = 0; j < commentWords.length; j++) {
                const span = spans[i + j];
                if (!span || span.textContent !== commentWords[j]) {
                    allWordsMatched = false;
                    break;
                }
                
                const indexAttr = span.getAttribute('data-word-index');
                if (indexAttr) {
                    tempIndices.push(parseInt(indexAttr));
                } else {
                    allWordsMatched = false;
                    break;
                }
            }
            
            if (allWordsMatched) {
                return tempIndices;
            }
        }
        
        return indices;
    }
    
    private setupLinkClickHandlers(element: HTMLElement): void {
        const links = element.querySelectorAll('a.internal-link');
        
        links.forEach((link: HTMLElement) => {
            const href = link.getAttribute('href');
            if (!href) return;
            
            link.addEventListener('click', (event) => {
                event.preventDefault();
                
                this.app.workspace.openLinkText(
                    href,
                    this.currentFile?.path || '',
                    'tab'
                );
            });
        });
    }

    getAllWordSpans(): HTMLElement[] {
        if (!this.contentContainer) return [];
        const spans = this.contentContainer.querySelectorAll('span[data-word-index]');
        return Array.from(spans) as HTMLElement[];
    }
    
    // TODO: wont work when we load annotation that targets this article
    private annotationsByWordIndex: Map<number, {text: string, type: 'comment' | 'note'}[]> = new Map();

    highlightWords(indices: number[], targetText?: string, type: 'comment' | 'note' = 'note'): void {
        if (!targetText) return;
        
        indices.forEach(index => {
            if (!this.annotationsByWordIndex.has(index)) {
                this.annotationsByWordIndex.set(index, []);
            }
            this.annotationsByWordIndex.get(index)?.push({text: targetText, type});
        });
        
        indices.forEach(index => {
            const span = this.contentContainer.querySelector(`span[data-word-index="${index}"]`);
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
        
        const existingContainer = this.contentContainer.querySelector(`.idl-annotations-container[data-for-word="${wordIndex}"]`);
        
        if (existingContainer) {
            existingContainer.remove();
            return;
        }
        
        const annotations = this.annotationsByWordIndex.get(wordIndex);
        if (!annotations || annotations.length === 0) return;
        
        const container = document.createElement('div');
        container.className = 'idl-annotations-container';
        container.setAttribute('data-for-word', wordIndex.toString());
        
        annotations.forEach(({text, type}, i) => {
            const annotationEl = document.createElement('div');
            annotationEl.className = 'idl-annotation-item';
            const textEl = document.createElement('div');
            textEl.textContent = text;
            
            annotationEl.appendChild(textEl);
            container.appendChild(annotationEl);
        });
        
        element.after(container);
    }
    
    private async loadAnnotations(): Promise<void> {
        if (!this.currentFile) return;
        
        try {
            const allWordSpans = this.getAllWordSpans();
            allWordSpans.forEach(span => {
                span.classList.remove('idl-highlighted-word');
                span.removeAttribute('data-has-annotations');
                
                const newSpan = span.cloneNode(true) as HTMLElement;
                span.parentNode?.replaceChild(newSpan, span);
            });
            
            const existingContainers = this.contentContainer.querySelectorAll('.idl-annotations-container');
            existingContainers.forEach(el => el.remove());
            
            this.annotationsByWordIndex.clear();
            
            const annotations = await this.annotationService.loadAnnotations(this.currentFile.path);
            
            for (const commentId in annotations.comments) {
                const comment = annotations.comments[commentId];
                if (comment.src_txt_display_range && comment.src_txt_display_range.length > 0) {
                    this.highlightWords(comment.src_txt_display_range, comment.target_txt, 'comment');
                }
            }
            
            for (const noteId in annotations.notes) {
                const note = annotations.notes[noteId];
                if (note.src_txt_display_range && note.src_txt_display_range.length > 0) {
                    this.highlightWords(note.src_txt_display_range, note.target_txt, 'note');
                }
            }
            
        } catch (error) {
            console.error('Error loading annotations:', error);
        }
    }
    
    async onClose(): Promise<void> {
        this.contentContainer.empty();
        this.currentFile = null;
        this.originalFile = null;
        this.wordProcessor = null;
        this.comments = [];
    }
}
