const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// Update generate endpoint to use customApiKey everywhere and add nanobanana2
content = content.replace(
  'const { provider, model, systemPrompt, prompt, temperature = 0.7, customEndpoint, customApiKey } = req.body;',
  'const { provider, model, systemPrompt, prompt, temperature = 0.7, customEndpoint, customApiKey } = req.body;'
);

content = content.replace(
  'const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });',
  'const ai = new GoogleGenAI({ apiKey: customApiKey || process.env.GEMINI_API_KEY });'
);

content = content.replace(
  'const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });',
  'const anthropic = new Anthropic({ apiKey: customApiKey || process.env.ANTHROPIC_API_KEY });'
);

content = content.replace(
  'case "nanobanana":',
  'case "nanobanana":\n        case "nanobanana2":'
);

content = content.replace(
  'let apiKey = process.env.OPENAI_API_KEY;',
  'let apiKey = customApiKey || process.env.OPENAI_API_KEY;'
);

content = content.replace(
  'apiKey = process.env.OPENROUTER_API_KEY;',
  'apiKey = customApiKey || process.env.OPENROUTER_API_KEY;'
);

content = content.replace(
  'apiKey = process.env.GEMINI_API_KEY; // Nanobanana uses Gemini key',
  'apiKey = customApiKey || process.env.GEMINI_API_KEY; // Nanobanana uses Gemini key'
);

content = content.replace(
  'apiKey = process.env.NANOGPT_API_KEY;',
  'apiKey = customApiKey || process.env.NANOGPT_API_KEY;'
);

content = content.replace(
  'apiKey = process.env.KIMI_API_KEY;',
  'apiKey = customApiKey || process.env.KIMI_API_KEY;'
);

content = content.replace(
  'apiKey = process.env.MIMO_API_KEY;',
  'apiKey = customApiKey || process.env.MIMO_API_KEY;'
);

fs.writeFileSync('server.ts', content);
