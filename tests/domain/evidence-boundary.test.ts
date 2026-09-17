import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

it("keeps the entire evidence engine import graph inside the pure domain boundary", () => {
  const root = resolve("src/domain");
  const seen = new Set<string>();
  function inspect(file: string) {
    if (seen.has(file)) return;
    seen.add(file);
    expect(file.startsWith(root + sep)).toBe(true);
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier) {
          expect(ts.isStringLiteral(node.moduleSpecifier)).toBe(true);
          const specifier = (node.moduleSpecifier as ts.StringLiteral).text;
          expect(specifier.startsWith("./")).toBe(true);
          inspect(resolve(dirname(file), specifier + ".ts"));
        }
      }
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(source);
        expect(["fetch", "require", "Date.now", "Math.random", "eval"]).not.toContain(name);
        expect(node.expression.kind).not.toBe(ts.SyntaxKind.ImportKeyword);
      }
      if (ts.isNewExpression(node)) expect(node.expression.getText(source)).not.toBe("XMLHttpRequest");
      if (ts.isIdentifier(node)) expect(["process", "window", "document", "WebSocket"]).not.toContain(node.text);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  inspect(resolve(root, "evidence-engine.ts"));
  expect(seen.size).toBe(3);
});
