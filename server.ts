import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// Initialize express app
const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

// API route for chat completion
app.post("/api/generate", async (req, res) => {
  try {
    const { provider, model, systemPrompt, prompt, temperature = 0.7, customEndpoint, customApiKey } = req.body;
    let text = "";

    if (provider === "gemini") {
      const ai = new GoogleGenAI({ apiKey: customApiKey || process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: model || "gemini-3.1-pro-preview",
        contents: prompt,
        config: { systemInstruction: systemPrompt, temperature },
      });
      text = response.text || "";
    } else if (provider === "anthropic") {
      const anthropic = new Anthropic({ apiKey: customApiKey || process.env.ANTHROPIC_API_KEY });
      const response = await anthropic.messages.create({
        model: model || "claude-3-5-sonnet-20241022",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
        temperature,
      });
      // @ts-ignore
      text = response.content[0].text;
    } else {
      // OpenAI and OpenAI-compatible providers
      let apiKey = customApiKey || process.env.OPENAI_API_KEY;
      let baseURL = undefined;

      switch (provider) {
        case "openrouter":
          apiKey = customApiKey || process.env.OPENROUTER_API_KEY;
          baseURL = "https://openrouter.ai/api/v1";
          break;
        case "nanobanana":
        case "nanobanana2":
          apiKey = customApiKey || process.env.GEMINI_API_KEY; // Nanobanana uses Gemini key
          baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/"; 
          break;
        case "nanogpt":
          apiKey = customApiKey || process.env.NANOGPT_API_KEY;
          baseURL = "https://nano-gpt.com/api/v1"; 
          break;
        case "kimi":
          apiKey = customApiKey || process.env.KIMI_API_KEY;
          baseURL = "https://api.moonshot.cn/v1"; 
          break;
        case "mimo":
          apiKey = customApiKey || process.env.MIMO_API_KEY;
          baseURL = "https://api.mimo.ai/v1"; 
          break;
        case "custom":
          apiKey = customApiKey || "dummy-local-key";
          baseURL = customEndpoint;
          break;
      }

      if (!apiKey) {
        return res.status(400).json({ error: `API key for ${provider} is not configured.` });
      }

      const openai = new OpenAI({ apiKey, baseURL });
      const response = await openai.chat.completions.create({
        model: model || "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature,
      });
      text = response.choices[0].message.content || "";
    }

    res.json({ text });
  } catch (error: any) {
    console.error("Error generating text:", error);
    res.status(500).json({ error: error.message || "Failed to generate text." });
  }
});

// API route for image generation
app.post("/api/generate-image", async (req, res) => {
  try {
    const { provider, prompt, referenceImage, customApiKey } = req.body;
    let imageUrl = "";
    
    // Increase body size limit for base64 images if needed, but express.json() default is 100kb. 
    // We should make sure express can handle large payloads in server.ts
    
    if (provider === "nanobanana" || provider === "nanobanana2") {
      const apiKey = customApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "Gemini API key is not configured for NanoBanana." });
      }

      let finalPrompt = prompt;
      if (referenceImage) {
        try {
          const ai = new GoogleGenAI({ apiKey });
          // Extract mime type and base64 data
          const matches = referenceImage.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const mimeType = matches[1];
            const data = matches[2];
            const response = await ai.models.generateContent({
              model: "gemini-3.1-pro-preview",
              contents: [
                { 
                  role: "user", 
                  parts: [
                    { text: "Analyze this image in extremely high detail to create an image generation prompt. Focus specifically on the exact art style, camera angle, composition, color palette, lighting, subject matter, and mood. Provide a vivid, descriptive prompt that would recreate this aesthetic." },
                    { inlineData: { data, mimeType } }
                  ]
                }
              ]
            });
            const imageDesc = response.text || "";
            finalPrompt = `${prompt}\n\nStyle & Composition Reference: ${imageDesc}`;
          }
        } catch (e) {
          console.error("Error analyzing reference image:", e);
          // Fallback to original prompt if analysis fails
        }
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: finalPrompt }],
          parameters: { sampleCount: 1, aspectRatio: "1:1" }
        })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(`NanoBanana Image Error: ${err.error?.message || response.statusText}`);
      }
      const data = await response.json();
      const base64 = data.predictions?.[0]?.bytesBase64Encoded;
      if (base64) {
        imageUrl = `data:image/jpeg;base64,${base64}`;
      } else {
        throw new Error("No image generated.");
      }
    } else if (provider === "openrouter" || provider === "nanogpt") {
      const apiKey = customApiKey || (provider === "openrouter" ? process.env.OPENROUTER_API_KEY : process.env.NANOGPT_API_KEY);
      if (!apiKey) {
        return res.status(400).json({ error: `API key for ${provider} is not configured.` });
      }
      const baseURL = provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://nano-gpt.com/api/v1";
      
      const openai = new OpenAI({ apiKey, baseURL });
      // Both openrouter and nanogpt provide openai-compatible image gen
      const response = await openai.images.generate({
        prompt: prompt,
        model: provider === "nanogpt" ? "dall-e-3" : undefined, // let openrouter use default if unspec, or specify empty
        response_format: "b64_json",
        n: 1,
      });
      const b64 = response.data[0]?.b64_json;
      const url = response.data[0]?.url;
      if (b64) {
        imageUrl = `data:image/jpeg;base64,${b64}`;
      } else if (url) {
        imageUrl = url;
      } else {
        throw new Error("No image generated.");
      }
    } else {
      return res.status(400).json({ error: "Unsupported image provider." });
    }

    res.json({ imageUrl });
  } catch (error: any) {
    console.error("Error generating image:", error);
    res.status(500).json({ error: error.message || "Failed to generate image." });
  }
});

