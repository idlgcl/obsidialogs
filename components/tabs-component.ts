import { Component } from "obsidian";

export interface TabItem {
    id: string;
    label: string;
}

export interface TabsComponentOptions {
    container: HTMLElement;
    tabs: TabItem[];
    activeTabId?: string;
    onTabChange: (tabId: string) => void;
}

export class TabsComponent extends Component {
    private container: HTMLElement;
    private tabs: TabItem[];
    private activeTabId: string;
    private onTabChange: (tabId: string) => void;
    private tabsEl: HTMLElement;
    
    constructor(options: TabsComponentOptions) {
        super();
        this.container = options.container;
        this.tabs = options.tabs;
        this.activeTabId = options.activeTabId || (this.tabs.length > 0 ? this.tabs[0].id : '');
        this.onTabChange = options.onTabChange;
        this.createTabs();
    }
    
    private createTabs(): void {
        this.tabsEl = this.container.createDiv({ cls: 'idl-tabs' });
        
        for (const tab of this.tabs) {
            const tabEl = this.tabsEl.createDiv({
                cls: `idl-tab ${tab.id === this.activeTabId ? 'idl-tab-active' : ''}`
            });
            
            tabEl.setText(tab.label);
            tabEl.dataset.tabId = tab.id;
            
            tabEl.addEventListener('click', () => {
                this.setActiveTab(tab.id);
            });
        }
    }
    
    public setActiveTab(tabId: string): void {
        if (tabId === this.activeTabId) return;
        
        this.activeTabId = tabId;
        
        const tabs = this.tabsEl.querySelectorAll('.idl-tab');
        tabs.forEach(tab => {
            if (tab instanceof HTMLElement) {
                if (tab.dataset.tabId === tabId) {
                    tab.classList.add('idl-tab-active');
                } else {
                    tab.classList.remove('idl-tab-active');
                }
            }
        });
        
        this.onTabChange(tabId);
    }
    
    public getActiveTabId(): string {
        return this.activeTabId;
    }
}
