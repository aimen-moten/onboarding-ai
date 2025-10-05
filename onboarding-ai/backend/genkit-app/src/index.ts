import 'dotenv/config'; // Load environment variables from .env file
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { generateCourseFlow } from './genkit-flows/course-generator.js';

export const ai = genkit({
  plugins: [
    googleAI(),
  ],
  flows: [
    generateCourseFlow
  ],
  model: googleAI.model('gemini-2.5-flash', {
    temperature: 0.8,
  }),
});