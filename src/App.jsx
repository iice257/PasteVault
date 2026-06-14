import LandingPage from "./pages/LandingPage";
import ClipboardPage from "./pages/ClipboardPage";
import { clipboardIdPattern } from "./features/clipboard/clipboard-store";

function clipboardIdFromPath(path) {
  const match = path.match(/^\/clip\/([^/]+)$/);
  if (!match) return "";
  try {
    const clipboardId = decodeURIComponent(match[1]).trim();
    return clipboardIdPattern.test(clipboardId) ? clipboardId : "";
  } catch {
    return "";
  }
}

function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/") {
    window.history.replaceState(null, "", "/new");
    return <LandingPage />;
  }

  if (path === "/new") {
    return <LandingPage />;
  }

  const clipboardId = clipboardIdFromPath(path);
  if (clipboardId) {
    const view = new URLSearchParams(window.location.search).get("view");
    return (
      <ClipboardPage
        clipboardId={clipboardId}
        initialHistory={view === "history"}
        initialSettings={view === "settings"}
      />
    );
  }

  window.history.replaceState(null, "", "/new");
  return <LandingPage />;
}

export default App;
