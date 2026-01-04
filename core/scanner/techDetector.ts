import * as fs from 'fs';
import * as path from 'path';
import { ScannedFile, TechStack } from '../types';

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface ComposerJson {
  name?: string;
  require?: Record<string, string>;
  'require-dev'?: Record<string, string>;
}

// Framework indicators
const FRAMEWORK_INDICATORS: Record<string, { files: string[]; npmDeps: string[]; composerDeps: string[] }> = {
  'next.js': {
    files: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    npmDeps: ['next'],
    composerDeps: [],
  },
  'nuxt': {
    files: ['nuxt.config.js', 'nuxt.config.ts'],
    npmDeps: ['nuxt'],
    composerDeps: [],
  },
  'react': {
    files: [],
    npmDeps: ['react', 'react-dom'],
    composerDeps: [],
  },
  'vue': {
    files: ['vue.config.js'],
    npmDeps: ['vue'],
    composerDeps: [],
  },
  'angular': {
    files: ['angular.json'],
    npmDeps: ['@angular/core'],
    composerDeps: [],
  },
  'svelte': {
    files: ['svelte.config.js'],
    npmDeps: ['svelte'],
    composerDeps: [],
  },
  'sveltekit': {
    files: ['svelte.config.js'],
    npmDeps: ['@sveltejs/kit'],
    composerDeps: [],
  },
  'laravel': {
    files: ['artisan'],
    npmDeps: [],
    composerDeps: ['laravel/framework'],
  },
  'symfony': {
    files: ['symfony.lock'],
    npmDeps: [],
    composerDeps: ['symfony/framework-bundle'],
  },
  'django': {
    files: ['manage.py'],
    npmDeps: [],
    composerDeps: [],
  },
  'express': {
    files: [],
    npmDeps: ['express'],
    composerDeps: [],
  },
  'fastify': {
    files: [],
    npmDeps: ['fastify'],
    composerDeps: [],
  },
  'electron': {
    files: [],
    npmDeps: ['electron'],
    composerDeps: [],
  },
  'astro': {
    files: ['astro.config.mjs', 'astro.config.ts'],
    npmDeps: ['astro'],
    composerDeps: [],
  },
  'remix': {
    files: [],
    npmDeps: ['@remix-run/react'],
    composerDeps: [],
  },
  'gatsby': {
    files: ['gatsby-config.js', 'gatsby-config.ts'],
    npmDeps: ['gatsby'],
    composerDeps: [],
  },
};

// Additional stacks/libraries to detect
const STACK_INDICATORS: Record<string, { npmDeps: string[]; composerDeps: string[]; files: string[] }> = {
  // Laravel ecosystem
  'livewire': { npmDeps: [], composerDeps: ['livewire/livewire'], files: [] },
  'inertia': { npmDeps: ['@inertiajs/react', '@inertiajs/vue3', '@inertiajs/svelte'], composerDeps: ['inertiajs/inertia-laravel'], files: [] },
  'breeze': { npmDeps: [], composerDeps: ['laravel/breeze'], files: [] },
  'jetstream': { npmDeps: [], composerDeps: ['laravel/jetstream'], files: [] },
  'sanctum': { npmDeps: [], composerDeps: ['laravel/sanctum'], files: [] },
  'passport': { npmDeps: [], composerDeps: ['laravel/passport'], files: [] },
  'horizon': { npmDeps: [], composerDeps: ['laravel/horizon'], files: [] },
  'telescope': { npmDeps: [], composerDeps: ['laravel/telescope'], files: [] },
  'filament': { npmDeps: [], composerDeps: ['filament/filament'], files: [] },
  'spatie-permission': { npmDeps: [], composerDeps: ['spatie/laravel-permission'], files: [] },
  
  // React ecosystem
  'shadcn-ui': { npmDeps: [], composerDeps: [], files: ['components.json'] },
  'tanstack-query': { npmDeps: ['@tanstack/react-query'], composerDeps: [], files: [] },
  'tanstack-router': { npmDeps: ['@tanstack/react-router'], composerDeps: [], files: [] },
  'zustand': { npmDeps: ['zustand'], composerDeps: [], files: [] },
  'redux': { npmDeps: ['@reduxjs/toolkit', 'redux'], composerDeps: [], files: [] },
  'react-hook-form': { npmDeps: ['react-hook-form'], composerDeps: [], files: [] },
  'framer-motion': { npmDeps: ['framer-motion'], composerDeps: [], files: [] },
  
  // Vue ecosystem
  'pinia': { npmDeps: ['pinia'], composerDeps: [], files: [] },
  'vuex': { npmDeps: ['vuex'], composerDeps: [], files: [] },
  'vue-router': { npmDeps: ['vue-router'], composerDeps: [], files: [] },
  
  // CSS/Styling
  'tailwindcss': { npmDeps: ['tailwindcss'], composerDeps: [], files: ['tailwind.config.js', 'tailwind.config.ts'] },
  'bootstrap': { npmDeps: ['bootstrap'], composerDeps: [], files: [] },
  'sass': { npmDeps: ['sass', 'node-sass'], composerDeps: [], files: [] },
  'styled-components': { npmDeps: ['styled-components'], composerDeps: [], files: [] },
  'emotion': { npmDeps: ['@emotion/react'], composerDeps: [], files: [] },
  
  // Testing
  'jest': { npmDeps: ['jest'], composerDeps: [], files: ['jest.config.js', 'jest.config.ts'] },
  'vitest': { npmDeps: ['vitest'], composerDeps: [], files: ['vitest.config.ts'] },
  'cypress': { npmDeps: ['cypress'], composerDeps: [], files: ['cypress.config.js', 'cypress.config.ts'] },
  'playwright': { npmDeps: ['@playwright/test'], composerDeps: [], files: ['playwright.config.ts'] },
  'phpunit': { npmDeps: [], composerDeps: ['phpunit/phpunit'], files: ['phpunit.xml'] },
  'pest': { npmDeps: [], composerDeps: ['pestphp/pest'], files: [] },
  
  // API/GraphQL
  'graphql': { npmDeps: ['graphql', '@apollo/client'], composerDeps: [], files: [] },
  'trpc': { npmDeps: ['@trpc/server', '@trpc/client'], composerDeps: [], files: [] },
  'prisma': { npmDeps: ['prisma', '@prisma/client'], composerDeps: [], files: ['prisma/schema.prisma'] },
  'drizzle': { npmDeps: ['drizzle-orm'], composerDeps: [], files: [] },
  
  // Auth
  'next-auth': { npmDeps: ['next-auth'], composerDeps: [], files: [] },
  'clerk': { npmDeps: ['@clerk/nextjs', '@clerk/clerk-react'], composerDeps: [], files: [] },
  'lucia': { npmDeps: ['lucia'], composerDeps: [], files: [] },
};

