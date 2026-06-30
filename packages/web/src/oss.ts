// Open-source dependencies credited in Settings → About. Curated from the
// packages' runtime dependencies (+ key build tooling). Keep in sync when adding
// notable libraries.

export interface OssDep {
  name: string;
  license: string;
  url: string;
}

export const OSS_DEPENDENCIES: OssDep[] = [
  // Frontend
  { name: 'react', license: 'MIT', url: 'https://github.com/facebook/react' },
  { name: 'react-dom', license: 'MIT', url: 'https://github.com/facebook/react' },
  { name: 'd3', license: 'ISC', url: 'https://github.com/d3/d3' },
  { name: 'shepherd.js', license: 'MIT', url: 'https://github.com/shepherd-pro/shepherd' },
  { name: 'vite', license: 'MIT', url: 'https://github.com/vitejs/vite' },
  { name: 'tailwindcss', license: 'MIT', url: 'https://github.com/tailwindlabs/tailwindcss' },
  { name: 'typescript', license: 'Apache-2.0', url: 'https://github.com/microsoft/TypeScript' },
  // Backend
  { name: 'express', license: 'MIT', url: 'https://github.com/expressjs/express' },
  { name: 'cors', license: 'MIT', url: 'https://github.com/expressjs/cors' },
  { name: '@modelcontextprotocol/sdk', license: 'MIT', url: 'https://github.com/modelcontextprotocol/typescript-sdk' },
  { name: 'swagger-ui-express', license: 'MIT', url: 'https://github.com/scottie1984/swagger-ui-express' },
  { name: '@asteasolutions/zod-to-openapi', license: 'MIT', url: 'https://github.com/asteasolutions/zod-to-openapi' },
  // Core / data / AI
  { name: 'pg', license: 'MIT', url: 'https://github.com/brianc/node-postgres' },
  { name: 'pgvector', license: 'PostgreSQL', url: 'https://github.com/pgvector/pgvector' },
  { name: 'zod', license: 'MIT', url: 'https://github.com/colinhacks/zod' },
  { name: 'argon2', license: 'MIT', url: 'https://github.com/ranisalt/node-argon2' },
  { name: 'jsonwebtoken', license: 'MIT', url: 'https://github.com/auth0/node-jsonwebtoken' },
  { name: 'chrono-i18n', license: 'MIT', url: 'https://github.com/jacquesh82/chrono-i18n' },
  { name: 'dotenv', license: 'BSD-2-Clause', url: 'https://github.com/motdotla/dotenv' },
  { name: 'nodemailer', license: 'MIT', url: 'https://github.com/nodemailer/nodemailer' },
  { name: 'mjml', license: 'MIT', url: 'https://github.com/mjmlio/mjml' },
  { name: 'google-auth-library', license: 'Apache-2.0', url: 'https://github.com/googleapis/google-auth-library-nodejs' },
  { name: '@anthropic-ai/sdk', license: 'MIT', url: 'https://github.com/anthropics/anthropic-sdk-typescript' },
  { name: '@huggingface/transformers', license: 'Apache-2.0', url: 'https://github.com/huggingface/transformers.js' },
];
