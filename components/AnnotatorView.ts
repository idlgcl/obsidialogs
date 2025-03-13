import { 
    ItemView, 
    WorkspaceLeaf, 
    TFile,
    MarkdownRenderer,
} from 'obsidian';
import { WordProcessor } from './WordProcessor';
import { ANNOTATE_FORM_VIEW_TYPE, AnnotateFormView } from './AnnotateForm';
import { Comment } from 'types/interfaces';

export const ANNOTATOR_VIEW_TYPE = 'idl-annotator-view';

export class AnnotatorView extends ItemView {
    private contentContainer: HTMLElement;
    private wordProcessor: WordProcessor | null = null;
    private currentFile: TFile | null = null;
    private comments: Comment[] = [];
    private originalFile: TFile | null = null;
    private mode: 'display' | 'annotate' = 'display';
    private annotateButton: HTMLElement | null = null;
    
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
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
        
        // In display mode, always use original file
        if (this.mode === 'display') {
            this.currentFile = this.originalFile;
        } else {
            this.currentFile = file;
        }
        
        this.wordProcessor = new WordProcessor({
            articleId: this.currentFile.basename
        });
        
        await this.loadContent();
    }
    
    async loadContent(): Promise<void> {
        if (!this.currentFile) return;
        
        this.contentContainer.empty();
        
        const content = await this.app.vault.read(this.currentFile);
        
        this.comments = this.parseComments(content);
        
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
        }
        
        this.setupLinkClickHandlers(renderContainer);
    }
    
    private parseComments(text: string): Comment[] {
        const segments = text.split('\n');
        const pattern = /^(.*?)\.\s+(.*)$/;
        const results: Comment[] = [];
        let counter = 0;

        for (const segment of segments) {
            if (segment.startsWith('## ')) {
                continue;
            }

            if (!segment.endsWith(':')) {
                const words = segment.split(/\s+/).filter(w => w.length > 0);
                counter += words.length;
                continue;
            }

            const match = segment.match(pattern);
            
            if (!match) {
                const words = segment.split(/\s+/).filter(w => w.length > 0);
                counter += words.length;
                continue;
            }

            const indices = [];
            const [, title, description] = match;

            const words = (title + ' ' + description).split(/\s+/).filter(w => w.length > 0);
            for (let i = 0; i < words.length; i++) {
                indices.push(counter);
                counter++;
            }

            results.push({
                title: title.trim() + '.',
                body: description.trim(),
                indices: indices,
            });
        }

        return results;
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
    
    highlightWords(indices: number[]): void {
        const allWordSpans = this.getAllWordSpans();
        allWordSpans.forEach(span => {
            span.classList.remove('idl-highlighted-word');
        });
        
        indices.forEach(index => {
            const span = this.contentContainer.querySelector(`span[data-word-index="${index}"]`);
            if (span) {
                span.classList.add('idl-highlighted-word');
            }
        });
    }
    
    async onClose(): Promise<void> {
        this.contentContainer.empty();
        this.currentFile = null;
        this.originalFile = null;
        this.wordProcessor = null;
        this.comments = [];
    }
}
