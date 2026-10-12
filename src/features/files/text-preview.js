import { fileExtension } from "./attachments.js";

// Only this much is detected and highlighted, so a huge log can never freeze the viewer.
export const previewSliceBytes = 200 * 1024;
const sampleLines = 40;
const sampleChars = 4096;

export const languageOptions = [
  { id: "plaintext", label: "Plain text" },
  { id: "json", label: "JSON" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "xml", label: "HTML / XML" },
  { id: "css", label: "CSS" },
  { id: "markdown", label: "Markdown" },
  { id: "bash", label: "Shell" },
  { id: "python", label: "Python" },
  { id: "sql", label: "SQL" },
  { id: "yaml", label: "YAML" },
  { id: "ini", label: "INI / TOML" },
  { id: "diff", label: "Diff" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "java", label: "Java" },
  { id: "kotlin", label: "Kotlin" },
  { id: "swift", label: "Swift" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "php", label: "PHP" },
  { id: "ruby", label: "Ruby" },
  { id: "lua", label: "Lua" },
  { id: "powershell", label: "PowerShell" },
  { id: "dockerfile", label: "Dockerfile" },
  { id: "graphql", label: "GraphQL" }
];

const languageIds = new Set(languageOptions.map((option) => option.id));

const extensionLanguage = {
  json: "json", jsonc: "json", js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", tsx: "typescript", html: "xml", htm: "xml", xml: "xml", svg: "xml", vue: "xml", svelte: "xml",
  css: "css", scss: "css", md: "markdown", markdown: "markdown", sh: "bash", bash: "bash", zsh: "bash",
  ps1: "powershell", py: "python", sql: "sql", yaml: "yaml", yml: "yaml", toml: "ini", ini: "ini", conf: "ini",
  cfg: "ini", env: "ini", diff: "diff", patch: "diff", go: "go", rs: "rust", java: "java", kt: "kotlin",
  swift: "swift", c: "c", h: "c", cpp: "cpp", hpp: "cpp", cs: "csharp", php: "php", rb: "ruby", lua: "lua",
  dockerfile: "dockerfile", graphql: "graphql", gql: "graphql", txt: "plaintext", text: "plaintext",
  log: "plaintext", csv: "plaintext", tsv: "plaintext"
};

