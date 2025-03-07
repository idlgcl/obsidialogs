import { App, TFile } from 'obsidian';

export async function idlFileIfExists(app: App, file: TFile | null): Promise<void> {
    if (!file) return;
    
    try {
        await app.fileManager.trashFile(file);
    } catch (error) {
        console.error('Error deleting file:', error);
    }
}
