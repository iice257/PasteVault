import LandingPage from "./pages/LandingPage";
import ClipboardPage from "./pages/ClipboardPage";
import { defaultClipboardId, getClipboardId } from "./features/clipboard/clipboard-store";

function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/") {
    return <LandingPage />;
  }

  if (path === "/history") {
    return <ClipboardPage clipboardId={defaultClipboardId} initialHistory />;
  }

  if (path === "/settings") {
    return <ClipboardPage clipboardId={defaultClipboardId} initialSettings />;
  }

  return <ClipboardPage clipboardId={getClipboardId()} />;
}

export default App;
