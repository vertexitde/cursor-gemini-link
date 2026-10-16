import fs from 'node:fs';
import path from 'node:path';
import {cursorRoot, supportedVersions} from './build-support.mjs';

const root = cursorRoot();
const version = process.argv.includes('--restore')
  ? JSON.parse(fs.readFileSync(new URL('./installed.json', import.meta.url), 'utf8')).version
  : JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
// Builds up to 3.22.12 have an installer of their own; later ones share one.
const own = new URL('./install-' + version + '.mjs', import.meta.url);
if (fs.existsSync(own)) await import(own);
else if (supportedVersions.includes(version)) await import('./install-build.mjs');
else throw new Error('Unsupported Cursor version: ' + version);
