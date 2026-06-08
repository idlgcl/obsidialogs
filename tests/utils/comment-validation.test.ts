import { App } from "obsidian";
import { AnnotationService, Annotation } from "../../utils/annotation-service";

function serviceWithContent(content: string): AnnotationService {
  const app = new App();
  app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
  app.vault.adapter.read = jest.fn().mockResolvedValue(content);
  return new AnnotationService(app);
}

const comment: Annotation = {
  id: "c1",
  kind: "Comment",
  targetId: "Tx1",
  targetStart: "",
  targetEnd: "",
  targetDisplay: "",
  targetText: "",
  sourceId: "First Article.md",
  sourceStart: "This",
  sourceEnd: "painful.",
  sourceDisplay: "This is a comment.",
};

describe("AnnotationService.validateComment", () => {
  it("validates a comment whose end word is followed by the ':' delimiter", async () => {
    const content = "This is a comment. But I must explain extremely painful.:";
    const result = await serviceWithContent(content).validateComment(comment);
    expect(result.isValid).toBe(true);
  });

  it("includes the trailing ':' delimiter in sourceText so the web can bold the title", async () => {
    const content = "This is a comment. But I must explain extremely painful.:";
    const result = await serviceWithContent(content).validateComment(comment);
    expect(result.sourceText?.endsWith(":")).toBe(true);
  });

  it("still validates a comment that ends at end-of-text (no delimiter)", async () => {
    const content = "This is a comment. But I must explain extremely painful.";
    const result = await serviceWithContent(content).validateComment(comment);
    expect(result.isValid).toBe(true);
    expect(result.sourceText?.endsWith(":")).toBe(false);
  });
});
