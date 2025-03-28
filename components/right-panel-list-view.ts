import { Component } from "obsidian";

export interface SidePanelListViewOptions {
    container: HTMLElement;
    onSelectItem: () => void;
}

export class RightPanelListView extends Component {
    private container: HTMLElement;
    private contentEl: HTMLElement;
    private onSelectItem: () => void;
    
    constructor(options: SidePanelListViewOptions) {
        super();
        this.container = options.container;
        this.onSelectItem = options.onSelectItem;
        this.createView();
    }
    
    createView() {
        this.contentEl = this.container.createDiv({ cls: 'side-panel-list-view' });
        
        this.contentEl.createEl('h3', { text: 'List View' });
        
        const itemEl = this.contentEl.createDiv({ cls: 'side-panel-list-item' });
        itemEl.setText('Sample Item - Click me');
        
        itemEl.addEventListener('click', () => {
            this.onSelectItem();
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
