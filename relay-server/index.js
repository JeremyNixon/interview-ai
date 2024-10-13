import { RealtimeRelay } from './lib/relay.js';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import express from 'express';
import cors from 'cors';

dotenv.config({ override: true });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error(
    `Environment variable "OPENAI_API_KEY" is required.\n` +
      `Please set it in your .env file.`
  );
  process.exit(1);
}

const PORT = parseInt(process.env.PORT) || 8081;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const relay = new RealtimeRelay(OPENAI_API_KEY);

app.post('/analyzeImage', async (req, res) => {
  try {
    const { imageData } = req.body;
    const response = await openai.chat.completions.create({
      model: "gpt-4o",  // Updated to use GPT-4o
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What's in this image?" },
            {
              type: "image_url",
              image_url: {
                url: imageData,
              },
            },
          ],
        },
      ],
    });
    res.json({ result: response.choices[0].message.content });
  } catch (error) {
    console.error('Error analyzing image:', error);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
});

relay.listen(PORT);
app.listen(PORT + 1, () => {
  console.log(`Express server listening on port ${PORT + 1}`);
});
