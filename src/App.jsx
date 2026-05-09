import LandingPage from "./pages/LandingPage";
import ClipboardPage from "./pages/ClipboardPage";
import { getClipboardId } from "./features/clipboard/clipboard-store";

function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/") {
    return <LandingPage />;
  }

  return <ClipboardPage clipboardId={getClipboardId()} />;
}

export default App;