// Cheap signals per language: [pattern, weight]. Patterns run once over a small sample.
const signals = [
  { language: "json", tests: [[/^\s*[{[]/, 2], [/"[^"\n]+"\s*:\s*["{[\d\-tfn]/m, 4]] },
  { language: "xml", tests: [[/^\s*<\?xml/i, 8], [/^\s*<!doctype html/i, 8], [/<\/?(html|head|body|div|span|svg|p|a|ul|li)\b[^>]*>/i, 4], [/^\s*<[A-Za-z][\w:-]*[\s>]/, 2]] },
  { language: "markdown", tests: [[/^#{1,6}\s+\S/m, 3], [/^```/m, 4], [/^\s*[-*]\s+\[[ x]\]/m, 4], [/\[[^\]\n]+\]\(https?:[^)\n]+\)/, 3], [/^\s*>\s+\S/m, 1], [/^\s*[-*]\s+\S/m, 1], [/\*\*[^*\n]+\*\*/, 2]] },
  { language: "diff", tests: [[/^diff --git /m, 8], [/^@@ -\d+(,\d+)? \+\d+(,\d+)? @@/m, 8], [/^(\+\+\+|---) \S/m, 3]] },
  { language: "sql", tests: [[/\bselect\b[\s\S]{0,200}\bfrom\b/i, 5], [/\b(insert\s+into|update\s+\w+\s+set|delete\s+from|create\s+table|alter\s+table|drop\s+table)\b/i, 6], [/;\s*$/m, 1]] },
  { language: "yaml", tests: [[/^---\s*$/m, 3], [/^[\w.-]+:\s*(\S.*)?$/m, 2], [/^\s*-\s+[\w.-]+:\s/m, 3], [/^\s*-\s+\S/m, 1]] },
  { language: "ini", tests: [[/^\[[\w .-]+\]\s*$/m, 4], [/^[\w.-]+\s*=\s*\S/m, 2]] },
  { language: "python", tests: [[/^\s*def\s+\w+\(.*\)\s*(->.*)?:\s*$/m, 6], [/^\s*(from\s+[\w.]+\s+)?import\s+[\w.*, ]+$/m, 3], [/^\s*class\s+\w+(\(.*\))?:\s*$/m, 5], [/^if __name__ == ["']__main__["']:/m, 8], [/^\s*(elif|except\s+\w+|with\s+.+\s+as\s+\w+):/m, 4], [/\bprint\(/, 1]] },
  { language: "typescript", tests: [[/\binterface\s+\w+\s*\{/, 6], [/:\s*(string|number|boolean|unknown|any)\b/, 4], [/\b(type\s+\w+\s*=|as\s+const|enum\s+\w+\s*\{)/, 4], [/\bimport\s+type\b/, 6]] },
  { language: "javascript", tests: [[/\b(const|let|var)\s+[\w{[]/, 3], [/=>/, 2], [/\bfunction\s*\w*\s*\(/, 3], [/^\s*(import\s.+from\s|export\s+(default|const|function|class))/m, 4], [/\bconsole\.\w+\(/, 3], [/\brequire\(["']/, 4]] },
  { language: "bash", tests: [[/^#!.*\b(ba|z|)sh\b/, 10], [/^\s*\$\s+\S/m, 3], [/^\s*(sudo|apt(-get)?|brew|npm|npx|yarn|pnpm|pip|git|cd|ls|mkdir|chmod|curl|wget|echo|export|source|docker)\s/gm, 2], [/\|\s*(ba|z)?sh\b/, 3], [/\bif\s+\[\[?\s/, 4], [/\$\{?[A-Z_][A-Z0-9_]*\}?/, 1], [/\bfi\s*$/m, 3]] },
  { language: "powershell", tests: [[/\b(Get|Set|New|Remove|Invoke|Write)-[A-Z]\w+/, 5], [/\$env:\w+/i, 5], [/^\s*param\s*\(/im, 4]] },
  { language: "go", tests: [[/^package\s+\w+\s*$/m, 6], [/\bfunc\s+(\(\w+\s+\*?\w+\)\s+)?\w+\(/, 5], [/:=/, 2]] },
  { language: "rust", tests: [[/\bfn\s+\w+\s*(<.*>)?\(/, 5], [/\blet\s+mut\b/, 5], [/^use\s+std::/m, 6], [/\bimpl\b.*\{/, 3]] },
  { language: "java", tests: [[/\bpublic\s+(static\s+)?(class|void|interface)\b/, 6], [/System\.out\.print/, 6], [/^import\s+java\./m, 6]] },
  { language: "kotlin", tests: [[/\bfun\s+\w+\(/, 5], [/\bval\s+\w+\s*[:=]/, 3], [/^package\s+[\w.]+$/m, 1]] },
  { language: "swift", tests: [[/\bfunc\s+\w+\(.*\)\s*(->\s*\w+)?\s*\{/, 4], [/^import\s+(Foundation|SwiftUI|UIKit)/m, 8], [/\b(guard|let)\s+\w+.*else\s*\{/, 3]] },
  { language: "cpp", tests: [[/#include\s*<(iostream|vector|string|map|memory)>/, 8], [/\bstd::\w+/, 5], [/\bnamespace\s+\w+/, 3], [/\btemplate\s*<.*>/, 4]] },
  { language: "c", tests: [[/#include\s*<(stdio|stdlib|string|stdint)\.h>/, 8], [/\bint\s+main\s*\(/, 5], [/\bprintf\s*\(/, 3]] },
  { language: "csharp", tests: [[/^using\s+System[\w.]*;/m, 8], [/\bnamespace\s+[\w.]+\s*(\{|;)/, 4], [/\b(public|private)\s+(static\s+)?(void|string|int|class)\b/, 3], [/\bConsole\.Write/, 5]] },
  { language: "php", tests: [[/^\s*<\?php/, 10], [/\$\w+\s*=\s*/, 2], [/\becho\s+["'$]/, 2]] },
  { language: "ruby", tests: [[/^\s*def\s+\w+[?!]?(\(.*\))?\s*$/m, 3], [/\bputs\s+["']/, 4], [/^\s*end\s*$/m, 3], [/\brequire\s+["']\w+["']/, 3], [/\battr_(reader|accessor)\b/, 6]] },
  { language: "lua", tests: [[/\blocal\s+(function\s+)?\w+/, 4], [/^\s*end\s*$/m, 1], [/\bfunction\s+\w+(\.\w+)*\(/, 2]] },
  { language: "css", tests: [[/^\s*[.#@]?[\w-][\w\s.,#>:+~*-]*\{\s*$/m, 3], [/^\s*[\w-]+\s*:\s*[^;{}\n]+;\s*$/m, 3], [/@(media|import|keyframes|font-face)\b/, 5]] },
  { language: "dockerfile", tests: [[/^FROM\s+\S+/m, 3], [/^(RUN|CMD|COPY|ADD|ENTRYPOINT|WORKDIR|EXPOSE|ENV|ARG)\s+\S/m, 4], [/^(COPY|RUN)\s+.*\s(\.|\/)\S*$/m, 1]] },
  { language: "graphql", tests: [[/^\s*(query|mutation|subscription)\s+\w*\s*[({]/m, 6], [/^\s*type\s+\w+\s*\{/m, 5]] }
];

function takeSample(text) {
  const lines = text.slice(0, sampleChars * 2).split(/\r?\n/).slice(0, sampleLines).join("\n");
  return lines.slice(0, sampleChars);
}

function looksLikeJson(text) {
  const trimmed = text.trim();
  if (!/^[{[]/.test(trimmed)) return false;
  if (trimmed.length <= previewSliceBytes) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  return /^[{[]\s*["{[\d]/.test(trimmed);
}

// Picks a language from the file name first, then from the first few lines of content.
// Accuracy is deliberately traded for speed: the user can always override the choice.
export function detectLanguage({ name = "", text = "" }) {
  const ext = fileExtension(name);
  const byName = name.toLowerCase() === "dockerfile" ? "dockerfile" : extensionLanguage[ext];
  if (byName && byName !== "plaintext") return { language: byName, source: "extension", confidence: 1 };

  const sample = takeSample(text);
  if (!sample.trim()) return { language: "plaintext", source: "default", confidence: 0 };

  const firstLine = sample.split(/\r?\n/, 1)[0];
  if (firstLine.startsWith("#!")) {
    const parts = firstLine.slice(2).trim().split(/\s+/);
    let command = (parts[0] ?? "").split("/").pop();
    if (command === "env") command = (parts.find((part, index) => index > 0 && !part.startsWith("-")) ?? "").split("/").pop();
    const map = { python: "python", python3: "python", node: "javascript", bash: "bash", sh: "bash", zsh: "bash", ruby: "ruby", php: "php" };
    if (map[command]) return { language: map[command], source: "content", confidence: 1 };
  }

  if (looksLikeJson(text.slice(0, previewSliceBytes))) return { language: "json", source: "content", confidence: 0.95 };

  const scores = [];
  for (const { language, tests } of signals) {
    let score = 0;
    for (const [pattern, weight] of tests) {
      if (pattern.global) {
        // Repeated hits (up to three) count more than a single stray match.
        score += Math.min(sample.match(pattern)?.length ?? 0, 3) * weight;
      } else if (pattern.test(sample)) {
        score += weight;
      }
    }
    if (score > 0) scores.push([language, score]);
  }
  scores.sort((a, b) => b[1] - a[1]);
  const [best, runnerUp] = scores;
  if (!best || best[1] < 5 || (runnerUp && best[1] - runnerUp[1] < 2)) {
    return { language: "plaintext", source: "default", confidence: 0.2 };
  }
  return { language: best[0], source: "content", confidence: Math.min(1, best[1] / 10) };
}

export function languageLabel(id) {
  return languageOptions.find((option) => option.id === id)?.label ?? "Plain text";
}

export function isKnownLanguage(id) {
  return languageIds.has(id);
}

// Which visual (rendered) view, if any, makes sense for this file.
export function formattedKind(name, language) {
  const ext = fileExtension(name);
  if (ext === "csv" || ext === "tsv") return "table";
  if (language === "markdown") return "markdown";
  if (language === "json") return "json";
  return null;
}

export function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- highlighting (lazy: nothing loads until a text file is opened) ---------

const loaders = {
  json: () => import("highlight.js/lib/languages/json"),
  javascript: () => import("highlight.js/lib/languages/javascript"),
  typescript: () => import("highlight.js/lib/languages/typescript"),
  xml: () => import("highlight.js/lib/languages/xml"),
  css: () => import("highlight.js/lib/languages/css"),
  markdown: () => import("highlight.js/lib/languages/markdown"),
  bash: () => import("highlight.js/lib/languages/bash"),
  python: () => import("highlight.js/lib/languages/python"),
  sql: () => import("highlight.js/lib/languages/sql"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
  ini: () => import("highlight.js/lib/languages/ini"),
  diff: () => import("highlight.js/lib/languages/diff"),
  go: () => import("highlight.js/lib/languages/go"),
  rust: () => import("highlight.js/lib/languages/rust"),
  java: () => import("highlight.js/lib/languages/java"),
  kotlin: () => import("highlight.js/lib/languages/kotlin"),
  swift: () => import("highlight.js/lib/languages/swift"),
  c: () => import("highlight.js/lib/languages/c"),
  cpp: () => import("highlight.js/lib/languages/cpp"),
  csharp: () => import("highlight.js/lib/languages/csharp"),
  php: () => import("highlight.js/lib/languages/php"),
  ruby: () => import("highlight.js/lib/languages/ruby"),
  lua: () => import("highlight.js/lib/languages/lua"),
  powershell: () => import("highlight.js/lib/languages/powershell"),
  dockerfile: () => import("highlight.js/lib/languages/dockerfile"),
  graphql: () => import("highlight.js/lib/languages/graphql")
};

let corePromise;

// Returns HTML that is safe to inject: highlight.js escapes the source text itself.
export async function highlightToHtml(text, language) {
  if (!loaders[language]) return escapeHtml(text);
  corePromise ??= import("highlight.js/lib/core").then((module) => module.default);
  const core = await corePromise;
  if (!core.getLanguage(language)) {
    const module = await loaders[language]();
    core.registerLanguage(language, module.default);
  }
  return core.highlight(text, { language, ignoreIllegals: true }).value;
}

// --- formatted views ---------------------------------------------------------

export function prettyJson(text) {
  try {
    return { ok: true, text: JSON.stringify(JSON.parse(text), null, 2) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function parseCsv(text, { maxRows = 500, maxCols = 50 } = {}) {
  const firstLine = text.slice(0, 2000).split(/\r?\n/, 1)[0] ?? "";
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const char of firstLine) if (char in counts) counts[char] += 1;
  const delimiter = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  let truncated = false;
  const pushRow = () => {
    row.push(cell);
    cell = "";
    rows.push(row.slice(0, maxCols));
    row = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      pushRow();
      if (rows.length >= maxRows) {
        truncated = index < text.length - 1;
        break;
      }
    } else {
      cell += char;
    }
  }
  if (!truncated && (cell || row.length)) pushRow();
  return { rows: rows.filter((cells) => cells.some((value) => value !== "")), truncated, delimiter };
}

const allowedTags = new Set([
  "P", "BR", "HR", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "CODE", "EM",
  "STRONG", "DEL", "S", "A", "IMG", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "SPAN", "DIV", "INPUT"
]);

// Defence in depth for rendered Markdown: even though raw HTML is already escaped, the output is
// re-parsed in an inert document and anything outside a small allowlist is removed.
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const walk = (node) => {
    for (const child of Array.from(node.children)) {
      if (!allowedTags.has(child.tagName)) {
        child.remove();
        continue;
      }
      for (const attribute of Array.from(child.attributes)) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value;
        const keep =
          (child.tagName === "A" && name === "href" && /^(https?:|mailto:|#)/i.test(value)) ||
          (child.tagName === "A" && name === "title") ||
          (child.tagName === "IMG" && name === "src" && /^data:image\/(png|jpeg|gif|webp);base64,/i.test(value)) ||
          (child.tagName === "IMG" && (name === "alt" || name === "title")) ||
          ((child.tagName === "TH" || child.tagName === "TD") && name === "style" && /^text-align:\s*(left|right|center)$/i.test(value.trim())) ||
          (child.tagName === "INPUT" && ["type", "checked", "disabled"].includes(name) && (name !== "type" || value === "checkbox")) ||
          (name === "class" && /^[\w\s-]+$/.test(value));
        if (!keep) child.removeAttribute(attribute.name);
      }
      if (child.tagName === "IMG" && !child.getAttribute("src")) {
        child.remove();
        continue;
      }
      if (child.tagName === "A") {
        child.setAttribute("rel", "noopener noreferrer");
        child.setAttribute("target", "_blank");
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

let markdownPromise;

export async function renderMarkdown(text) {
  markdownPromise ??= import("markdown-it").then((module) => new module.default({ html: false, linkify: false, breaks: false }));
  const renderer = await markdownPromise;
  return sanitizeHtml(renderer.render(text));
}
