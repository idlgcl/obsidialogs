import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { Comment } from 'types/interfaces';
import { ANNOTATOR_VIEW_TYPE, AnnotatorView } from './AnnotatorView';
import { AnnotationData, AnnotationService } from 'services/annotationService';

export const ANNOTATE_FORM_VIEW_TYPE = 'idl-annotate-form-view';

export interface AnnotateFormData {
    title: string;
    comment: string;
}

export class AnnotateFormView extends ItemView {
    private commentsTab: HTMLElement;
    private notesTab: HTMLElement;
    private commentsContainer: HTMLElement;
    private notesContainer: HTMLElement;
    private onSaveCallback: ((data: AnnotateFormData) => void) | null = null;
    private comments: Comment[] = [];
    private originalFile: TFile | null = null;
    private sourceFullText = '';
    private sourceRange: number[] = [];
    private sourceDisplayIndices: number[] = [];
    private annotationService: AnnotationService | null = null;
    private viewMode: 'list' | 'form' = 'list';
    private currentAnnotationType: 'comment' | 'note' = 'comment';
    private currentAnnotationId: string | null = null;
    
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.annotationService = new AnnotationService(this.app);
    }
    
    getViewType(): string {
        return ANNOTATE_FORM_VIEW_TYPE;
    }
    
    getDisplayText(): string {
        return 'Annotate';
    }
    
    getIcon(): string {
        return 'message-square';
    }

    async onOpen(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();
        
        const tabsContainer = containerEl.createDiv({ cls: 'idl-tabs-container' });
        
        this.commentsTab = tabsContainer.createDiv({ 
            cls: 'idl-tab idl-tab-active',
            text: 'Comments'
        });
        
        this.notesTab = tabsContainer.createDiv({ 
            cls: 'idl-tab',
            text: 'Notes'
        });
        
        this.commentsContainer = containerEl.createDiv({ cls: 'idl-tab-content idl-tab-content-active' });
        this.notesContainer = containerEl.createDiv({ cls: 'idl-tab-content' });
        
        this.commentsTab.addEventListener('click', () => {
            this.selectTab('comment');
            this.viewMode = 'list';
            this.renderView();
        });
        
        this.notesTab.addEventListener('click', () => {
            this.selectTab('note');
            this.viewMode = 'list';
            this.renderView();
        });
        
        this.renderView();
    }
    
    private selectTab(tabName: 'comment' | 'note'): void {
        this.commentsTab.removeClass('idl-tab-active');
        this.notesTab.removeClass('idl-tab-active');
        this.commentsContainer.removeClass('idl-tab-content-active');
        this.notesContainer.removeClass('idl-tab-content-active');
        
        this.currentAnnotationType = tabName;
        
        if (tabName === 'comment') {
            this.commentsTab.addClass('idl-tab-active');
            this.commentsContainer.addClass('idl-tab-content-active');
        } else {
            this.notesTab.addClass('idl-tab-active');
            this.notesContainer.addClass('idl-tab-content-active');
        }
    }
    
    private async renderView(): Promise<void> {
        if (!this.originalFile) return;
        
        this.commentsContainer.empty();
        this.notesContainer.empty();
        
        if (this.viewMode === 'list') {
            await this.renderAnnotationsList();
        } else {
            if (this.currentAnnotationType === 'comment') {
                this.setupCommentsForm();
                if (this.currentAnnotationId) {
                    await this.loadAnnotationIntoForm(this.currentAnnotationId, 'comment');
                }
            } else {
                this.setupNotesForm();
                if (this.currentAnnotationId) {
                    await this.loadAnnotationIntoForm(this.currentAnnotationId, 'note');
                }
            }
        }
    }
    
    private async renderAnnotationsList(): Promise<void> {
        if (!this.originalFile || !this.annotationService) return;
        
        const annotations = await this.annotationService.loadAnnotations(this.originalFile.path);
        
        const commentsListContainer = this.commentsContainer.createDiv({ cls: 'idl-annotations-list' });
        
        if (Object.keys(annotations.comments).length === 0) {
            commentsListContainer.createEl('p', { text: 'No comments found', cls: 'idl-no-annotations' });
        } else {
            for (const id in annotations.comments) {
                const comment = annotations.comments[id];
                const item = commentsListContainer.createDiv({ cls: 'idl-annotation-list-item' });
                
                const link = item.createEl('a', { 
                    text: comment.src_txt_display,
                    cls: 'idl-annotation-link' 
                });
                
                link.addEventListener('click', () => {
                    this.viewMode = 'form';
                    this.currentAnnotationId = id;
                    this.currentAnnotationType = 'comment';
                    this.renderView();
                });
            }
        }
        
        const commentButtons = this.commentsContainer.createDiv({ cls: 'idl-annotation-buttons' });
        const newCommentButton = commentButtons.createEl('button', { 
            text: 'New Comment', 
            cls: 'idl-button' 
        });
        
        newCommentButton.addEventListener('click', () => {
            this.viewMode = 'form';
            this.currentAnnotationId = null;
            this.currentAnnotationType = 'comment';
            this.renderView();
        });
        
        const notesListContainer = this.notesContainer.createDiv({ cls: 'idl-annotations-list' });
        
        if (Object.keys(annotations.notes).length === 0) {
            notesListContainer.createEl('p', { text: 'No notes found', cls: 'idl-no-annotations' });
        } else {
            for (const id in annotations.notes) {
                const note = annotations.notes[id];
                const item = notesListContainer.createDiv({ cls: 'idl-annotation-list-item' });
                
                const link = item.createEl('a', { 
                    text: note.src_txt_display,
                    cls: 'idl-annotation-link' 
                });
                
                link.addEventListener('click', () => {
                    this.viewMode = 'form';
                    this.currentAnnotationId = id;
                    this.currentAnnotationType = 'note';
                    this.renderView();
                });
            }
        }
        
        const noteButtons = this.notesContainer.createDiv({ cls: 'idl-annotation-buttons' });
        const newNoteButton = noteButtons.createEl('button', { 
            text: 'New Note', 
            cls: 'idl-button' 
        });
        
        newNoteButton.addEventListener('click', () => {
            this.viewMode = 'form';
            this.currentAnnotationId = null;
            this.currentAnnotationType = 'note';
            this.renderView();
        });
    }
    
    private async loadAnnotationIntoForm(id: string, type: 'comment' | 'note'): Promise<void> {
        if (!this.originalFile || !this.annotationService) return;
        
        try {
            const annotations = await this.annotationService.loadAnnotations(this.originalFile.path);
            const annotation = type === 'comment' ? annotations.comments[id] : annotations.notes[id];
            
            if (!annotation) return;
            
            if (type === 'comment') {
                const commentSelect = this.commentsContainer.querySelector('.idl-comment-select') as HTMLSelectElement;
                const bodyTextarea = this.commentsContainer.querySelector('.idl-comment-body') as HTMLTextAreaElement;
                const targetSelect = this.commentsContainer.querySelector('select[name="target"]') as HTMLSelectElement;
                const displayInput = this.commentsContainer.querySelector('input[name="display"]') as HTMLInputElement;
                const startInput = this.commentsContainer.querySelector('input[name="start"]') as HTMLInputElement;
                const endInput = this.commentsContainer.querySelector('input[name="end"]') as HTMLInputElement;
                
                if (commentSelect) commentSelect.value = '';
                if (bodyTextarea) bodyTextarea.value = annotation.target_txt || '';
                if (targetSelect) targetSelect.value = annotation.target || '';
                if (displayInput) displayInput.value = annotation.target_txt_display || '';
                if (startInput) startInput.value = annotation.target_txt_start || '';
                if (endInput) endInput.value = annotation.target_txt_end || '';
                
                if (targetSelect) targetSelect.removeAttribute('disabled');
                if (displayInput) displayInput.removeAttribute('disabled');
                if (startInput) startInput.removeAttribute('disabled');
                if (endInput) endInput.removeAttribute('disabled');
                
                const saveButton = this.commentsContainer.querySelector('button[data-action="save"]') as HTMLButtonElement;
                if (saveButton) saveButton.removeAttribute('disabled');
            } else {
                const textDisplayInput = this.notesContainer.querySelector('input[name="textDisplay"]') as HTMLInputElement;
                const startInput = this.notesContainer.querySelector('input[name="start"]') as HTMLInputElement;
                const endInput = this.notesContainer.querySelector('input[name="end"]') as HTMLInputElement;
                
                if (textDisplayInput) textDisplayInput.value = annotation.src_txt_display || '';
                if (startInput) startInput.value = annotation.src_txt_start || '';
                if (endInput) endInput.value = annotation.src_txt_end || '';
                
                const targetSection = this.notesContainer.querySelector('.idl-target-section') as HTMLElement;
                const targetSelect = this.notesContainer.querySelector('select[name="target"]') as HTMLSelectElement;
                const targetDisplayInput = this.notesContainer.querySelector('input[name="targetDisplay"]') as HTMLInputElement;
                const targetStartInput = this.notesContainer.querySelector('input[name="targetStart"]') as HTMLInputElement;
                const targetEndInput = this.notesContainer.querySelector('input[name="targetEnd"]') as HTMLInputElement;
                
                if (targetSection) targetSection.style.display = 'block';
                if (targetSelect) targetSelect.value = annotation.target || '';
                if (targetDisplayInput) targetDisplayInput.value = annotation.target_txt_display || '';
                if (targetStartInput) targetStartInput.value = annotation.target_txt_start || '';
                if (targetEndInput) targetEndInput.value = annotation.target_txt_end || '';
                
                const switchButton = this.notesContainer.querySelector('button[data-action="switch"]') as HTMLButtonElement;
                if (switchButton) switchButton.style.display = 'inline-block';
            }
        } catch (error) {
            console.error('Error loading annotation:', error);
        }
    }
    
    private async setupCommentsForm(): Promise<void> {
        this.commentsContainer.empty();

        const annotations = await this.annotationService?.loadAnnotations(this.originalFile?.path || '') || { comments: {}, notes: {} };
        const usedCommentRanges = Object.values(annotations.comments).map(comment => comment.src_txt_display_range);

        const backButtonContainer = this.commentsContainer.createDiv({ cls: 'idl-back-button-container' });
        const backButton = backButtonContainer.createEl('button', {
            text: 'Back to List',
            cls: 'idl-button idl-back-button'
        });
        
        backButton.addEventListener('click', () => {
            this.viewMode = 'list';
            this.renderView();
        });
        
        const commentSelectField = this.commentsContainer.createDiv({ cls: 'idl-form-field' });
        commentSelectField.createEl('label', { text: 'Select Comment' });
        const commentSelect = commentSelectField.createEl('select', { cls: 'idl-comment-select' });

        commentSelect.createEl('option', {
            text: 'Select Comment',
            attr: { value: '', selected: 'selected' }
        });

        const unusedComments = this.comments.filter(comment => {
            const titleWordCount = comment.title.split(/\s+/).filter(w => w.length > 0).length;
            const titleIndices = comment.indices.slice(0, titleWordCount);
            
            return !usedCommentRanges.some(range => 
                range && titleIndices.length === range.length && 
                range.every((val, idx) => val === titleIndices[idx])
            );
        });
        
        unusedComments.forEach((comment, index) => {
            commentSelect.createEl('option', {
                text: comment.title,
                attr: { value: index.toString() }
            });
        });

        
        const bodyField = this.commentsContainer.createDiv({ cls: 'idl-form-field' });
        bodyField.createEl('label', { text: 'Comment Body' });
        const bodyTextarea = bodyField.createEl('textarea', { 
            cls: 'idl-comment-body',
            attr: { rows: '4', readonly: 'true', name: 'body' }
        });
        
        const targetField = this.commentsContainer.createDiv({ cls: 'idl-form-field' });
        targetField.createEl('label', { text: 'Target Article' });
        const targetSelect = targetField.createEl('select', { attr: {'disabled': 'true', name: 'target'}});
        
        targetSelect.createEl('option', {
            text: 'Select Article',
            attr: { value: '' }
        });

        const mdFiles = this.app.vault.getMarkdownFiles();
        mdFiles.forEach(file => {
            targetSelect.createEl('option', {
                text: file.basename,
                attr: { value: file.path }
            });
        });

        const displayField = this.commentsContainer.createDiv({ cls: 'idl-form-field' });
        displayField.createEl('label', { text: 'Text Display' });
        const displayInput = displayField.createEl('input', { 
            type: 'text',
            attr: { disabled: 'true', name: 'display' }
        });
        
        const rangeField = this.commentsContainer.createDiv({ cls: 'idl-form-field idl-range-field' });
        
        const startField = rangeField.createDiv({ cls: 'idl-start-field' });
        startField.createEl('label', { text: 'Text Start' });
        const startInput = startField.createEl('input', { 
            type: 'text',
            attr: { disabled: 'true', name: 'start' }
        });
        
        const endField = rangeField.createDiv({ cls: 'idl-end-field' });
        endField.createEl('label', { text: 'Text End' });
        const endInput = endField.createEl('input', { 
            type: 'text',
            attr: { disabled: 'true', name: 'end' }
        });
        
        const buttonContainer = this.commentsContainer.createDiv({ cls: 'idl-form-buttons' });
        const switchButton = buttonContainer.createEl('button', { 
            text: 'Switch Article', 
            cls: 'idl-button',
            attr: { disabled: 'true', 'data-action': 'switch' }
        });
        
        const saveButton = buttonContainer.createEl('button', { 
            text: 'Save', 
            cls: 'idl-button',
            attr: { disabled: 'true', 'data-action': 'save' }
        });
       
        commentSelect.addEventListener('change', (e) => {
            const select = e.target as HTMLSelectElement;
            const value = select.value;
            
            if (value === '') {
                bodyTextarea.value = '';
                targetSelect.setAttribute('disabled', 'true');
                displayInput.setAttribute('disabled', 'true');
                startInput.setAttribute('disabled', 'true');
                endInput.setAttribute('disabled', 'true');
                saveButton.setAttribute('disabled', 'true');
            } else {
                const index = parseInt(value);
                if (!isNaN(index) && index >= 0 && this.comments[index]) {
                    bodyTextarea.value = this.comments[index].body;
                    
                    targetSelect.removeAttribute('disabled');
                    displayInput.removeAttribute('disabled');
                    startInput.removeAttribute('disabled');
                    endInput.removeAttribute('disabled');
                    saveButton.removeAttribute('disabled');
                }
            }
        });

        targetSelect.addEventListener('change', async (e) => {
            const select = e.target as HTMLSelectElement;
            const value = select.value;
            
            if (value === '') {
                bodyTextarea.value = '';
                targetSelect.setAttribute('disabled', 'true');
                displayInput.setAttribute('disabled', 'true');
                startInput.setAttribute('disabled', 'true');
                endInput.setAttribute('disabled', 'true');
                saveButton.setAttribute('disabled', 'true');
                switchButton.setAttribute('disabled', 'true');
            } else {
                const index = parseInt(value);
                if (!isNaN(index) && index >= 0 && this.comments[index]) {
                    bodyTextarea.value = this.comments[index].body;
                    
                    targetSelect.removeAttribute('disabled');
                    displayInput.removeAttribute('disabled');
                    startInput.removeAttribute('disabled');
                    endInput.removeAttribute('disabled');
                    saveButton.removeAttribute('disabled');
                    switchButton.setAttribute('disabled', 'true');
                } else {
                    const file = this.app.vault.getAbstractFileByPath(value);
                    if (file instanceof TFile) {
                        const annotatorLeaves = this.app.workspace.getLeavesOfType(ANNOTATOR_VIEW_TYPE);
                        if (annotatorLeaves.length > 0) {
                            const annotatorView = annotatorLeaves[0].view as AnnotatorView;
                            await annotatorView.setFile(file);
                            switchButton.removeAttribute('disabled');
                        }
                    }
                }
            }
        });

        switchButton.addEventListener('click', async () => {
            const annotatorLeaves = this.app.workspace.getLeavesOfType(ANNOTATOR_VIEW_TYPE);
            if (annotatorLeaves.length > 0) {
                const annotatorView = annotatorLeaves[0].view as AnnotatorView;
                
                if (this.originalFile && annotatorView.getCurrentFile()?.path !== this.originalFile.path) {
                    await annotatorView.setFile(this.originalFile);
                    switchButton.setText('View Target');
                } else {
                    const targetPath = targetSelect.value;
                    const targetFile = this.app.vault.getAbstractFileByPath(targetPath);
                    if (targetFile instanceof TFile) {
                        await annotatorView.setFile(targetFile);
                        switchButton.setText('View Original');
                    }
                }
            }
        });

        saveButton.addEventListener('click', async () => {
            const commentSelectValue = commentSelect.value;
            const targetPath = targetSelect.value;
            const startText = startInput.value.trim();
            const endText = endInput.value.trim();
            const displayText = displayInput.value.trim();
            
            if (!targetPath || !startText || !endText || !displayText) {
                return;
            }
            
            let selectedComment: Comment | null = null;
            
            if (commentSelectValue) {
                const selectedCommentIndex = parseInt(commentSelectValue);
                selectedComment = this.comments[selectedCommentIndex];
                if (!selectedComment) return;
            }
            
            const annotatorLeaves = this.app.workspace.getLeavesOfType(ANNOTATOR_VIEW_TYPE);
            if (annotatorLeaves.length === 0) return;
            
            const annotatorView = annotatorLeaves[0].view as AnnotatorView;
            
            const wordSpans = annotatorView.getAllWordSpans();
            if (!wordSpans || wordSpans.length === 0) return;
            
            const startSpans = this.findTextSpans(wordSpans, startText);
            if (startSpans.length === 0) {
                new Notice("Start text not found");
                return;
            }
            
            const endSpans = this.findTextSpans(wordSpans, endText);
            if (endSpans.length === 0) {
                new Notice("End text not found");
                return;
            }
            
            const startIndex = parseInt(startSpans[0].getAttribute('data-word-index') || '0');
            const endIndex = parseInt(endSpans[endSpans.length - 1].getAttribute('data-word-index') || '0');
            
            const rangeSpans = this.getSpansBetweenIndices(wordSpans, startIndex, endIndex);
            
            const fullText = this.getTextFromSpans(rangeSpans);
            
            if (!fullText.includes(displayText)) {
                new Notice("Display text not found in the selected range");
                return;
            }
            
            const targetRange = rangeSpans.map(span => 
                parseInt(span.getAttribute('data-word-index') || '0')
            );
            
            const displaySpans = this.findTextSpansInRange(rangeSpans, displayText);
            if (displaySpans.length === 0) {
                new Notice("Could not locate display text within range");
                return;
            }
            
            const displayIndices = displaySpans.map(span => 
                parseInt(span.getAttribute('data-word-index') || '0')
            );
            
            const result: Omit<AnnotationData, 'id' | 'timestamp'> = {
                src: this.originalFile?.path || '',
                src_txt_display: selectedComment ? selectedComment.title : '',
                src_txt_start: selectedComment ? selectedComment.title : '',
                src_txt_end: selectedComment ? selectedComment.body : '',
                src_txt: selectedComment ? selectedComment.title + ' ' + selectedComment.body : '',
                src_txt_display_range: selectedComment ? 
                    selectedComment.indices.slice(0, selectedComment.title.split(' ').length) : [],
                src_range: selectedComment ? selectedComment.indices : [],
                target: targetPath,
                target_txt_display: displayText,
                target_txt_start: startText,
                target_txt_end: endText,
                target_txt: fullText,
                target_range: targetRange,
                target_txt_display_range: displayIndices
            };
            
            if (this.annotationService) {
                try {
                    if (this.currentAnnotationId) {
                        await this.annotationService.deleteAnnotation(
                            this.originalFile?.path || '', 
                            this.currentAnnotationId, 
                            'comment'
                        );
                    }
                    
                    const id = await this.annotationService.saveAnnotation(result, 'comment');
                    new Notice(`Comment saved with ID: ${id}`);
                    this.viewMode = 'list';
                    this.renderView();
                } catch (error) {
                    console.error('Error saving comment:', error);
                    new Notice('Failed to save comment');
                }
            }
            
            annotatorView.highlightWords(displayIndices);
        });
    }
    
    private setupNotesForm(): void {
        this.notesContainer.empty();
        
        const backButtonContainer = this.notesContainer.createDiv({ cls: 'idl-back-button-container' });
        const backButton = backButtonContainer.createEl('button', {
            text: 'Back to List',
            cls: 'idl-button idl-back-button'
        });
        
        backButton.addEventListener('click', () => {
            this.viewMode = 'list';
            this.renderView();
        });
        
        const textDisplayField = this.notesContainer.createDiv({ cls: 'idl-form-field' });
        textDisplayField.createEl('label', { text: 'Text Display' });
        const textDisplayInput = textDisplayField.createEl('input', { 
            type: 'text',
            attr: { name: 'textDisplay' }
        });
        
        const rangeField = this.notesContainer.createDiv({ cls: 'idl-form-field idl-range-field' });
        
        const startField = rangeField.createDiv({ cls: 'idl-start-field' });
        startField.createEl('label', { text: 'Text Start' });
        const startInput = startField.createEl('input', { 
            type: 'text',
            attr: { name: 'start' }
        });
        
        const endField = rangeField.createDiv({ cls: 'idl-end-field' });
        endField.createEl('label', { text: 'Text End' });
        const endInput = endField.createEl('input', { 
            type: 'text',
            attr: { name: 'end' }
        });
        
        const targetSection = this.notesContainer.createDiv({ cls: 'idl-target-section' });
        targetSection.style.display = 'none';
        
        const targetField = targetSection.createDiv({ cls: 'idl-form-field' });
        targetField.createEl('label', { text: 'Target Article' });
        const targetSelect = targetField.createEl('select', { 
            attr: { name: 'target' }
        });
        
        targetSelect.createEl('option', {
            text: 'Select Article',
            attr: { value: '' }
        });

        const mdFiles = this.app.vault.getMarkdownFiles();
        mdFiles.forEach(file => {
            targetSelect.createEl('option', {
                text: file.basename,
                attr: { value: file.path }
            });
        });
        
        const targetDisplayField = targetSection.createDiv({ cls: 'idl-form-field' });
        targetDisplayField.createEl('label', { text: 'Target Text Display' });
        const targetDisplayInput = targetDisplayField.createEl('input', { 
            type: 'text',
            attr: { name: 'targetDisplay' } 
        });
        
        const targetRangeField = targetSection.createDiv({ cls: 'idl-form-field idl-range-field' });
        
        const targetStartField = targetRangeField.createDiv({ cls: 'idl-start-field' });
        targetStartField.createEl('label', { text: 'Target Text Start' });
        const targetStartInput = targetStartField.createEl('input', { 
            type: 'text',
            attr: { name: 'targetStart' }
        });
        
        const targetEndField = targetRangeField.createDiv({ cls: 'idl-end-field' });
        targetEndField.createEl('label', { text: 'Target Text End' });
        const targetEndInput = targetEndField.createEl('input', { 
            type: 'text',
            attr: { name: 'targetEnd' }
        });
        
        const buttonContainer = this.notesContainer.createDiv({ cls: 'idl-form-buttons' });
        
        const switchButton = buttonContainer.createEl('button', { 
            text: 'Switch Article', 
            cls: 'idl-button',
            attr: { 'data-action': 'switch' }
        });
        switchButton.style.display = 'none'; 
        
        const saveButton = buttonContainer.createEl('button', { 
            text: 'Save', 
            cls: 'idl-button',
            attr: { 'data-action': 'save' }
        });
        
        saveButton.addEventListener('click', async () => {
            const textDisplay = textDisplayInput.value.trim();
            const textStart = startInput.value.trim();
            const textEnd = endInput.value.trim();
            
            const isTargetPhase = targetSection.style.display === 'block';
            
            if (isTargetPhase) {
                const targetPath = targetSelect.value;
                const targetDisplayText = targetDisplayInput.value.trim();
                const targetStartText = targetStartInput.value.trim();
                const targetEndText = targetEndInput.value.trim();
                
                if (!targetPath || !targetDisplayText || !targetStartText || !targetEndText) {
                    return;
                }
                
                const annotatorLeaves = this.app.workspace.getLeavesOfType(ANNOTATOR_VIEW_TYPE);
                if (annotatorLeaves.length === 0) return;
                
                const annotatorView = annotatorLeaves[0].view as AnnotatorView;
                const wordSpans = annotatorView.getAllWordSpans();
                
                if (!wordSpans || wordSpans.length === 0) {
                    console.log('No word spans found in target document');
                    return;
                }
                
                const targetStartSpans = this.findTextSpans(wordSpans, targetStartText);
                if (targetStartSpans.length === 0) {
                    new Notice("Target start text not found");
                    return;
                }
                
                const targetEndSpans = this.findTextSpans(wordSpans, targetEndText);
                if (targetEndSpans.length === 0) {
                    new Notice("Target end text not found");
                    return;
                }
                
                const targetStartIndex = parseInt(targetStartSpans[0].getAttribute('data-word-index') || '0');
                const targetEndIndex = parseInt(targetEndSpans[targetEndSpans.length - 1].getAttribute('data-word-index') || '0');
                
                const targetRangeSpans = this.getSpansBetweenIndices(wordSpans, targetStartIndex, targetEndIndex);
                
                const targetFullText = this.getTextFromSpans(targetRangeSpans);
                
                if (!targetFullText.includes(targetDisplayText)) {
                    new Notice("Target display text not found in the selected range");
                    return;
                }
                
                const targetRange = targetRangeSpans.map(span => 
                    parseInt(span.getAttribute('data-word-index') || '0')
                );
                
                const targetDisplaySpans = this.findTextSpansInRange(targetRangeSpans, targetDisplayText);
                if (targetDisplaySpans.length === 0) {
                    new Notice("Could not locate target display text within range");
                    return;
                }
                
                const targetDisplayIndices = targetDisplaySpans.map(span => 
                    parseInt(span.getAttribute('data-word-index') || '0')
                );
                
                const sourcePath = this.originalFile?.path;
                
                const result: Omit<AnnotationData, 'id' | 'timestamp'> = {
                    src: sourcePath || '',
                    src_txt_display: textDisplay,
                    src_txt_start: textStart,
                    src_txt_end: textEnd, 
                    src_txt: this.sourceFullText,
                    src_range: this.sourceRange,
                    src_txt_display_range: this.sourceDisplayIndices,
                    target: targetPath,
                    target_txt_display: targetDisplayText,
                    target_txt_start: targetStartText,
                    target_txt_end: targetEndText,
                    target_txt: targetFullText,
                    target_range: targetRange,
                    target_txt_display_range: targetDisplayIndices
                };
                
                if (this.annotationService) {
                    try {
                        if (this.currentAnnotationId) {
                            await this.annotationService.deleteAnnotation(
                                this.originalFile?.path || '', 
                                this.currentAnnotationId, 
                                'note'
                            );
                        }
                        
                        const id = await this.annotationService.saveAnnotation(result, 'note');
                        new Notice(`Note saved with ID: ${id}`);
                        this.viewMode = 'list';
                        this.renderView();
                    } catch (error) {
                        console.error('Error saving note:', error);
                        new Notice('Failed to save note');
                    }
                }
                
                annotatorView.highlightWords(targetDisplayIndices);
            } else {
                if (!textDisplay || !textStart || !textEnd) {
                    return;
                }
                
                const annotatorLeaves = this.app.workspace.getLeavesOfType(ANNOTATOR_VIEW_TYPE);
                if (annotatorLeaves.length === 0) return;
                
                const annotatorView = annotatorLeaves[0].view as AnnotatorView;
                
                const wordSpans = annotatorView.getAllWordSpans();
                if (!wordSpans || wordSpans.length === 0) return;
                
                const startSpans = this.findTextSpans(wordSpans, textStart);
                if (startSpans.length === 0) {
                    new Notice("Start text not found");
                    return;
                }
                
                const endSpans = this.findTextSpans(wordSpans, textEnd);
                if (endSpans.length === 0) {
                    new Notice("End text not found");
                    return;
                }
                
                const startIndex = parseInt(startSpans[0].getAttribute('data-word-index') || '0');
                const endIndex = parseInt(endSpans[endSpans.length - 1].getAttribute('data-word-index') || '0');
                
                const rangeSpans = this.getSpansBetweenIndices(wordSpans, startIndex, endIndex);
                
                const fullText = this.getTextFromSpans(rangeSpans);
                
                if (!fullText.includes(textDisplay)) {
                    new Notice("Display text not found in the selected range");
                    return;
                }
                
                const sourceRange = rangeSpans.map(span => 
                    parseInt(span.getAttribute('data-word-index') || '0')
                );
                
                const displaySpans = this.findTextSpansInRange(rangeSpans, textDisplay);
                if (displaySpans.length === 0) {
                    new Notice("Could not locate display text within range");
                    return;
                }
                
                const displayIndices = displaySpans.map(span => 
                    parseInt(span.getAttribute('data-word-index') || '0')
                );
                
                this.sourceFullText = fullText;
                this.sourceRange = sourceRange;
                this.sourceDisplayIndices = displayIndices;
                
                annotatorView.highlightWords(displayIndices);
                
                targetSection.style.display = 'block';
                switchButton.style.display = 'inline-block';
                
                saveButton.setText('Save Annotation');
            }
        });
        
        targetSelect.addEventListener('change', async (e) => {
            const select = e.target as HTMLSelectElement;
            const targetPath = select.value;
            
            if (targetPath === '') return;
            
            const targetFile = this.app.vault.getAbstractFileByPath(targetPath);
            if (!(targetFile instanceof TFile)) return;
            
            const annotatorLeaves = this.app.workspace.getLeavesOfType(ANNOTATOR_VIEW_TYPE);
            if (annotatorLeaves.length === 0) return;
            
            const annotatorView = annotatorLeaves[0].view as AnnotatorView;
            await annotatorView.setFile(targetFile);
            
            switchButton.setText('Back to Source');
        });
        
        switchButton.addEventListener('click', async () => {
            const annotatorLeaves = this.app.workspace.getLeavesOfType(ANNOTATOR_VIEW_TYPE);
            if (annotatorLeaves.length === 0) return;
            
            const annotatorView = annotatorLeaves[0].view as AnnotatorView;
            const currentFile = annotatorView.getCurrentFile();
            
            if (!currentFile) return;
            
            if (this.originalFile && currentFile.path !== this.originalFile.path) {
                await annotatorView.setFile(this.originalFile);
                switchButton.setText('View Target');
            } else {
                const targetPath = targetSelect.value;
                if (!targetPath) return;
                
                const targetFile = this.app.vault.getAbstractFileByPath(targetPath);
                if (!(targetFile instanceof TFile)) return;
                
                await annotatorView.setFile(targetFile);
                switchButton.setText('Back to Source');
            }
        });
    }
    
    setComments(comments: Comment[]): void {
        this.comments = comments;
        this.renderView();
    }

    setOriginalFile(file: TFile): void {
        this.originalFile = file;
        this.viewMode = 'list';
        this.renderView();
    }
    
    setOnSave(callback: (data: AnnotateFormData) => void): this {
        this.onSaveCallback = callback;
        return this;
    }
    
    resetForm(): void {
        this.currentAnnotationId = null;
        this.viewMode = 'list';
        this.renderView();
    }

    findTextSpans(spans: HTMLElement[], text: string): HTMLElement[] {
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
    
    findTextSpansInRange(rangeSpans: HTMLElement[], text: string): HTMLElement[] {
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
    
    getTextFromSpans(spans: HTMLElement[]): string {
        return spans.map(span => span.textContent).join(' ');
    }
    
    getSpansBetweenIndices(allSpans: HTMLElement[], startIndex: number, endIndex: number): HTMLElement[] {
        return allSpans.filter(span => {
            const indexAttr = parseInt(span.getAttribute('data-word-index') || '-1');
            return indexAttr >= startIndex && indexAttr <= endIndex;
        }).sort((a, b) => {
            const indexA = parseInt(a.getAttribute('data-word-index') || '0');
            const indexB = parseInt(b.getAttribute('data-word-index') || '0');
            return indexA - indexB;
        });
    }
    
    async onClose(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();
        this.onSaveCallback = null;
        this.comments = []
        this.originalFile = null;
    }
}
