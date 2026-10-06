import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Framework-agnostic API handlers shared by the local Express server (server.ts)
 * and the Vercel serverless functions (api/*.ts).
 */
export interface ApiResult {
  status: number;
  body: any;
}

const result = (status: number, body: any): ApiResult => ({ status, body });

// API route for chat completion
export async function handleGenerate(reqBody: any): Promise<ApiResult> {
  try {
    const { provider, model, systemPrompt = "", prompt, temperature = 0.7, customEndpoint, customApiKey } = reqBody || {};
    if (typeof prompt !== "string" || !prompt.trim()) {
      return result(400, { error: "A prompt is required." });
    }
    let text = "";

    if (provider === "gemini") {
      const geminiKey = customApiKey || process.env.GEMINI_API_KEY;
      if (!geminiKey) return result(400, { error: "Gemini API key is missing. Add it in Settings." });
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: model || "gemini-3.1-pro-preview",
        contents: prompt,
        config: { systemInstruction: systemPrompt, temperature },
      });
      text = response.text || "";
    } else if (provider === "anthropic") {
      const anthropicKey = customApiKey || process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) return result(400, { error: "Anthropic API key is missing. Add it in Settings." });
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const claudeModel: string = model || "claude-opus-5-5";
      // Newer Claude models choose their own sampling and reject `temperature`.
      const rejectsSampling = /^claude-(fable|mythos|opus-5|sonnet-5|opus-4-[78])/.test(claudeModel);
      // Server-side fallback re-runs a declined request on a suitable model within the same call.
      const supportsFallback = /^claude-(fable-5-1|opus-5-5|opus-5$|sonnet-5-5)/.test(claudeModel);
      const response = await anthropic.beta.messages.create({
        model: claudeModel,
        max_tokens: 16000,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
        ...(rejectsSampling ? {} : { temperature }),
        ...(supportsFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      if (response.stop_reason === "refusal") {
        return result(422, { error: "The model declined this request. Try rephrasing it." });
      }
      text = response.content
        .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
        .map(block => block.text)
        .join("");
      if (response.stop_reason === "max_tokens") text += "\n\n[Response truncated]";
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
          if (!customEndpoint) {
            return result(400, { error: "No custom endpoint URL configured." });
          }
          apiKey = customApiKey || "dummy-local-key";
          baseURL = customEndpoint;
          break;
      }

      if (!apiKey) {
        return result(400, { error: `API key for ${provider} is missing. Please configure it in Settings.` });
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
      text = response.choices[0]?.message?.content || "";
    }

    return result(200, { text });
  } catch (error: any) {
    console.error("Error generating text:", error);
    return result(500, { error: error.message || "Failed to generate text." });
  }
}

// API route for image generation
export async function handleGenerateImage(reqBody: any): Promise<ApiResult> {
  try {
    const { provider, model, prompt, referenceImage, customApiKey } = reqBody || {};
    if (typeof prompt !== "string" || !prompt.trim()) {
      return result(400, { error: "An image prompt is required." });
    }
    let imageUrl = "";

    if (provider === "nanobanana" || provider === "nanobanana2") {
      const apiKey = customApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return result(400, { error: "Gemini API key is missing. Please configure it in Settings." });
      }
      const imageModel: string = model || (provider === "nanobanana2" ? "gemini-3.1-flash-image-preview" : "gemini-2.5-flash-image");

      if (imageModel.startsWith("imagen")) {
        // Legacy Imagen models use the predict endpoint and take no reference image.
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: "1:1" } }),
        });
        const data: any = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(`Imagen error: ${data.error?.message || response.statusText}`);
        const base64 = data.predictions?.[0]?.bytesBase64Encoded;
        if (!base64) throw new Error("No image was generated.");
        imageUrl = `data:image/png;base64,${base64}`;
      } else {
        // Gemini image models ("Nano Banana") accept the reference image directly.
        const ai = new GoogleGenAI({ apiKey });
        const parts: any[] = [{ text: prompt }];
        const match = typeof referenceImage === "string" ? referenceImage.match(/^data:([A-Za-z0-9.+\/-]+);base64,(.+)$/) : null;
        if (match) {
          parts.push({ text: "Use the attached image as a reference for art style, palette, lighting and composition." });
          parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
        const response = await ai.models.generateContent({
          model: imageModel,
          contents: [{ role: "user", parts }],
          config: { responseModalities: ["IMAGE", "TEXT"] },
        });
        const imagePart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
        if (!imagePart?.inlineData?.data) {
          throw new Error(response.text ? `No image returned: ${response.text.slice(0, 200)}` : "No image was generated.");
        }
        imageUrl = `data:${imagePart.inlineData.mimeType || "image/png"};base64,${imagePart.inlineData.data}`;
      }
    } else if (provider === "openrouter" || provider === "nanogpt") {
      const apiKey = customApiKey || (provider === "openrouter" ? process.env.OPENROUTER_API_KEY : process.env.NANOGPT_API_KEY);
      if (!apiKey) {
        return result(400, { error: `API key for ${provider} is missing. Please configure it in Settings.` });
      }
      const baseURL = provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://nano-gpt.com/api/v1";
      
      const openai = new OpenAI({ apiKey, baseURL });
      // Both openrouter and nanogpt provide openai-compatible image gen
      const response = await openai.images.generate({
        prompt: prompt,
        model: model || (provider === "nanogpt" ? "dall-e-3" : undefined),
        response_format: "b64_json",
        n: 1,
      });
      const b64 = response.data?.[0]?.b64_json;
      const url = response.data?.[0]?.url;
      if (b64) {
        imageUrl = `data:image/jpeg;base64,${b64}`;
      } else if (url) {
        imageUrl = url;
      } else {
        throw new Error("No image generated.");
      }
    } else {
      return result(400, { error: "Unsupported image provider." });
    }

    return result(200, { imageUrl });
  } catch (error: any) {
    console.error("Error generating image:", error);
    return result(500, { error: error.message || "Failed to generate image." });
  }
}

// API route to fetch models
export async function handleModels(reqBody: any): Promise<ApiResult> {
  try {
    const { provider, customEndpoint, customApiKey } = reqBody;
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
      return result(200, { models: [] });
    }

    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
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

    return result(200, { models });
  } catch (error: any) {
    console.error("Error fetching models:", error);
    return result(500, { error: error.message || "Failed to fetch models." });
  }
}
