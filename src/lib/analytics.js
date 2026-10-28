import { inject } from "@vercel/analytics";

// A clipboard link is the secret for an unlocked clipboard, and the URL fragment carries the write
// token. Page views keep the route only: no clipboard id, no query string, no fragment.
export function redactPageUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/^\/clip\/[^/]+/, "/clip/[id]");
  return url.toString();
}

export function startAnalytics() {
  inject({
    mode: "production",
    beforeSend: (event) => ({ ...event, url: redactPageUrl(event.url) }),
  });
}
