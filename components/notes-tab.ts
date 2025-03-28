import { Component } from "obsidian";

export interface NotesTabOptions {
    container: HTMLElement;
    onSelectNote: () => void;
}

export class NotesTab extends Component {
    private container: HTMLElement;
    private contentEl: HTMLElement;
    private onSelectNote: () => void;
    
    constructor(options: NotesTabOptions) {
        super();
        this.container = options.container;
        this.onSelectNote = options.onSelectNote;
        this.createView();
    }
    
    private createView(): void {
        this.contentEl = this.container.createDiv({ cls: 'idl-notes-tab' });
        
        const notesListEl = this.contentEl.createDiv({ cls: 'idl-notes-list' });
        
        const sampleNote = notesListEl.createDiv({ cls: 'idl-list-item' });
        sampleNote.setText('Sample Note');
        
        sampleNote.addEventListener('click', () => {
            this.onSelectNote();
        });
    }
    
    show() {
        this.contentEl.style.display = 'block';
    }
    
    hide() {
        this.contentEl.style.display = 'none';
    }
    
    onunload() {
        this.contentEl.remove();
    }
}
