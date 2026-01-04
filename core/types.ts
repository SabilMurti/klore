// Core types for Klore template engine

export interface KloreVariable {
  name: string;
  type: 'STRING' | 'COLOR' | 'EMAIL' | 'PHONE' | 'URL' | 'NUMBER';
  defaultValue: string;
  required: boolean;
  description?: string;
}

export interface KloreGroup {
  name: string;
  variables: string[];
}

export interface KloreReplacement {
  original: string;
  variable: string;
  filePatterns: string[];
}

export interface KloreConditional {
  variable: string;
  replacements: KloreReplacement[];
}

export interface KloreTemplate {
  name: string;
  version: string;
  author: string;
  description: string;
  framework?: string;
  requires?: string[];
  variables: KloreVariable[];
  groups: KloreGroup[];
  replacements: KloreReplacement[];
  conditionals: KloreConditional[];
  onInstall?: string[];
  aiHints?: string[];
}

export interface ScannedFile {
  path: string;
  relativePath: string;
  extension: string;
  size: number;
  content?: string;
  isBinary: boolean;
}

export interface TechStack {
  framework: string | null;
  language: string[];
  packageManagers: string[];  // Changed to array for multiple package managers
  stacks: string[];           // Additional stacks like Livewire, Inertia, shadcn, etc.
  bundler: string | null;     // Vite, Webpack, esbuild, etc.
  dependencies: string[];
  devDependencies: string[];
}

export interface ScanResult {
  rootPath: string;
  files: ScannedFile[];
  techStack: TechStack;
  totalFiles: number;
  totalSize: number;
}

export interface DetectedContent {
  type: 'app_name' | 'email' | 'phone' | 'url' | 'color' | 'address' | 'tagline' | 'environment_variable';
  value: string;
  filePath: string;
  line: number;
  column: number;
}
