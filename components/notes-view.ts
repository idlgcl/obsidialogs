import { ItemView, WorkspaceLeaf, Component } from 'obsidian';
import { ARTICLE_VIEW_TYPE, ArticleView } from './article-view';

export const NOTES_VIEW_TYPE = 'idealogs-notes-view';

export class NotesView extends ItemView {
    private notesContentEl: HTMLElement;
    private formContainer: HTMLElement;
    private articleId: string;
    private component: Component;

    private textStart: HTMLInputElement;
    private textEnd: HTMLInputElement;
    private textDisplay: HTMLInputElement;
    private targetArticle: HTMLInputElement;
    private targetTextStart: HTMLInputElement;
    private targetTextEnd: HTMLInputElement;
    private targetTextDisplay: HTMLInputElement;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.articleId = '';
        this.component = new Component();
        this.notesContentEl = this.contentEl.createDiv({ cls: 'idealogs-notes-content' });
    }
    
    async setState(state: any, result: any): Promise<void> {
        if (state && state.articleId) {
            this.articleId = state.articleId;
            this.notesContentEl.empty();
            
            this.notesContentEl.createEl('h3', { text: 'Add Note' });
            
            this.createForm();
        }
    }

    private createForm(): void {
        this.formContainer = this.notesContentEl.createDiv({ cls: 'idl-notes-form' });
        
        const textDisplayField = this.formContainer.createDiv({ cls: 'idl-form-field' });
        textDisplayField.createEl('label', { text: 'Text Display' });
        this.textDisplay = textDisplayField.createEl('input', { 
            type: 'text'
        });
        
        const srcRangeFields = this.formContainer.createDiv({ cls: 'idl-form-field idl-range-field' });
        
        const startField = srcRangeFields.createDiv({ cls: 'idl-start-field' });
        startField.createEl('label', { text: 'Text Start' });
        this.textStart = startField.createEl('input', { 
            type: 'text'
        });
        
        const endField = srcRangeFields.createDiv({ cls: 'idl-end-field' });
        endField.createEl('label', { text: 'Text End' });
        this.textEnd = endField.createEl('input', { 
            type: 'text'
        });

        const targetArticleField = this.formContainer.createDiv({ cls: 'idl-form-field' });
        targetArticleField.createEl('label', { text: 'Target Article' });
        this.targetArticle = targetArticleField.createEl('input', { 
            type: 'text',
            attr: { disabled: true }
        });
        this.targetArticle.value = this.articleId;

        const targetDisplayField = this.formContainer.createDiv({ cls: 'idl-form-field' });
        targetDisplayField.createEl('label', { text: 'Target Text Display' });
        this.targetTextDisplay = targetDisplayField.createEl('input', { 
            type: 'text'
        });

        const targetSrcRangeFields = this.formContainer.createDiv({ cls: 'idl-form-field idl-range-field' });
         
        const targetStartField = targetSrcRangeFields.createDiv({ cls: 'idl-start-field' });
        targetStartField.createEl('label', { text: 'Text Start' });
        this.targetTextStart = targetStartField.createEl('input', { 
            type: 'text'
        });
        
        const targetEndField = targetSrcRangeFields.createDiv({ cls: 'idl-end-field' });
        targetEndField.createEl('label', { text: 'Text End' });
        this.targetTextEnd = targetEndField.createEl('input', { 
            type: 'text'
        });

        const saveButtonContainer = this.formContainer.createDiv({ cls: 'idl-btns' });
        const saveButton = saveButtonContainer.createEl('button', { text: 'Save' });
        saveButton.addEventListener('click', () => this.handleSave());
    }
    
    private async findTargetText(text: string, type: 'start' | 'end'): Promise<void> {
        if (!text.trim()) return;
        

        const articleLeaves = this.app.workspace.getLeavesOfType(ARTICLE_VIEW_TYPE);
        if (articleLeaves.length === 0) return;
        
        const articleView = articleLeaves[0].view as ArticleView;
        const wordSpans = this.getAllWordSpansFromArticleView(articleView);
        
        if (!wordSpans || wordSpans.length === 0) return;
        
        const textSpans = this.findTextSpans(wordSpans, text);
        if (textSpans.length === 0) return;
        
        if (type === 'start') {
            if (this.targetTextDisplay.value.trim() === '') {
                this.targetTextDisplay.value = text;
            }
        }
        
        this.highlightWords(textSpans, articleView);
    }
    
    private getAllWordSpansFromArticleView(articleView: ArticleView): HTMLElement[] {
        const contentEl = articleView.contentEl;
        if (!contentEl) return [];
        
        const articleContentEl = contentEl.querySelector('.idealogs-article-content');
        if (!articleContentEl) return [];
        
        const spans = articleContentEl.querySelectorAll('span[data-word-index]');
        return Array.from(spans) as HTMLElement[];
    }
    
    private findTextSpans(spans: HTMLElement[], text: string): HTMLElement[] {
        const words = text.split(/\s+/).filter(w => w.length > 0);
        if (words.length === 0) return [];
        
        if (words.length === 1) {
            return spans.filter(span => span.textContent === words[0]);
        }
        
        const result: HTMLElement[] = [];
        let currentSequence: HTMLElement[] = [];
        
        for (let i = 0; i < spans.length; i++) {
            if (spans[i].textContent === words[currentSequence.length]) {
                currentSequence.push(spans[i]);
                
                if (currentSequence.length === words.length) {
                    result.push(...currentSequence);
                    currentSequence = [];
                }
            } else {
                if (spans[i].textContent === words[0]) {
                    currentSequence = [spans[i]];
                } else {
                    currentSequence = [];
                }
            }
        }
        
        return result;
    }
    
    private findTextSpansInRange(rangeSpans: HTMLElement[], text: string): HTMLElement[] {
        const words = text.split(/\s+/).filter(w => w.length > 0);
        if (words.length === 0) return [];
        
        if (words.length === 1) {
            return rangeSpans.filter(span => span.textContent === words[0]);
        }
        
        const result: HTMLElement[] = [];
        
        for (let i = 0; i <= rangeSpans.length - words.length; i++) {
            let found = true;
            const sequence: HTMLElement[] = [];
            
            for (let j = 0; j < words.length; j++) {
                if (rangeSpans[i + j].textContent !== words[j]) {
                    found = false;
                    break;
                }
                sequence.push(rangeSpans[i + j]);
            }
            
            if (found) {
                result.push(...sequence);
                break; 
            }
        }
        
        return result;
    }
    
    private getTextFromSpans(spans: HTMLElement[]): string {
        return spans.map(span => span.textContent).join(' ');
    }
    
    private getSpansBetweenIndices(allSpans: HTMLElement[], startIndex: number, endIndex: number): HTMLElement[] {
        return allSpans.filter(span => {
            const indexAttr = parseInt(span.getAttribute('data-word-index') || '-1');
            return indexAttr >= startIndex && indexAttr <= endIndex;
        }).sort((a, b) => {
            const indexA = parseInt(a.getAttribute('data-word-index') || '0');
            const indexB = parseInt(b.getAttribute('data-word-index') || '0');
            return indexA - indexB;
        });
    }
    
    private highlightWords(spans: HTMLElement[], articleView: ArticleView): void {
        const allSpans = this.getAllWordSpansFromArticleView(articleView);
        allSpans.forEach(span => {
            span.classList.remove('idl-highlighted-word');
        });
        
        spans.forEach(span => {
            span.classList.add('idl-highlighted-word');
        });
    }
    
    private handleSave(): void {
        const articleLeaves = this.app.workspace.getLeavesOfType(ARTICLE_VIEW_TYPE);
        if (articleLeaves.length === 0) return;
        
        const articleView = articleLeaves[0].view as ArticleView;
        const wordSpans = this.getAllWordSpansFromArticleView(articleView);
        
        if (!wordSpans || wordSpans.length === 0) return;
        
        const textStart = this.textStart.value.trim();
        const textEnd = this.textEnd.value.trim();
        const textDisplay = this.textDisplay.value.trim();
        
        if (!textStart || !textEnd || !textDisplay) {
            console.error('Missing required fields');
            return;
        }
        
        const targetArticlePath = this.targetArticle.value.trim();
        const targetTextStart = this.targetTextStart.value.trim();
        const targetTextEnd = this.targetTextEnd.value.trim();
        const targetTextDisplay = this.targetTextDisplay.value.trim();
        let targetStartIndex;
        let targetEndIndex;
        let targetFullText;
        let targetRangeIndices;
        let targetDisplayIndices;
        
        if (targetTextStart && targetTextEnd && targetTextDisplay) {
            this.findTargetText(targetTextStart, 'start');
            this.findTargetText(targetTextEnd, 'end');
            
            const targetStartSpans = this.findTextSpans(wordSpans, targetTextStart);
            const targetEndSpans = this.findTextSpans(wordSpans, targetTextEnd);
            
            if (targetStartSpans.length === 0 || targetEndSpans.length === 0) {
                console.error('Could not find target text ranges');
                return;
            }
            
            targetStartIndex = parseInt(targetStartSpans[0].getAttribute('data-word-index') || '0');
            targetEndIndex = parseInt(targetEndSpans[targetEndSpans.length - 1].getAttribute('data-word-index') || '0');
            
            const targetRangeSpans = this.getSpansBetweenIndices(wordSpans, targetStartIndex, targetEndIndex);
            
            targetFullText = this.getTextFromSpans(targetRangeSpans);
            
            if (!targetFullText.includes(targetTextDisplay)) {
                console.error('Target display text not found in the selected range');
                return;
            }
            
            const targetDisplaySpans = this.findTextSpansInRange(targetRangeSpans, targetTextDisplay);
            
            if (targetDisplaySpans.length === 0) {
                console.error('Could not locate target display text within range');
                return;
            }

            targetRangeIndices = targetRangeSpans.map(span => 
                parseInt(span.getAttribute('data-word-index') || '0')
            );
            targetDisplayIndices = targetDisplaySpans.map(span => 
                parseInt(span.getAttribute('data-word-index') || '0')
            );
            
            this.highlightWords(targetDisplaySpans, articleView);
        }
        
        console.log('Form saved with values:', {
            textStart,
            textEnd,
            textDisplay,
            targetArticle: targetArticlePath,
            targetTextStart,
            targetTextEnd,
            targetTextDisplay,
            targetStartIndex,
            targetEndIndex,
            targetFullText,
            targetRangeIndices,
            targetDisplayIndices,
        });
    }

    getViewType(): string {
        return NOTES_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Article Notes';
    }

    async onClose() {
        this.component.unload();
        return super.onClose();
    }
}
