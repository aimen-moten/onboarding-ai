import './genkit-config.js';
import { onCallGenkit } from 'firebase-functions/https';
import { generateCourseFlow } from './genkit-flows/course-generator';

export const courseGenerator = onCallGenkit(generateCourseFlow);