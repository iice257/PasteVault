import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";

const root = cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const required = [
  "index.html",
  "src/main.jsx",
  "src/App.jsx",
  "src/pages/LandingPage.jsx",
  "src/pages/ClipboardPage.jsx",
  "src/features/clipboard/clipboard-store.js",
  "src/styles.css",
  "src/components/ui/button.jsx",
  "src/components/ui/dropdown-menu.jsx",
  "src/components/ui/card.jsx",
  "src/components/ui/dialog.jsx",
  "src/components/ui/sheet.jsx",
  "src/components/ui/tabs.jsx",
  "manifest.webmanifest",
  "public/sw.js",
  "public/favicon.svg"
];

for (const file of required) {
  read(file);
}

const html = read("index.html");
const app = [
  read("src/App.jsx"),
  read("src/pages/LandingPage.jsx"),
  read("src/pages/ClipboardPage.jsx"),
  read("src/components/pastevault/ClipboardEditor.jsx"),
  read("src/components/pastevault/MetadataRow.jsx"),
  read("src/components/pastevault/PasswordModal.jsx"),
  read("src/features/clipboard/clipboard-store.js")
].join("\n");
const css = read("src/styles.css");
const packageJson = read("package.json");
const manifest = read("manifest.webmanifest");
const serviceWorker = read("public/sw.js");

function assertIncludes(label, content, expected) {
  for (const value of expected) {
    if (!content.includes(value)) {
      throw new Error(`${label} missing ${value}`);
    }
  }
}

assertIncludes("HTML", html, ["/src/main.jsx", 'id="root"']);
assertIncludes("App", app, [
  "DropdownMenu",
  "ClipboardCopy",
  "theme-dark",
  "theme-light",
  "Password optional",
  "Clipboard {clipboardId}",
  "Selected clip",
  "Copy link",
  "No account storage",
  "password cannot be recovered"
]);
assertIncludes("CSS", css, [
  ".theme-light",
  ".theme-dark",
  ".sidebar",
  ".editor-card",
  ".history-panel",
  ".details-panel",
  ".toast"
]);
assertIncludes("package.json", packageJson, [
  "react",
  "lucide-react",
  "@heroui/react",
  "motion",
  "@radix-ui/react-dropdown-menu",
  "vite"
]);
assertIncludes("Manifest", manifest, [
  '"start_url": "/"',
  '"scope": "/"',
  '"icons"',
  '"/favicon.svg"'
]);
assertIncludes("Service worker", serviceWorker, [
  "pastevault-app-v1",
  'request.mode === "navigate"',
  'url.pathname.startsWith("/api/")'
]);

const api = [
  read("api/clip/[id].js"),
  read("api/_shared.js")
].join("\n");
assertIncludes("API", api, [
  "UPSTASH_REDIS_REST_URL",
  "KV_REST_API_URL",
  "Too many requests",
  "encryptedPayload"
]);

if (/\{\{[A-Z_]+\}\}/.test([html, app, css].join("\n"))) {
  throw new Error("App contains unresolved placeholders");
}

console.log("Smoke checks passed.");
