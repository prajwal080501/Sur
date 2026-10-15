import 'reflect-metadata';
import { createApplication } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const app = await createApplication();
await app.listen(port);
