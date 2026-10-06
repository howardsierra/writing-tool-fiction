import "dotenv/config";
import express from "express";
import path from "path";
import { handleGenerate, handleGenerateImage, handleModels, type ApiResult } from "./server/handlers.js";

// Initialize express app
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

const send = (res: express.Response, result: ApiResult) => res.status(result.status).json(result.body);

app.post("/api/generate", async (req, res) => send(res, await handleGenerate(req.body)));
app.post("/api/generate-image", async (req, res) => send(res, await handleGenerateImage(req.body)));
app.post("/api/models", async (req, res) => send(res, await handleModels(req.body)));

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Imported lazily so the production bundle doesn't need Vite at runtime.
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
