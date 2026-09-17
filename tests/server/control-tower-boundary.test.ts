import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

it("keeps React components free of source loading, duplicated evidence evaluation and credentials", () => {
  const root = resolve("src/components/control-tower");
  for (const name of readdirSync(root).filter(name => name.endsWith(".tsx"))) {
    const file = resolve(root, name); const text = readFileSync(file, "utf8");
    expect(text).not.toMatch(/W-[1-4]|R-1|E-2|process\.env|evaluateEvidence\(|createClient\(|supabase\/\.temp|sb_secret_|SUPABASE_ACCESS_TOKEN/);
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
      expect(specifier).not.toMatch(/@\/server|@supabase|fixtures|node:/);
      if (specifier === "@/domain/evidence-engine") {
        const clause = statement.importClause;
        expect(clause?.namedBindings && ts.isNamedImports(clause.namedBindings)).toBe(true);
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const binding of clause.namedBindings.elements) {
            // Display frozen rule descriptions; evaluation never runs in React.
            expect(binding.isTypeOnly || binding.name.text === "EVIDENCE_RULES").toBe(true);
          }
        }
      }
    }
  }
});
it("keeps the SQL read fixed and the privileged local reader out of production", () => {
  const query = readFileSync("supabase/queries/control-tower.sql", "utf8");
  expect(query).toContain("begin read only;"); expect(query).toContain("commit;");
  expect(query).not.toMatch(/\b(?:insert|update|delete|truncate|grant|alter|create|drop)\b/i);
  const loader = readFileSync("src/server/control-tower/loader.ts", "utf8");
  expect(loader).toContain('import "server-only"'); expect(loader).toContain('process.env.NODE_ENV !== "development"');
  expect(loader).not.toMatch(/--debug|--db-url|shell:\s*true|console\./);
  const service = readFileSync("src/server/control-tower/service.ts", "utf8");
  expect(service).toContain("evaluateEvidence(workspace.snapshot)");
  expect(JSON.parse(readFileSync("package.json", "utf8")).scripts.dev).toContain("--hostname 127.0.0.1");
});
