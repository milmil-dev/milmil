import { generateFiles } from 'fumadocs-openapi';
import { createOpenAPI } from 'fumadocs-openapi/server';

const openapi = createOpenAPI({
  input: ['./content/docs/api/openapi.json'],
});

await generateFiles({
  input: openapi,
  output: './content/docs/api',
  meta: true,
});

console.log('API docs generated successfully.');
