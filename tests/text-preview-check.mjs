import assert from "node:assert/strict";
import {
  detectLanguage,
  formattedKind,
  highlightToHtml,
  parseCsv,
  prettyJson
} from "../src/features/files/text-preview.js";

const detect = (text, name = "") => detectLanguage({ name, text }).language;

// Extension decides first.
assert.equal(detect("anything at all", "script.py"), "python");
assert.equal(detect("", "data.json"), "json");
assert.equal(detect("x", "Dockerfile"), "dockerfile");
assert.equal(detect("x", "main.rs"), "rust");
assert.equal(detectLanguage({ name: "a.ts", text: "" }).source, "extension");

// Content decides when the name says nothing (pasted text, README, .txt, .log).
const samples = {
  javascript: "const total = items.map((item) => item.price).reduce((a, b) => a + b, 0);\nconsole.log(total);\nfunction add(a, b) { return a + b; }",
  typescript: "interface User {\n  id: string;\n  age: number;\n}\nconst user: User = { id: \"1\", age: 3 };",
  python: "import os\n\ndef main():\n    print(os.getcwd())\n\nif __name__ == \"__main__\":\n    main()",
  sql: "SELECT id, name, created_at\nFROM users\nWHERE active = 1\nORDER BY created_at DESC;",
  bash: "sudo apt install nginx\nnpm run build\ncurl -fsSL https://example.com/install.sh | sh",
  markdown: "# Release notes\n\nThis version adds **pairing** and a [changelog](https://example.com).\n\n- faster sync\n- smaller bundle",
  yaml: "name: ci\non:\n  push:\n    branches: [main]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4",
  xml: "<!DOCTYPE html>\n<html><body><div class=\"a\">hello</div></body></html>",
  json: "{\"a\":1,\"b\":[1,2,{\"c\":null}]}",
  diff: "diff --git a/a.txt b/a.txt\n@@ -1,2 +1,2 @@\n-old line\n+new line",
  ini: "[server]\nhost = localhost\nport = 8080\n[db]\nuser = admin",
  css: "body {\n  margin: 0;\n  color: #111;\n}\n.card { padding: 8px; }",
  go: "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"hi\")\n}",
  rust: "use std::fs;\n\nfn main() {\n    let mut count = 0;\n    count += 1;\n}",
  java: "public class Hello {\n  public static void main(String[] args) {\n    System.out.println(\"hi\");\n  }\n}",
  php: "<?php\n$name = 'x';\necho $name;",
  dockerfile: "FROM node:22\nWORKDIR /app\nCOPY . .\nRUN npm ci",
  powershell: "Get-ChildItem -Path . | Where-Object { $_.Length -gt 1KB }\n$env:PATH"
};
for (const [language, text] of Object.entries(samples)) {
  assert.equal(detect(text, "pasted.txt"), language, `detects ${language} from content`);
  assert.equal(detect(text), language, `detects ${language} with no file name`);
}
assert.equal(detect("#!/usr/bin/env node\nlet x = 1", "run"), "javascript", "shebang");
assert.equal(detect("#!/bin/bash\necho hi"), "bash", "shebang");

// Prose and noise stay plain text instead of being mis-coloured.
assert.equal(detect("Dear team,\nthanks for the update.\nSee you tomorrow."), "plaintext");
assert.equal(detect("meeting at 10, bring the budget numbers"), "plaintext");
assert.equal(detect("   \n\n"), "plaintext");
assert.equal(detect("", "notes.txt"), "plaintext");

// Detection only reads a small sample, so a huge file stays fast.
const huge = "const x = 1;\nconsole.log(x);\n".repeat(200000);
const started = performance.now();
assert.equal(detect(huge, "big.txt"), "javascript");
assert.ok(performance.now() - started < 50, "detection is cheap on large input");

// Formatted views are offered only where they make sense.
assert.equal(formattedKind("a.csv", "plaintext"), "table");
assert.equal(formattedKind("a.tsv", "plaintext"), "table");
assert.equal(formattedKind("a.md", "markdown"), "markdown");
assert.equal(formattedKind("a.json", "json"), "json");
assert.equal(formattedKind("a.html", "xml"), null, "html is never rendered, only shown as source");
assert.equal(formattedKind("a.py", "python"), null);

// JSON and CSV helpers.
assert.deepEqual(prettyJson('{"a":1}'), { ok: true, text: '{\n  "a": 1\n}' });
assert.equal(prettyJson("{nope").ok, false);
const csv = parseCsv('name,notes\n"Ada, L.","said ""hi"""\nBob,\n');
assert.deepEqual(csv.rows, [["name", "notes"], ["Ada, L.", 'said "hi"'], ["Bob", ""]]);
assert.equal(parseCsv("a;b\n1;2").delimiter, ";");
assert.equal(parseCsv("a\tb\n1\t2").delimiter, "\t");
const manyRows = parseCsv(Array.from({ length: 900 }, (_, index) => `${index},x`).join("\n"));
assert.equal(manyRows.rows.length, 500, "row cap");
assert.equal(manyRows.truncated, true);

// Highlighting returns markup only for the source text, with raw HTML escaped.
const html = await highlightToHtml('const a = "<script>alert(1)</script>";', "javascript");
assert.ok(html.includes("hljs-keyword"), "keywords are tokenised");
assert.ok(!html.includes("<script>"), "source text is escaped");
assert.equal(await highlightToHtml("<b>x</b>", "plaintext"), "&lt;b&gt;x&lt;/b&gt;");
assert.ok((await highlightToHtml('{"a":1}', "json")).includes("hljs-attr"));
for (const language of ["python", "sql", "bash", "yaml", "xml", "css", "markdown", "go", "rust"]) {
  assert.ok((await highlightToHtml("x", language)).length > 0, `${language} grammar loads`);
}

console.log("Text preview checks passed.");