// Bundler detection
const BUNDLER_INDICATORS: Record<string, { files: string[]; deps: string[] }> = {
  'vite': { files: ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'], deps: ['vite'] },
  'webpack': { files: ['webpack.config.js', 'webpack.config.ts'], deps: ['webpack'] },
  'parcel': { files: [], deps: ['parcel'] },
  'esbuild': { files: [], deps: ['esbuild'] },
  'rollup': { files: ['rollup.config.js', 'rollup.config.ts'], deps: ['rollup'] },
  'turbopack': { files: [], deps: [] }, // Next.js built-in
  'bun': { files: [], deps: [] }, // Bun bundler
};

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.py': 'Python',
  '.php': 'PHP',
  '.blade.php': 'Blade',
  '.rb': 'Ruby',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.swift': 'Swift',
  '.cs': 'C#',
  '.cpp': 'C++',
  '.c': 'C',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
};

async function readPackageJson(rootPath: string): Promise<PackageJson | null> {
  const packageJsonPath = path.join(rootPath, 'package.json');
  try {
    const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

async function readComposerJson(rootPath: string): Promise<ComposerJson | null> {
  const composerJsonPath = path.join(rootPath, 'composer.json');
  try {
    const content = await fs.promises.readFile(composerJsonPath, 'utf-8');
    return JSON.parse(content) as ComposerJson;
  } catch {
    return null;
  }
}

function detectPackageManagers(rootPath: string): string[] {
  const managers: string[] = [];
  
  // JavaScript/Node
  if (fs.existsSync(path.join(rootPath, 'pnpm-lock.yaml'))) managers.push('pnpm');
  else if (fs.existsSync(path.join(rootPath, 'yarn.lock'))) managers.push('yarn');
  else if (fs.existsSync(path.join(rootPath, 'bun.lockb'))) managers.push('bun');
  else if (fs.existsSync(path.join(rootPath, 'package-lock.json'))) managers.push('npm');
  else if (fs.existsSync(path.join(rootPath, 'package.json'))) managers.push('npm');
  
  // PHP
  if (fs.existsSync(path.join(rootPath, 'composer.lock')) || fs.existsSync(path.join(rootPath, 'composer.json'))) {
    managers.push('composer');
  }
  
  // Python
  if (fs.existsSync(path.join(rootPath, 'Pipfile.lock'))) managers.push('pipenv');
  else if (fs.existsSync(path.join(rootPath, 'poetry.lock'))) managers.push('poetry');
  else if (fs.existsSync(path.join(rootPath, 'requirements.txt'))) managers.push('pip');
  
  // Ruby
  if (fs.existsSync(path.join(rootPath, 'Gemfile.lock'))) managers.push('bundler');
  
  // Go
  if (fs.existsSync(path.join(rootPath, 'go.mod'))) managers.push('go modules');
  
  // Rust
  if (fs.existsSync(path.join(rootPath, 'Cargo.lock'))) managers.push('cargo');
  
  return managers;
}

function detectFramework(
  files: ScannedFile[],
  npmDeps: Record<string, string>,
  composerDeps: Record<string, string>
): string | null {
  const fileNames = new Set(files.map(f => path.basename(f.relativePath)));
  const filePaths = new Set(files.map(f => f.relativePath));
  
  // Priority order for framework detection
  const priorityOrder = ['next.js', 'nuxt', 'sveltekit', 'remix', 'gatsby', 'astro', 'laravel', 'symfony', 'angular'];
  
  for (const framework of priorityOrder) {
    const indicators = FRAMEWORK_INDICATORS[framework];
    if (!indicators) continue;
    
    const hasConfigFile = indicators.files.some(file => fileNames.has(file) || filePaths.has(file));
    const hasNpmDep = indicators.npmDeps.some(dep => dep in npmDeps);
    const hasComposerDep = indicators.composerDeps.some(dep => dep in composerDeps);
    
    if (hasConfigFile || hasNpmDep || hasComposerDep) {
      return framework;
    }
  }
  
  // Check remaining frameworks
  for (const [framework, indicators] of Object.entries(FRAMEWORK_INDICATORS)) {
    if (priorityOrder.includes(framework)) continue;
    
    const hasConfigFile = indicators.files.some(file => fileNames.has(file));
    const hasNpmDep = indicators.npmDeps.some(dep => dep in npmDeps);
    const hasComposerDep = indicators.composerDeps.some(dep => dep in composerDeps);
    
    if (hasConfigFile || hasNpmDep || hasComposerDep) {
      return framework;
    }
  }
  
  return null;
}

function detectStacks(
  files: ScannedFile[],
  npmDeps: Record<string, string>,
  composerDeps: Record<string, string>
): string[] {
  const stacks: string[] = [];
  const fileNames = new Set(files.map(f => path.basename(f.relativePath)));
  const filePaths = new Set(files.map(f => f.relativePath));
  
  for (const [stack, indicators] of Object.entries(STACK_INDICATORS)) {
    const hasFile = indicators.files.some(file => fileNames.has(file) || filePaths.has(file));
    const hasNpmDep = indicators.npmDeps.some(dep => dep in npmDeps);
    const hasComposerDep = indicators.composerDeps.some(dep => dep in composerDeps);
    
    if (hasFile || hasNpmDep || hasComposerDep) {
      stacks.push(stack);
    }
  }
  
  return stacks;
}

function detectBundler(
  files: ScannedFile[],
  npmDeps: Record<string, string>
): string | null {
  const fileNames = new Set(files.map(f => path.basename(f.relativePath)));
  
  for (const [bundler, indicators] of Object.entries(BUNDLER_INDICATORS)) {
    const hasConfigFile = indicators.files.some(file => fileNames.has(file));
    const hasDep = indicators.deps.some(dep => dep in npmDeps);
    
    if (hasConfigFile || hasDep) {
      return bundler;
    }
  }
  
  return null;
}

function detectLanguages(files: ScannedFile[]): string[] {
  const languagesSet = new Set<string>();
  
  for (const file of files) {
    // Check for blade templates specifically
    if (file.relativePath.endsWith('.blade.php')) {
      languagesSet.add('Blade');
      languagesSet.add('PHP');
      continue;
    }
    
    const ext = file.extension.toLowerCase();
    if (ext in LANGUAGE_EXTENSIONS) {
      languagesSet.add(LANGUAGE_EXTENSIONS[ext]);
    }
  }
  
  return Array.from(languagesSet);
}

export async function detectTechStack(
  rootPath: string,
  files: ScannedFile[]
): Promise<TechStack> {
  const packageJson = await readPackageJson(rootPath);
  const composerJson = await readComposerJson(rootPath);
  
  const npmDeps = {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {}),
  };
  
  const composerDeps = {
    ...(composerJson?.require || {}),
    ...(composerJson?.['require-dev'] || {}),
  };
  
  return {
    framework: detectFramework(files, npmDeps, composerDeps),
    language: detectLanguages(files),
    packageManagers: detectPackageManagers(rootPath),
    stacks: detectStacks(files, npmDeps, composerDeps),
    bundler: detectBundler(files, npmDeps),
    dependencies: Object.keys(packageJson?.dependencies || {}),
    devDependencies: Object.keys(packageJson?.devDependencies || {}),
  };
}
