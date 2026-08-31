import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

// Agent changes use the same executable boundary rules as CI.
async function walk(directory) {
  const files = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      files.map((file) =>
        file.isDirectory()
          ? walk(path.join(directory, file.name))
          : path.join(directory, file.name),
      ),
    )
  ).flat();
}
const failures = [];
let checked = 0;
for (const file of (await walk("src")).filter((file) => /\.tsx?$/.test(file))) {
  checked++;
  const source = await readFile(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const layer = file.replaceAll("\\", "/").split("/")[1];
  const client = /^\s*["']use client["']/.test(source);
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      const typeOnly = node.importClause?.isTypeOnly;
      if (
        layer === "domain" &&
        /(@\/(application|infrastructure|components|app)|next|react|postgres|pglite)/.test(
          specifier,
        )
      ) {
        failures.push(`${file}: domain must not depend on ${specifier}`);
      }
      if (
        layer === "application" &&
        /(@\/(infrastructure|components|app)|next|react|postgres|pglite)/.test(specifier)
      ) {
        failures.push(`${file}: application must not depend on ${specifier}`);
      }
      if (
        client &&
        !typeOnly &&
        /(@\/(infrastructure|application)|node:|postgres|pglite|\/canonical|\/audit|\/seed)/.test(
          specifier,
        )
      ) {
        failures.push(`${file}: client runtime must not import ${specifier}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `PASS: ${checked} TypeScript modules respect domain, application and client boundaries.`,
  );
