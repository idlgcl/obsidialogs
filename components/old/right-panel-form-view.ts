import { Component } from "obsidian";

export interface SidePanelFormViewOptions {
    container: HTMLElement;
    onBack: () => void;
}

export class RightPanelFormView extends Component {
    private container: HTMLElement;
    private contentEl: HTMLElement;
    private onBack: () => void;
    
    constructor(options: SidePanelFormViewOptions) {
        super();
        this.container = options.container;
        this.onBack = options.onBack;
        this.createView();
    }
    
    createView() {
        this.contentEl = this.container.createDiv({ cls: 'side-panel-form-view' });
        
        const headerContainer = this.contentEl.createDiv({ cls: 'form-header' });
        
        const backButton = headerContainer.createEl('button', { text: 'Back to List' });
        backButton.addEventListener('click', () => this.onBack());
        
        headerContainer.createEl('h3', { text: 'Form View' });
        
        this.contentEl.createEl('p', { text: 'Form content will go here' });
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
