const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Allow large image payloads

// Initialize Gemini AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/extract', async (req, res) => {
  try {
    if (!req.body.image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const matches = req.body.image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid base64 string' });
    }
    
    const mimeType = matches[1];
    const base64Image = matches[2];

    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });

    const prompt = `
      You are an expert Manga reader AI.
      Read ALL the text in the provided image.
      If the image is a full manga page, read every single speech bubble in proper manga reading order (Right-to-Left, Top-to-Bottom).
      Extract the text exactly as it appears, ignoring any background artwork or sound effects.
      Separate the dialogue from different speech bubbles with a blank line.
      Do not include markdown formatting or add extra words.
      At the very end, on a new line, write [MOOD: <mood>] where <mood> is one of: Action, Sad, Happy, Neutral, Suspense.
      
      Format exactly like this:
      First bubble dialogue here
      
      Second bubble dialogue here
      
      [MOOD: Action]
    `;

    const imageParts = [
      {
        inlineData: {
          data: base64Image,
          mimeType
        },
      },
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();

    res.json({ result: text.trim() });
  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({ error: 'Failed to extract text using Gemini API' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🚀 Manga AI Vision Server is running on port ${PORT}`);
  console.log(`=================================================\n`);
});
