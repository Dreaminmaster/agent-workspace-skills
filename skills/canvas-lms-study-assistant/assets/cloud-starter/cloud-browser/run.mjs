import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
const temporary = fileURLToPath(new URL('../../.tmp/', import.meta.url));
await mkdir(temporary, { recursive: true, mode: 0o700 });
const child = spawn(process.execPath, [fileURLToPath(new URL('node_modules/wrangler/bin/wrangler.js', import.meta.url)), ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL('./', import.meta.url)), stdio: 'inherit',
  env: { ...process.env, XDG_CONFIG_HOME: temporary + 'cloudflare-config', WRANGLER_LOG_PATH: temporary + 'cloudflare-logs', WRANGLER_SEND_METRICS: 'false' }
});
child.on('exit', code => process.exit(code || 0));
