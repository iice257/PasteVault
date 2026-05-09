import { useMemo, useState } from "react";
import {
  Archive,
  Check,
  ChevronDown,
  Clipboard,
  ClipboardCopy,
  Clock3,
  Download,
  FileInput,
  Link2,
  Lock,
  MoreHorizontal,
  Pin,
  Search,
  Star,
  Sun,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./components/ui/dropdown-menu";
import { ReactBitsBackdrop } from "./components/ReactBitsBackdrop";
import { useTheme } from "./hooks/useTheme";

const sampleJson = `{
  "name": "Alice Johnson",
  "email": "alice.johnson@example.com",
  "role": "admin",
  "isActive": true,
  "createdAt": "2024-05-16T14:22:31.123Z"
}`;

const historyItems = [
  { id: "clip_9f8a7b6c3d2e1f0a", title: "Create user endpoint", format: "JSON", size: "256 B", age: "Just now", pinned: true, selected: true, preview: "Create user endpoint" },
  { id: "sql", title: "SELECT u.id, u.name, u.email FROM users u WHERE u.active = 1 ORDER BY u.created_at DESC...", format: "SQL", size: "128 B", age: "2m ago", preview: "Select users" },
  { id: "curl", title: "curl -X POST https://api.example.com/v1/users \\\n  -H \"Content-Type: application/json\" -d '{\"name\":\"Alice\"}'", format: "cURL", size: "210 B", age: "3m ago", preview: "cURL request" },
  { id: "js", title: "export const apiClient = axios.create({ baseURL: 'https://api.example.com', timeout: 10000 })", format: "JS", size: "512 B", age: "15m ago", preview: "Export API client" },
  { id: "deploy", title: "# Deploy to production\\nnpm run build\\nnpm run start", format: "TXT", size: "72 B", age: "1h ago", preview: "Deploy command" },
  { id: "jwt", title: "5f4dcc3b5aa765d61d8327deb882cf99", format: "TXT", size: "32 B", age: "1d ago", preview: "JWT token" },
  { id: "schema", title: "Product schema", format: "JSON", size: "1.1 KB", age: "2d ago", preview: "Product schema" },
  { id: "csv", title: "Users export", format: "CSV", size: "940 B", age: "3d ago", preview: "Users export" },
  { id: "notes", title: "Release notes", format: "TXT", size: "1.2 KB", age: "5d ago", preview: "Release notes" }
];

const formatOptions = ["Plain text", "JSON", "JavaScript", "cURL", "SQL", "HTML", "Markdown"];
const sortOptions = ["Newest", "Oldest", "Largest", "Smallest", "Recently updated"];
const defaultClipboardId = "clip_9f8a7b6c3d2e1f0a";

function getClipboardId() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const match = path.match(/^\/clip\/([^/]+)$/);

  if (!match) {
    return defaultClipboardId;
  }

  try {
    return decodeURIComponent(match[1]) || defaultClipboardId;
  } catch {
    return defaultClipboardId;
  }
}

function App() {
  return <ClipboardApp clipboardId={getClipboardId()} />;
}

