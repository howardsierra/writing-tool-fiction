const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: 'fake', baseURL: 'http://localhost' });
try {
  openai.images.generate({ prompt: 'test', model: undefined, response_format: 'b64_json', n: 1 });
  console.log('Success');
} catch (e) {
  console.log(e.message);
}
