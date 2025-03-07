import { WordProcessorOptions } from '../types/interfaces';

export class WordProcessor {
    private wordCount = 0;
    private articleId: string;
    private wordRegex = /(\s*)(\S+)(\s*)/g;

    constructor(options: WordProcessorOptions) {
        this.articleId = options.articleId;
    }

    processMarkdown(element: HTMLElement): void {
        const paragraphs = element.querySelectorAll('p');
        paragraphs.forEach(paragraph => {
            this.processElement(paragraph);
        });
    }

    private processElement(element: HTMLElement): void {
        const fragment = document.createDocumentFragment();
        
        Array.from(element.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent) {
                this.processTextNode(node.textContent, fragment);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                const newEl = document.createElement(el.tagName);
                
                Array.from(el.attributes).forEach(attr => {
                    newEl.setAttribute(attr.name, attr.value);
                });
                
                this.processElement(el);
                
                while (el.firstChild) {
                    newEl.appendChild(el.firstChild);
                }
                
                fragment.appendChild(newEl);
            } else {
                fragment.appendChild(node.cloneNode(true));
            }
        });
        
        element.innerHTML = '';
        element.appendChild(fragment);
    }

    private processTextNode(text: string, parent: DocumentFragment): void {
        let match;
        let lastIndex = 0;
        
        this.wordRegex.lastIndex = 0;
        
        while ((match = this.wordRegex.exec(text)) !== null) {
            const [, leadingSpace, word, trailingSpace] = match;
            
            if (leadingSpace) {
                const spaceSpan = document.createElement('span');
                spaceSpan.textContent = leadingSpace;
                parent.appendChild(spaceSpan);
            }
            
            if (word) {
                const wordSpan = document.createElement('span');
                wordSpan.setAttribute('data-article-id', this.articleId);
                wordSpan.setAttribute('data-word-index', this.wordCount.toString());
                wordSpan.setAttribute('id', `${this.articleId}-${this.wordCount}`);
                wordSpan.textContent = word;
                parent.appendChild(wordSpan);
                this.wordCount++;
            }
            
            if (trailingSpace) {
                const spaceSpan = document.createElement('span');
                spaceSpan.textContent = trailingSpace;
                parent.appendChild(spaceSpan);
            }
            
            lastIndex = this.wordRegex.lastIndex;
        }
        
        if (lastIndex < text.length) {
            const remainingSpan = document.createElement('span');
            remainingSpan.textContent = text.substring(lastIndex);
            parent.appendChild(remainingSpan);
        }
    }
}