function ClipboardApp({ clipboardId }) {
  const { isDark, toggleTheme } = useTheme();
  const [format, setFormat] = useState("JSON");
  const [sort, setSort] = useState("Newest");
  const [toastVisible, setToastVisible] = useState(true);

  const visibleItems = useMemo(() => (isDark ? historyItems.slice(0, 6) : historyItems), [isDark]);

  return (
    <div className={isDark ? "theme-dark" : "theme-light"}>
      <ReactBitsBackdrop />
      <div className="app-frame">
        <Sidebar />
        <main className="app-main">
          <Header clipboardId={clipboardId} isDark={isDark} onThemeChange={toggleTheme} />
          <div className="content-grid">
            <section className="workspace-panel">
              <EditorCard clipboardId={clipboardId} format={format} setFormat={setFormat} isDark={isDark} />
              <HistoryPanel items={visibleItems} sort={sort} setSort={setSort} isDark={isDark} />
              {!isDark && <ImportDropzone />}
            </section>
            <DetailsPanel clipboardId={clipboardId} isDark={isDark} />
          </div>
        </main>
        {toastVisible && isDark && (
          <div className="toast">
            <Check size={20} />
            <span>Clip saved successfully</span>
            <button type="button" onClick={() => setToastVisible(false)} aria-label="Dismiss toast">
              <X size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Sidebar() {
  const items = [
    { icon: Clipboard, label: "Clipboard", active: true },
    { icon: Clock3, label: "History" },
    { icon: Star, label: "Starred" },
    { icon: Download, label: "Imports" },
    { icon: Upload, label: "Exports" }
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        {items.map((item) => (
          <button className={`nav-item ${item.active ? "active" : ""}`} key={item.label} type="button">
            <item.icon size={22} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="sidebar-bottom">
        <div className="storage-card">
          <span>Storage</span>
          <strong>2.4 MB <em>/ 10 MB</em></strong>
          <div className="storage-track">
            <div />
          </div>
          <button type="button">Upgrade</button>
        </div>
      </div>
    </aside>
  );
}

function Header({ clipboardId, isDark, onThemeChange }) {
  return (
    <header className="header">
      <div className="brand">
        <div className="brand-icon">
          <Clipboard size={24} />
        </div>
        <div>
          <h1>PasteVault</h1>
          <span className="clipboard-route">/clip/{clipboardId}</span>
        </div>
      </div>
      <div className="header-actions">
        <span className="saved-state">
          <Check size={18} />
          Link clipboard saved
        </span>
        <button className="password-pill" type="button">
          <Lock size={16} />
          Password optional
        </button>
        <kbd>Cmd K</kbd>
        <button className="round-action" type="button" onClick={onThemeChange} aria-label="Toggle theme" aria-pressed={!isDark}>
          <Sun size={22} />
        </button>
      </div>
    </header>
  );
}

function EditorCard({ clipboardId, format, setFormat, isDark }) {
  return (
    <section className="editor-card">
      {isDark && (
        <label className="title-field">
          <span>Clipboard title</span>
          <div>
            <input value="Create user endpoint" readOnly />
            <em>23 / 120</em>
          </div>
        </label>
      )}
      <div className="link-context">
        <label>
          <span>Clipboard ID</span>
          <input value={clipboardId} readOnly />
        </label>
        <label>
          <span>Password</span>
          <input value="" readOnly placeholder="Optional" />
        </label>
      </div>
      <div className="section-title-row">
        <h2>Paste anything</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="select-trigger" type="button">
              {format}
              <ChevronDown size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="format-menu" align="end">
            {formatOptions.map((option) => (
              <DropdownMenuItem active={option === format} key={option} onSelect={() => setFormat(option)}>
                {option}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CodeEditor />
      <div className="editor-meta">
        <span>Ln 7, Col 2</span>
        <span>JSON</span>
        <span>256 B</span>
        <span>2.4 KB</span>
        {isDark && (
          <span className="meta-saved">
            <Check size={16} />
            Saved
          </span>
        )}
      </div>
      <div className="editor-actions">
        <Button variant="primary">
          <Archive size={18} />
          Save
        </Button>
        <Button>
          <FileInput size={18} />
          Paste
          <ChevronDown size={16} />
        </Button>
        <Button>
          <ClipboardCopy size={18} />
          Copy latest
        </Button>
        <Button className="share-draft">
          <Link2 size={18} />
          Copy link
        </Button>
      </div>
    </section>
  );
}

function CodeEditor({ compact = false }) {
  const lines = sampleJson.split("\n");
  return (
    <div className={`code-box ${compact ? "compact" : ""}`}>
      <div className="line-numbers">
        {lines.map((_, index) => (
          <span key={`line-${index + 1}`}>{index + 1}</span>
        ))}
      </div>
      <pre>
        <code>
          <span>{"{"}</span>
          {"\n"}
          <span>  "name": </span><span className="syntax-string">"Alice Johnson"</span><span>,</span>
          {"\n"}
          <span>  "email": </span><span className="syntax-string">"alice.johnson@example.com"</span><span>,</span>
          {"\n"}
          <span>  "role": </span><span className="syntax-string">"admin"</span><span>,</span>
          {"\n"}
          <span>  "isActive": </span><span className="syntax-bool">true</span><span>,</span>
          {"\n"}
          <span>  "createdAt": </span><span className="syntax-string">"2024-05-16T14:22:31.123Z"</span>
          {"\n"}
          <span>{"}"}</span>
        </code>
      </pre>
      {compact && <ClipboardCopy className="copy-corner" size={20} />}
    </div>
  );
}

function HistoryPanel({ items, sort, setSort, isDark }) {
  return (
    <section className="history-panel">
      <div className="section-title-row history-heading">
        <h2>History</h2>
        <span>12 saved</span>
      </div>
      <div className="history-toolbar">
        <label className="search-input">
          <Search size={20} />
          <input placeholder="Search history" readOnly />
          {isDark && <kbd>/</kbd>}
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="select-trigger sort-trigger" type="button">
              {sort}
              <ChevronDown size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="sort-menu">
            {sortOptions.map((option) => (
              <DropdownMenuItem active={option === sort} key={option} onSelect={() => setSort(option)}>
                {option}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="pinned-label">
        <Pin size={16} />
        Pinned
      </div>
      <div className="history-list">
        {items.map((item) => (
          <HistoryItem item={item} isDark={isDark} key={item.id} />
        ))}
      </div>
    </section>
  );
}

function HistoryItem({ item, isDark }) {
  return (
    <article className={`history-item ${item.selected ? "selected" : ""}`}>
      <div className="history-leading">
        {isDark ? (item.pinned ? <Pin size={17} /> : <Star size={18} />) : null}
        {!isDark && <Badge tone={item.format.toLowerCase()}>{item.format}</Badge>}
        <div>
          <h3>{isDark && item.selected ? item.title : item.preview}</h3>
          {!isDark && <p>{item.size}</p>}
          {isDark && !item.selected && <p>{item.title}</p>}
        </div>
      </div>
      <Badge tone={item.format.toLowerCase()}>{item.format}</Badge>
      <span>{item.size}</span>
      <span>{item.age}</span>
      <MoreHorizontal className="item-more" size={21} />
    </article>
  );
}

function DetailsPanel({ clipboardId, isDark }) {
  return (
    <aside className="details-panel">
      <div className="details-title-row">
        <h2>Selected clip</h2>
        <div>
          <Pin size={19} />
          <X size={21} />
        </div>
      </div>
      <div className="clip-heading">
        <h3>Create user endpoint</h3>
        <p>
          {clipboardId} <span /> JSON <span /> 256 B {isDark ? "" : " - 2.4 KB"}
        </p>
      </div>
      <div className="details-actions">
        <Button variant="primary">
          <ClipboardCopy size={18} />
          Copy
        </Button>
        <Button>
          <Link2 size={18} />
          Copy link
        </Button>
        <Button variant="danger">
          <Trash2 size={18} />
          Delete
        </Button>
        <Button variant="icon" aria-label="More actions">
          <MoreHorizontal size={21} />
        </Button>
      </div>
      <CodeEditor compact />
      <dl className="meta-list">
        <div><dt>Format</dt><dd>JSON</dd></div>
        <div><dt>Size</dt><dd>256 B (2.4 KB)</dd></div>
        <div><dt>Created</dt><dd>May 16, 2024 at 2:22:31 PM</dd></div>
        <div><dt>Updated</dt><dd>May 16, 2024 at 2:22:31 PM</dd></div>
        <div><dt>Characters</dt><dd>126</dd></div>
        <div><dt>Lines</dt><dd>7</dd></div>
        <div><dt>Pinned</dt><dd>Yes</dd></div>
        <div><dt>ID</dt><dd>{clipboardId}</dd></div>
        <div><dt>Password</dt><dd>Optional, not set</dd></div>
        <div className="tags-row">
          <dt>Tags</dt>
          <dd>
            <Tag label="api" />
            <Tag label="users" />
            <button type="button">Add tag...</button>
          </dd>
        </div>
      </dl>
    </aside>
  );
}

function Tag({ label }) {
  return (
    <span className="tag">
      {label}
      <X size={15} />
    </span>
  );
}

function ImportDropzone() {
  return (
    <section className="import-zone">
      <div>
        <strong>Drop a file to import</strong>
        <span>.txt, .json, .csv up to 5MB</span>
      </div>
      <Upload size={30} />
    </section>
  );
}

export default App;
