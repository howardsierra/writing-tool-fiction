const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

const oldImageRoute = content.substring(
  content.indexOf('// API route for image generation'),
  content.indexOf('// API route to fetch models')
);

const newImageRoute = `// API route for image generation
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
          const matches = referenceImage.match(/^data:([A-Za-z-+\\/]+);base64,(.+)$/);
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
            finalPrompt = \`\${prompt}\\n\\nStyle & Composition Reference: \${imageDesc}\`;
          }
        } catch (e) {
          console.error("Error analyzing reference image:", e);
          // Fallback to original prompt if analysis fails
        }
      }

      const response = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=\${apiKey}\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: finalPrompt }],
          parameters: { sampleCount: 1, aspectRatio: "1:1" }
        })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(\`NanoBanana Image Error: \${err.error?.message || response.statusText}\`);
      }
      const data = await response.json();
      const base64 = data.predictions?.[0]?.bytesBase64Encoded;
      if (base64) {
        imageUrl = \`data:image/jpeg;base64,\${base64}\`;
      } else {
        throw new Error("No image generated.");
      }
    } else if (provider === "openrouter" || provider === "nanogpt") {
      const apiKey = customApiKey || (provider === "openrouter" ? process.env.OPENROUTER_API_KEY : process.env.NANOGPT_API_KEY);
      if (!apiKey) {
        return res.status(400).json({ error: \`API key for \${provider} is not configured.\` });
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
        imageUrl = \`data:image/jpeg;base64,\${b64}\`;
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
});\n\n`;

content = content.replace(oldImageRoute, newImageRoute);

// Also need to patch the models endpoint to use customApiKey and support nanobanana2!
content = content.replace(
  'const { provider, customEndpoint, customApiKey } = req.body;',
  'const { provider, customEndpoint, customApiKey } = req.body;' // no-op just to find it easily if needed, but it's already there
);

content = content.replace(
  'if (provider === "nanobanana") {',
  'if (provider === "nanobanana" || provider === "nanobanana2") {'
);

// We should properly pass customApiKey in the /api/models fetch. Let's fix that block.
const oldModelsStart = content.indexOf('if (provider === "openai") {');
const oldModelsEnd = content.indexOf('const response = await fetch(url, { headers });');

const newModelsBlock = `if (provider === "openai") {
      url = "https://api.openai.com/v1/models";
      headers = { Authorization: \`Bearer \${customApiKey || process.env.OPENAI_API_KEY}\` };
    } else if (provider === "openrouter") {
      url = "https://openrouter.ai/api/v1/models";
      if (customApiKey || process.env.OPENROUTER_API_KEY) {
        headers = { Authorization: \`Bearer \${customApiKey || process.env.OPENROUTER_API_KEY}\` };
      }
    } else if (provider === "nanobanana" || provider === "nanobanana2") {
      url = "https://generativelanguage.googleapis.com/v1beta/openai/models";
      if (customApiKey || process.env.GEMINI_API_KEY) headers = { Authorization: \`Bearer \${customApiKey || process.env.GEMINI_API_KEY}\` };
    } else if (provider === "nanogpt") {
      url = "https://nano-gpt.com/api/v1/models";
      if (customApiKey || process.env.NANOGPT_API_KEY) headers = { Authorization: \`Bearer \${customApiKey || process.env.NANOGPT_API_KEY}\` };
    } else if (provider === "kimi") {
      url = "https://api.moonshot.cn/v1/models";
      if (customApiKey || process.env.KIMI_API_KEY) headers = { Authorization: \`Bearer \${customApiKey || process.env.KIMI_API_KEY}\` };
    } else if (provider === "mimo") {
      url = "https://api.mimo.ai/v1/models";
      if (customApiKey || process.env.MIMO_API_KEY) headers = { Authorization: \`Bearer \${customApiKey || process.env.MIMO_API_KEY}\` };
    } else if (provider === "custom" && customEndpoint) {
      url = customEndpoint.replace(/\\/+$/, '') + "/models";
      if (customApiKey) {
        headers = { Authorization: \`Bearer \${customApiKey}\` };
      }
    } else {
      return res.json({ models: [] });
    }

    `;
content = content.substring(0, oldModelsStart) + newModelsBlock + content.substring(oldModelsEnd);

fs.writeFileSync('server.ts', content);
