import * as fs from 'fs';
import * as path from 'path';
import { ScannedFile, ScanResult } from '../types';
import { detectTechStack } from './techDetector';

// Files and directories to ignore during scanning
const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '__pycache__',
  '.pytest_cache',
  'vendor',
  '.idea',
  '.vscode',
  '*.log',
  '.DS_Store',
  'Thumbs.db',
  '.klore',
  '.env.example',
];

// Binary file extensions to skip content reading
const BINARY_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.mp3', '.mp4', '.wav', '.avi', '.mov',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.zip', '.rar', '.7z', '.tar', '.gz',
  '.exe', '.dll', '.so', '.dylib',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
];

// Max file size to read content (1MB)
const MAX_FILE_SIZE = 1024 * 1024;

function shouldIgnore(name: string): boolean {
  return IGNORE_PATTERNS.some(pattern => {
    if (pattern.startsWith('*')) {
      return name.endsWith(pattern.slice(1));
    }
    return name === pattern;
  });
}

function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.includes(ext);
}

async function readFileContent(filePath: string, size: number): Promise<string | undefined> {
  if (size > MAX_FILE_SIZE) {
    return undefined;
  }
  
  try {
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch {
    return undefined;
  }
}

async function scanDirectory(
  dirPath: string,
  rootPath: string,
  files: ScannedFile[]
): Promise<void> {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (shouldIgnore(entry.name)) {
      continue;
    }
    
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootPath, fullPath);
    
    if (entry.isDirectory()) {
      await scanDirectory(fullPath, rootPath, files);
    } else if (entry.isFile()) {
      const stats = await fs.promises.stat(fullPath);
      const isBinary = isBinaryFile(fullPath);
      
      const scannedFile: ScannedFile = {
        path: fullPath,
        relativePath,
        extension: path.extname(fullPath),
        size: stats.size,
        isBinary,
      };
      
      // Read content for non-binary, reasonably sized files
      if (!isBinary && stats.size <= MAX_FILE_SIZE) {
        scannedFile.content = await readFileContent(fullPath, stats.size);
      }
      
      files.push(scannedFile);
    }
  }
}

export async function scanProject(projectPath: string): Promise<ScanResult> {
  const absolutePath = path.resolve(projectPath);
  
  // Verify path exists
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Path does not exist: ${absolutePath}`);
  }
  
  const stats = await fs.promises.stat(absolutePath);
  if (!stats.isDirectory()) {
    throw new Error(`Path is not a directory: ${absolutePath}`);
  }
  
  const files: ScannedFile[] = [];
  await scanDirectory(absolutePath, absolutePath, files);
  
  // Detect tech stack
  const techStack = await detectTechStack(absolutePath, files);
  
  // Calculate totals
  const totalFiles = files.length;
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  
  return {
    rootPath: absolutePath,
    files,
    techStack,
    totalFiles,
    totalSize,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
