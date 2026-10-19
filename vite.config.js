import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = fileURLToPath(new URL("./src", import.meta.url));

// Serves the Vercel-style functions in /api during `vite dev`, using the in-memory store
// when no Upstash credentials are configured.
const apiRoutes = [
  { pattern: /^\/api\/clip\/([^/?]+)$/, file: "/api/clip/[id].js", param: "id" },
  { pattern: /^\/api\/session\/([^/?]+)$/, file: "/api/session/[id].js", param: "id" },
  { pattern: /^\/api\/presence\/([^/?]+)$/, file: "/api/presence/[id].js", param: "id" },
  { pattern: /^\/api\/code\/([^/?]+)$/, file: "/api/code/[code].js", param: "code" },
  { pattern: /^\/api\/code$/, file: "/api/code.js" },
  { pattern: /^\/api\/file\/.+$/, file: "/api/file/[...path].js" },
  { pattern: /^\/api\/health$/, file: "/api/health.js" }
];

function devApi() {
  return {
    name: "pastevault-dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0];
        const route = apiRoutes.find((candidate) => candidate.pattern.test(pathname));
        if (!route) return next();
        try {
          const match = pathname.match(route.pattern);
          req.query = route.param ? { [route.param]: decodeURIComponent(match[1]) } : {};
          const { default: handler } = await server.ssrLoadModule(route.file);
          await handler(req, res);
        } catch (error) {
          server.config.logger.error(`[dev-api] ${error.message}`);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Dev API error." }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  resolve: {
    alias: {
      "@": path.resolve(srcRoot)
    }
  }
});
