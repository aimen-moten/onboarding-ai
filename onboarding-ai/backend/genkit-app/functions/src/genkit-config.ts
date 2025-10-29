import 'dotenv/config'; // Load environment variables from .env file
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';


export const ai = genkit({
  plugins: [
    googleAI({apiKey: process.env.GENKIT_GOOGLE_API_KEY}),
  ],
  model: googleAI.model('gemini-2.5-flash', {
    temperature: 0.8,
  }),
});