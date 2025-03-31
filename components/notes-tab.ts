import { Component } from "obsidian";

export interface NotesTabOptions {
    container: HTMLElement;
    onSelectNote: () => void;
    onNewNote: () => void;
}

export class NotesTab extends Component {
    private container: HTMLElement;
    private contentEl: HTMLElement;
    private onSelectNote: () => void;
    private onNewNote: () => void;
    
    constructor(options: NotesTabOptions) {
        super();
        this.container = options.container;
        this.onSelectNote = options.onSelectNote;
        this.onNewNote = options.onNewNote;
        this.createView();
    }
    
    private createView(): void {
        this.contentEl = this.container.createDiv({ cls: 'idl-notes-tab' });
        
        const notesListEl = this.contentEl.createDiv({ cls: 'idl-notes-list' });
        
        const newNoteBtn = notesListEl.createDiv({ cls: 'idl-new-note-btn' });
        newNoteBtn.setText('New Note');
        
        newNoteBtn.addEventListener('click', () => {
            this.onNewNote();
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
