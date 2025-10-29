import {
    parseNotes,
    noteToAnnotationData,
    Note,
} from "../../utils/note-parser";

describe("note-parser", () => {
    describe("parseNotes", () => {
        it("should parse a note with article link", () => {
            const text = "This is some text before [[@Tx123]] and text after.";
            const result = parseNotes(text);

            expect(result).toHaveLength(1);
            expect(result[0].linkText).toBe("[[@Tx123]]");
            expect(result[0].id).toBeDefined();
            expect(result[0].previousWords).toBeDefined();
            expect(result[0].nextWords).toBeDefined();
        });

        it("should capture up to 5 previous words", () => {
            const text = "Word1 Word2 Word3 Word4 Word5 Word6 [[@Tx123]] after";
            const result = parseNotes(text);

            expect(result).toHaveLength(1);
            expect(result[0].previousWords).toBe(
                "Word2 Word3 Word4 Word5 Word6",
            );
            expect(result[0].previousWordsIndex).toHaveLength(5);
        });

        it("should capture up to 5 next words", () => {
            const text = "Before [[@Tx123]] W1 W2 W3 W4 W5 W6 W7";
            const result = parseNotes(text);

            expect(result).toHaveLength(1);
            expect(result[0].nextWords).toBe("W1 W2 W3 W4 W5");
            expect(result[0].nextWordsIndex).toHaveLength(5);
        });

        it("should handle note at start of paragraph (no previous words)", () => {
            const text = "[[@Tx123]] text after";
            const result = parseNotes(text);

            // Should not create note if at start (i > 0 check)
            expect(result).toHaveLength(0);
        });

        it("should handle note at end of paragraph", () => {
            const text = "Text before [[@Tx123]]";
            const result = parseNotes(text);

            expect(result).toHaveLength(1);
            expect(result[0].nextWords).toBe("");
            expect(result[0].nextWordsIndex).toHaveLength(0);
        });

        it("should handle multiple notes in same paragraph", () => {
            const text = "Start [[@Tx123]] middle [[@Tx456]] end";
            const result = parseNotes(text);

            expect(result).toHaveLength(2);
            expect(result[0].linkText).toBe("[[@Tx123]]");
            expect(result[1].linkText).toBe("[[@Tx456]]");
        });

        it("should handle multiple paragraphs", () => {
            const text = `First paragraph with [[@Tx123]] link.

Second paragraph with [[@Tx456]] link.`;

            const result = parseNotes(text);

            expect(result).toHaveLength(2);
            expect(result[0].linkText).toBe("[[@Tx123]]");
            expect(result[1].linkText).toBe("[[@Tx456]]");
        });

        it("should skip headings", () => {
            const text = `# Heading with [[@Tx123]] link

Regular text with [[@Tx456]] link.`;

            const result = parseNotes(text);

            expect(result).toHaveLength(1);
            expect(result[0].linkText).toBe("[[@Tx456]]");
        });

        it("should handle empty paragraphs", () => {
            const text = `Text with [[@Tx123]] link.



More text with [[@Tx456]] link.`;

            const result = parseNotes(text);

            expect(result).toHaveLength(2);
        });

        it("should only match Tx article links", () => {
            const text =
                "Text with [[@Ix123]] and [[@Tx456]] and [[@Fx789]] links.";
            const result = parseNotes(text);

            expect(result).toHaveLength(1);
            expect(result[0].linkText).toBe("[[@Tx456]]");
        });

        it("should track word indices correctly", () => {
            const text = "One Two Three [[@Tx123]] Four Five";
            const result = parseNotes(text);

            expect(result).toHaveLength(1);
            expect(result[0].previousWordsIndex).toEqual([0, 1, 2]);
            expect(result[0].linkTextIndex).toEqual([3]);
            expect(result[0].nextWordsIndex).toEqual([4, 5]);
        });

        it("should create fullIndex combining all indices", () => {
            const text = "One Two [[@Tx123]] Three Four";
            const result = parseNotes(text);

            expect(result).toHaveLength(1);
            expect(result[0].fullIndex).toEqual([0, 1, 2, 3, 4]);
        });

        it("should handle empty text", () => {
            const result = parseNotes("");
            expect(result).toHaveLength(0);
        });

        it("should handle text with only whitespace", () => {
            const result = parseNotes("   \n\n  ");
            expect(result).toHaveLength(0);
        });

        it("should handle text without any links", () => {
            const result = parseNotes("Just regular text without any links.");
            expect(result).toHaveLength(0);
        });

        it("should handle links with complex article IDs", () => {
            const text = "Text [[@Tx123abc456]] more text";
            const result = parseNotes(text);

            expect(result).toHaveLength(1);
            expect(result[0].linkText).toBe("[[@Tx123abc456]]");
        });

        it("should generate unique IDs for each note", () => {
            const text = "Text [[@Tx123]] middle [[@Tx456]] end";
            const result = parseNotes(text);

            expect(result).toHaveLength(2);
            expect(result[0].id).toBeDefined();
            expect(result[1].id).toBeDefined();
            expect(result[0].id).not.toBe(result[1].id);
        });

        it("should handle paragraph with only heading", () => {
            const text = `# Heading Only

Text with [[@Tx123]] link.`;

            const result = parseNotes(text);

            expect(result).toHaveLength(1);
            expect(result[0].linkText).toBe("[[@Tx123]]");
        });
    });

    describe("noteToAnnotationData", () => {
        it("should convert note to annotation data", () => {
            const note: Note = {
                id: "test-id",
                linkText: "[[@Tx123]]",
                previousWords: "previous words",
                nextWords: "next words",
                linkTextIndex: [5],
                previousWordsIndex: [3, 4],
                nextWordsIndex: [6, 7],
                fullIndex: [3, 4, 5, 6, 7],
            };

            const result = noteToAnnotationData(note, "path/to/file.md");

            expect(result.id).toBe("test-id");
            expect(result.kind).toBe("NOTE");
            expect(result.timestamp).toBeDefined();
            expect(result.src).toBe("file.md");
            expect(result.target).toBe("Tx123");
            expect(result.noteMeta).toEqual(note);
        });

        it("should extract article ID from link text", () => {
            const note: Note = {
                id: "test-id",
                linkText: "[[@Tx456abc]]",
                previousWords: "",
                nextWords: "",
                linkTextIndex: [0],
                previousWordsIndex: [],
                nextWordsIndex: [],
                fullIndex: [0],
            };

            const result = noteToAnnotationData(note, "file.md");

            expect(result.target).toBe("Tx456abc");
        });

        it("should extract filename from path", () => {
            const note: Note = {
                id: "test-id",
                linkText: "[[@Tx123]]",
                previousWords: "",
                nextWords: "",
                linkTextIndex: [0],
                previousWordsIndex: [],
                nextWordsIndex: [],
                fullIndex: [0],
            };

            const result = noteToAnnotationData(
                note,
                "folder/subfolder/myfile.md",
            );

            expect(result.src).toBe("myfile.md");
        });

        it("should handle simple filename", () => {
            const note: Note = {
                id: "test-id",
                linkText: "[[@Tx123]]",
                previousWords: "",
                nextWords: "",
                linkTextIndex: [0],
                previousWordsIndex: [],
                nextWordsIndex: [],
                fullIndex: [0],
            };

            const result = noteToAnnotationData(note, "simple.md");

            expect(result.src).toBe("simple.md");
        });

        it("should handle empty filename", () => {
            const note: Note = {
                id: "test-id",
                linkText: "[[@Tx123]]",
                previousWords: "",
                nextWords: "",
                linkTextIndex: [0],
                previousWordsIndex: [],
                nextWordsIndex: [],
                fullIndex: [0],
            };

            const result = noteToAnnotationData(note, "");

            expect(result.src).toBe("");
        });

        it("should initialize empty annotation fields", () => {
            const note: Note = {
                id: "test-id",
                linkText: "[[@Tx123]]",
                previousWords: "prev",
                nextWords: "next",
                linkTextIndex: [1],
                previousWordsIndex: [0],
                nextWordsIndex: [2],
                fullIndex: [0, 1, 2],
            };

            const result = noteToAnnotationData(note, "file.md");

            expect(result.src_txt_display).toBe("");
            expect(result.src_txt_start).toBe("");
            expect(result.src_txt_end).toBe("");
            expect(result.src_txt).toBe("");
            expect(result.src_range).toEqual([]);
            expect(result.src_txt_display_range).toEqual([]);
            expect(result.target_txt_display).toBe("");
            expect(result.target_txt_start).toBe("");
            expect(result.target_txt_end).toBe("");
            expect(result.target_txt).toBe("");
            expect(result.target_range).toEqual([]);
            expect(result.target_txt_display_range).toEqual([]);
        });

        it("should preserve note metadata", () => {
            const note: Note = {
                id: "unique-id-123",
                linkText: "[[@Tx999]]",
                previousWords: "context before",
                nextWords: "context after",
                linkTextIndex: [10],
                previousWordsIndex: [8, 9],
                nextWordsIndex: [11, 12],
                fullIndex: [8, 9, 10, 11, 12],
            };

            const result = noteToAnnotationData(note, "notes/doc.md");

            expect(result.noteMeta).toEqual(note);
            expect(result.noteMeta?.id).toBe("unique-id-123");
            expect(result.noteMeta?.previousWords).toBe("context before");
            expect(result.noteMeta?.nextWords).toBe("context after");
        });
    });
});
