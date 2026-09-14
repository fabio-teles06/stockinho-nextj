import { cp, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const output = path.join(root, '.next/standalone');
await access(path.join(output, 'server.js'));
await mkdir(path.join(output, '.next'), { recursive: true });
await cp(path.join(root, '.next/static'), path.join(output, '.next/static'), { recursive: true });
await cp(path.join(root, 'public'), path.join(output, 'public'), { recursive: true });
console.log('Next.js standalone preparado com os arquivos estáticos.');