// API route to fetch models
app.post("/api/models", async (req, res) => {
  try {
    const { provider, customEndpoint, customApiKey } = req.body;
    let url = "";
    let headers: Record<string, string> = {};

    if (provider === "openai") {
      url = "https://api.openai.com/v1/models";
      headers = { Authorization: `Bearer ${customApiKey || process.env.OPENAI_API_KEY}` };
    } else if (provider === "openrouter") {
      url = "https://openrouter.ai/api/v1/models";
      if (customApiKey || process.env.OPENROUTER_API_KEY) {
        headers = { Authorization: `Bearer ${customApiKey || process.env.OPENROUTER_API_KEY}` };
      }
    } else if (provider === "nanobanana" || provider === "nanobanana2") {
      url = "https://generativelanguage.googleapis.com/v1beta/openai/models";
      if (customApiKey || process.env.GEMINI_API_KEY) headers = { Authorization: `Bearer ${customApiKey || process.env.GEMINI_API_KEY}` };
    } else if (provider === "nanogpt") {
      url = "https://nano-gpt.com/api/v1/models";
      if (customApiKey || process.env.NANOGPT_API_KEY) headers = { Authorization: `Bearer ${customApiKey || process.env.NANOGPT_API_KEY}` };
    } else if (provider === "kimi") {
      url = "https://api.moonshot.cn/v1/models";
      if (customApiKey || process.env.KIMI_API_KEY) headers = { Authorization: `Bearer ${customApiKey || process.env.KIMI_API_KEY}` };
    } else if (provider === "mimo") {
      url = "https://api.mimo.ai/v1/models";
      if (customApiKey || process.env.MIMO_API_KEY) headers = { Authorization: `Bearer ${customApiKey || process.env.MIMO_API_KEY}` };
    } else if (provider === "custom" && customEndpoint) {
      url = customEndpoint.replace(/\/+$/, '') + "/models";
      if (customApiKey) {
        headers = { Authorization: `Bearer ${customApiKey}` };
      }
    } else {
      return res.json({ models: [] });
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
       throw new Error(`Failed to fetch models: ${response.statusText}`);
    }
    const data = await response.json();
    
    let models: string[] = [];
    if (data && Array.isArray(data.data)) {
       models = data.data.map((m: any) => m.id);
    } else if (Array.isArray(data)) {
       models = data.map((m: any) => m.id || m);
    }
    
    // Sort models alphabetically for better UX
    models.sort();

    res.json({ models });
  } catch (error: any) {
    console.error("Error fetching models:", error);
    res.status(500).json({ error: error.message || "Failed to fetch models." });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
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
