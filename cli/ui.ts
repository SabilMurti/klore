import * as p from '@clack/prompts';
import color from 'picocolors';

export const THEME = {
  primary: color.cyan,
  secondary: color.dim,
  accent: color.magenta,
  success: color.green,
  warning: color.yellow,
  error: color.red,
  bg: {
    primary: color.bgCyan,
    accent: color.bgMagenta,
  },
};

const LOGO = `
   █  █ █   █▀▀█ █▀▀█ █▀▀ 
   █▄▄█ █   █  █ █▄▄▀ █▀▀ 
   █  █ █▄▄ █▄▄█ █  █ █▄▄ 
      █▄▄▀ █▀▀█ █ █▀█ 
      █  █ █  █ █ █▀▄ 
      █  █ █▄▄█ █ █ █ 
`;

export function printLogo() {
  console.log(THEME.secondary(LOGO));
  console.log(THEME.secondary('   AI-Powered Template Engine\n'));
}

export function printHeader(title: string, subtitle?: string) {
  console.clear();
  printLogo();
  p.intro(THEME.bg.primary(color.black(` ${title} `)));
  if (subtitle) {
    p.log.message(THEME.secondary(subtitle));
  }
}

export function printSection(title: string) {
  console.log('\n' + THEME.accent(`── ${title} ──────────────────────`));
}

export function printKV(key: string, value: string | number) {
  console.log(`${THEME.primary(key.padEnd(15))} ${value}`);
}

export function handleError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  p.note(THEME.error(msg), '❌ Error Occurred');
  // p.cancel('Operation failed'); // Don't cancel here, let caller decide
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
