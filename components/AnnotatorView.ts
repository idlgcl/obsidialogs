import { 
    ItemView, 
    WorkspaceLeaf, 
    TFile,
    MarkdownRenderer,
} from 'obsidian';
import { WordProcessor } from './WordProcessor';
import { ANNOTATE_FORM_VIEW_TYPE } from './AnnotateForm';
import { Comment } from 'types/interfaces';

export const ANNOTATOR_VIEW_TYPE = 'idl-annotator-view';

export class AnnotatorView extends ItemView {
    private contentContainer: HTMLElement;
    private wordProcessor: WordProcessor | null = null;
    private currentFile: TFile | null = null;
    private comments: Comment[] = [];
    
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
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
        
        const openFormButton = toolbar.createEl('button', {
            text: 'Annotate',
            cls: 'idl-open-form-button'
        });
        
        openFormButton.addEventListener('click', () => {
            const existingFormLeaves = this.app.workspace.getLeavesOfType(ANNOTATE_FORM_VIEW_TYPE);
            
            if (existingFormLeaves.length > 0) {
                this.app.workspace.revealLeaf(existingFormLeaves[0]);
            } else {
                const rightLeaf = this.app.workspace.getRightLeaf(false) || 
                                 this.app.workspace.getLeaf('split', 'vertical');
                
                if (rightLeaf) {
                    rightLeaf.setViewState({
                        type: ANNOTATE_FORM_VIEW_TYPE,
                        active: true
                    });
                    
                    this.app.workspace.revealLeaf(rightLeaf);
                }
            }
        });
        
        this.contentContainer = containerEl.createDiv({
            cls: 'idl-annotator-content-container'
        });
        
        if (!this.currentFile) {
            this.contentContainer.createEl('div', {
                text: 'Open in Idealogs Annotator',
                cls: 'idl-annotator-placeholder'
            });
        }
    }
    
    async setFile(file: TFile): Promise<void> {
        this.currentFile = file;
        
        this.wordProcessor = new WordProcessor({
            articleId: file.basename
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
    
    async onClose(): Promise<void> {
        this.contentContainer.empty();
        this.currentFile = null;
        this.wordProcessor = null;
        this.comments = [];
    }
}
