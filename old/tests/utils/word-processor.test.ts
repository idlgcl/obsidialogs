import { WordProcessor } from "../../utils/word-processor";

describe("WordProcessor", () => {
    let wordProcessor: WordProcessor;
    let container: HTMLElement;

    beforeEach(() => {
        wordProcessor = new WordProcessor({ articleId: "Tx123" });
        container = document.createElement("div");
    });

    describe("processMarkdown", () => {
        it("should process paragraphs and wrap words in spans", () => {
            const paragraph = document.createElement("p");
            paragraph.textContent = "Hello world";
            container.appendChild(paragraph);

            wordProcessor.processMarkdown(container);

            const spans = paragraph.querySelectorAll("span[data-word-index]");
            expect(spans.length).toBe(2);
            expect(spans[0].textContent).toBe("Hello");
            expect(spans[1].textContent).toBe("world");
        });

        it("should add data attributes to word spans", () => {
            const paragraph = document.createElement("p");
            paragraph.textContent = "Test";
            container.appendChild(paragraph);

            wordProcessor.processMarkdown(container);

            const span = paragraph.querySelector("span[data-word-index]");
            expect(span?.getAttribute("data-article-id")).toBe("Tx123");
            expect(span?.getAttribute("data-word-index")).toBe("0");
            expect(span?.getAttribute("id")).toBe("Tx123-0");
        });

        it("should increment word indices", () => {
            const paragraph = document.createElement("p");
            paragraph.textContent = "One Two Three";
            container.appendChild(paragraph);

            wordProcessor.processMarkdown(container);

            const spans = paragraph.querySelectorAll("span[data-word-index]");
            expect(spans[0].getAttribute("data-word-index")).toBe("0");
            expect(spans[1].getAttribute("data-word-index")).toBe("1");
            expect(spans[2].getAttribute("data-word-index")).toBe("2");
        });

        it("should handle multiple paragraphs", () => {
            const p1 = document.createElement("p");
            p1.textContent = "First paragraph";
            const p2 = document.createElement("p");
            p2.textContent = "Second paragraph";
            container.appendChild(p1);
            container.appendChild(p2);

            wordProcessor.processMarkdown(container);

            const spans1 = p1.querySelectorAll("span[data-word-index]");
            const spans2 = p2.querySelectorAll("span[data-word-index]");
            expect(spans1.length).toBe(2);
            expect(spans2.length).toBe(2);
            expect(spans1[1].getAttribute("data-word-index")).toBe("1");
            expect(spans2[0].getAttribute("data-word-index")).toBe("2");
        });

        it("should preserve whitespace in separate spans", () => {
            const paragraph = document.createElement("p");
            paragraph.textContent = "Hello   world";
            container.appendChild(paragraph);

            wordProcessor.processMarkdown(container);

            const allSpans = paragraph.querySelectorAll("span");
            expect(allSpans.length).toBeGreaterThan(2); // Words + whitespace spans
        });

        it("should handle empty paragraphs", () => {
            const paragraph = document.createElement("p");
            paragraph.textContent = "";
            container.appendChild(paragraph);

            wordProcessor.processMarkdown(container);

            const spans = paragraph.querySelectorAll("span[data-word-index]");
            expect(spans.length).toBe(0);
        });

        it("should not process anchor tags", () => {
            const paragraph = document.createElement("p");
            const link = document.createElement("a");
            link.href = "http://example.com";
            link.textContent = "Link text";
            paragraph.appendChild(document.createTextNode("Before "));
            paragraph.appendChild(link);
            paragraph.appendChild(document.createTextNode(" After"));
            container.appendChild(paragraph);

            wordProcessor.processMarkdown(container);

            const linkElement = paragraph.querySelector("a");
            expect(linkElement).toBeTruthy();
            expect(linkElement?.textContent).toBe("Link text");

            const wordSpans = paragraph.querySelectorAll(
                "span[data-word-index]",
            );
            expect(wordSpans.length).toBe(2); // "Before" and "After"
            expect(wordSpans[0].textContent).toBe("Before");
            expect(wordSpans[1].textContent).toBe("After");
        });

        it("should handle nested elements", () => {
            const paragraph = document.createElement("p");
            const strong = document.createElement("strong");
            strong.textContent = "Bold text";
            paragraph.appendChild(document.createTextNode("Normal "));
            paragraph.appendChild(strong);
            container.appendChild(paragraph);

            wordProcessor.processMarkdown(container);

            const wordSpans = paragraph.querySelectorAll(
                "span[data-word-index]",
            );
            expect(wordSpans.length).toBe(3); // "Normal", "Bold", "text"
        });

        it("should preserve element attributes", () => {
            const paragraph = document.createElement("p");
            const span = document.createElement("span");
            span.setAttribute("class", "custom-class");
            span.textContent = "Test";
            paragraph.appendChild(span);
            container.appendChild(paragraph);

            wordProcessor.processMarkdown(container);

            const customSpan = paragraph.querySelector(".custom-class");
            expect(customSpan).toBeTruthy();
        });

        it("should handle text with punctuation", () => {
            const paragraph = document.createElement("p");
            paragraph.textContent = "Hello, world!";
            container.appendChild(paragraph);

            wordProcessor.processMarkdown(container);

            const spans = paragraph.querySelectorAll("span[data-word-index]");
            expect(spans.length).toBe(2);
            expect(spans[0].textContent).toBe("Hello,");
            expect(spans[1].textContent).toBe("world!");
        });

        it("should handle text with newlines", () => {
            const paragraph = document.createElement("p");
            paragraph.textContent = "Line one\nLine two";
            container.appendChild(paragraph);

            wordProcessor.processMarkdown(container);

            const spans = paragraph.querySelectorAll("span[data-word-index]");
            expect(spans.length).toBe(4);
        });

        it("should handle single word", () => {
            const paragraph = document.createElement("p");
            paragraph.textContent = "Word";
            container.appendChild(paragraph);

            wordProcessor.processMarkdown(container);

            const spans = paragraph.querySelectorAll("span[data-word-index]");
            expect(spans.length).toBe(1);
            expect(spans[0].textContent).toBe("Word");
            expect(spans[0].getAttribute("data-word-index")).toBe("0");
        });

        it("should handle leading whitespace", () => {
            const paragraph = document.createElement("p");
            paragraph.textContent = "   Leading";
            container.appendChild(paragraph);

            wordProcessor.processMarkdown(container);

            const wordSpan = paragraph.querySelector("span[data-word-index]");
            expect(wordSpan?.textContent).toBe("Leading");
        });

        it("should handle trailing whitespace", () => {
            const paragraph = document.createElement("p");
            paragraph.textContent = "Trailing   ";
            container.appendChild(paragraph);

            wordProcessor.processMarkdown(container);

            const wordSpan = paragraph.querySelector("span[data-word-index]");
            expect(wordSpan?.textContent).toBe("Trailing");
        });

        it("should use correct article ID for all spans", () => {
            const processor = new WordProcessor({ articleId: "Tx999" });
            const paragraph = document.createElement("p");
            paragraph.textContent = "Test words";
            container.appendChild(paragraph);

            processor.processMarkdown(container);

            const spans = paragraph.querySelectorAll("span[data-word-index]");
            spans.forEach((span) => {
                expect(span.getAttribute("data-article-id")).toBe("Tx999");
            });
        });

        it("should create unique IDs for each word", () => {
            const paragraph = document.createElement("p");
            paragraph.textContent = "Word1 Word2 Word3";
            container.appendChild(paragraph);

            wordProcessor.processMarkdown(container);

            const spans = paragraph.querySelectorAll("span[data-word-index]");
            expect(spans[0].getAttribute("id")).toBe("Tx123-0");
            expect(spans[1].getAttribute("id")).toBe("Tx123-1");
            expect(spans[2].getAttribute("id")).toBe("Tx123-2");
        });

        it("should handle complex nested structure", () => {
            const paragraph = document.createElement("p");
            const em = document.createElement("em");
            const strong = document.createElement("strong");
            strong.textContent = "Bold italic";
            em.appendChild(strong);
            paragraph.appendChild(document.createTextNode("Start "));
            paragraph.appendChild(em);
            paragraph.appendChild(document.createTextNode(" End"));
            container.appendChild(paragraph);

            wordProcessor.processMarkdown(container);

            const wordSpans = paragraph.querySelectorAll(
                "span[data-word-index]",
            );
            expect(wordSpans.length).toBe(4); // "Start", "Bold", "italic", "End"
        });

        it("should not process if no paragraphs exist", () => {
            const div = document.createElement("div");
            div.textContent = "No paragraph wrapper";
            container.appendChild(div);

            wordProcessor.processMarkdown(container);

            const spans = container.querySelectorAll("span[data-word-index]");
            expect(spans.length).toBe(0);
        });

        it("should handle paragraph with only anchor tags", () => {
            const paragraph = document.createElement("p");
            const link = document.createElement("a");
            link.href = "http://example.com";
            link.textContent = "Only link";
            paragraph.appendChild(link);
            container.appendChild(paragraph);

            wordProcessor.processMarkdown(container);

            const wordSpans = paragraph.querySelectorAll(
                "span[data-word-index]",
            );
            expect(wordSpans.length).toBe(0);
            expect(paragraph.querySelector("a")).toBeTruthy();
        });

        it("should handle mixed content nodes", () => {
            const paragraph = document.createElement("p");
            paragraph.appendChild(document.createTextNode("Text "));
            paragraph.appendChild(document.createElement("br"));
            paragraph.appendChild(document.createTextNode(" More"));
            container.appendChild(paragraph);

            wordProcessor.processMarkdown(container);

            const wordSpans = paragraph.querySelectorAll(
                "span[data-word-index]",
            );
            expect(wordSpans.length).toBe(2);
        });
    });
});
