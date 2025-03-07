import { App, MarkdownView, TFile } from 'obsidian';

export function setViewToReadOnly(app: App, file: TFile): void {
    setTimeout(() => {
        const leaves = app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            const view = leaf.view;
            if (view instanceof MarkdownView && 
                view.file && 
                view.file.path === file.path) {
                
                if (view.getMode() !== 'preview') {
                    // @ts-ignore
                    app.commands.executeCommandById('markdown:toggle-preview');
                }
            }
        }
    }, 100);
}

export function setViewToEditMode(app: App, file: TFile): void {
    setTimeout(() => {
        const leaves = app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            const view = leaf.view;
            if (view instanceof MarkdownView && 
                view.file && 
                view.file.path === file.path) {
                
                if (view.getMode() !== 'source') {
                    // @ts-ignore
                    app.commands.executeCommandById('markdown:toggle-preview');
                }
            }
        }
    }, 100);
}

export function isIdealogsFile(file: TFile): boolean {
    const patterns = ['Ix', '0x', 'Tx', 'Fx'];
    return patterns.some(pattern => file.basename.startsWith(pattern));
}
