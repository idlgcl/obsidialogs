import { toApiAnnotation } from "../../utils/api";
import type { Annotation } from "../../utils/annotation-service";

const base: Annotation = {
  id: "a1",
  kind: "Comment",
  targetId: "Tx1",
  targetStart: "The",
  targetEnd: "end.",
  targetDisplay: "painful",
  targetText: "The painful end.",
  sourceId: "note.md",
  sourceStart: "Title",
  sourceEnd: "body",
  sourceDisplay: "Title",
  sourceText: "Title body",
  lineIndex: 3,
  hexId: "a",
};

describe("toApiAnnotation", () => {
  it("maps short fields to long site fields and tags local", () => {
    const out = toApiAnnotation(base);
    expect(out).toMatchObject({
      id: "a1",
      kind: "Comment",
      sourceId: "note.md",
      targetId: "Tx1",
      targetTextStart: "The",
      targetTextEnd: "end.",
      targetTextDisplay: "painful",
      targetText: "The painful end.",
      sourceTextStart: "Title",
      sourceTextEnd: "body",
      sourceTextDisplay: "Title",
      sourceText: "Title body",
      isLocal: true,
    });
    expect(out).not.toHaveProperty("lineIndex");
    expect(out).not.toHaveProperty("hexId");
    expect(out).not.toHaveProperty("localOwner");
  });

  it("defaults missing optional source fields to empty strings", () => {
    const note: Annotation = {
      id: "b2",
      kind: "Note",
      targetId: "Tx2",
      targetStart: "a",
      targetEnd: "b",
      targetDisplay: "c",
      targetText: "a c b",
      sourceId: "n.md",
    };
    const out = toApiAnnotation(note);
    expect(out.sourceTextStart).toBe("");
    expect(out.sourceText).toBe("");
  });

  it("includes the vault name when provided, empty otherwise", () => {
    expect(toApiAnnotation(base, "MyVault").sourceVault).toBe("MyVault");
    expect(toApiAnnotation(base).sourceVault).toBe("");
  });
});
