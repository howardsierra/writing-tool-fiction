import { handleGenerate } from "../server/handlers.js";

// Vercel serverless function: POST /api/generate
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      return res.status(400).json({ error: "Invalid JSON body." });
    }
  }
  const result = await handleGenerate(body);
  res.status(result.status).json(result.body);
}
