import { ScannedFile, DetectedContent } from '../types';

// Regex patterns for detecting replaceable content
const PATTERNS = {
  // Email addresses
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  
  // Phone numbers (various formats)
  phone: /(?:\+\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
  
  // URLs (http, https, www)
  url: /https?:\/\/[^\s"']+|www\.[^\s"']+/g,
  
  // Hex colors
  hexColor: /#([0-9A-Fa-f]{3}){1,2}\b/g,
  
  // RGB/RGBA colors
  rgbColor: /rgba?\s*\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[\d.]+)?\s*\)/g,
  
  // HSL colors
  hslColor: /hsla?\s*\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*[\d.]+)?\s*\)/g,
};

// Common app name patterns in code
const APP_NAME_CONTEXTS = [
  /title[:\s]*["']([^"']+)["']/gi,
  /app[_-]?name[:\s]*["']([^"']+)["']/gi,
  /name[:\s]*["']([^"']+)["']/gi,
  /<title>([^<]+)<\/title>/gi,
  /siteName[:\s]*["']([^"']+)["']/gi,
];

// Blacklist for common generic values to avoid noise
const VALUE_BLACKLIST = [
  'laravel', 'localhost', '127.0.0.1', '0.0.0.0', '::1',
  'mysql', 'pgsql', 'sqlite', 'redis', 'smtp', 'mailtrap',
  'utf8mb4', 'unicode', 'forge', 'root', 'your_api_key_here',
  'home', 'index', 'app', 'main', 'master', 'default',
  'true', 'false', 'null', 'undefined',
];

// Skip patterns (system/generated content/irrelevant files)
const SKIP_PATTERNS = [
  /node_modules/, /vendor/, /\.min\.(js|css)$/, /package-lock\.json/, /yarn\.lock/, /composer\.lock/,
  /\.map$/, /\.git/, /storage\/framework/, /storage\/logs/, /dist/, /build/, /public\/(js|css|fonts|images|vendor)/,
  /database\/(migrations|factories|seeders)/, /tests/, /webpack\.mix\.js/, /vite\.config\.js/,
];

function shouldSkipFile(filePath: string): boolean {
  // Always skip lock files and vendor/node_modules content for extraction
  if (
    filePath.includes('node_modules') || 
    filePath.includes('vendor/') || 
    filePath.includes('composer.json') || 
    filePath.includes('package.json')
  ) {
    return true;
  }
  return SKIP_PATTERNS.some(pattern => pattern.test(filePath));
}

function isBlacklisted(value: string): boolean {
  if (!value) return true;
  const lower = value.toLowerCase().trim();
  if (lower.length < 3) return true;
  return VALUE_BLACKLIST.some(b => lower === b);
}

function getLineAndColumn(content: string, index: number): { line: number; column: number } {
  const lines = content.substring(0, index).split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

function extractEmails(content: string, filePath: string): DetectedContent[] {
  const results: DetectedContent[] = [];
  const matches = content.matchAll(PATTERNS.email);
  
  for (const match of matches) {
    if (match.index === undefined) continue;
    
    // Skip common false positives
    const value = match[0];
    if (isBlacklisted(value) || value.includes('example.com') || value.includes('test.com')) continue;
    
    const { line, column } = getLineAndColumn(content, match.index);
    results.push({
      type: 'email',
      value,
      filePath,
      line,
      column,
    });
  }
  
  return results;
}

function extractUrls(content: string, filePath: string): DetectedContent[] {
  const results: DetectedContent[] = [];
  const matches = content.matchAll(PATTERNS.url);
  
  for (const match of matches) {
    if (match.index === undefined) continue;
    
    const value = match[0];
    // Skip CDN and common library URLs
    if (
      value.includes('cdn.') ||
      value.includes('googleapis.com') ||
      value.includes('unpkg.com') ||
      value.includes('jsdelivr.net') ||
      value.includes('github.com') ||
      value.includes('npmjs.com')
    ) continue;
    
    const { line, column } = getLineAndColumn(content, match.index);
    results.push({
      type: 'url',
      value,
      filePath,
      line,
      column,
    });
  }
  
  return results;
}

function extractColors(content: string, filePath: string): DetectedContent[] {
  const results: DetectedContent[] = [];
  
  // Extract hex colors
  const hexMatches = content.matchAll(PATTERNS.hexColor);
  for (const match of hexMatches) {
    if (match.index === undefined) continue;
    
    // Skip common neutrals and system colors
    const value = match[0].toLowerCase();
    if (['#000', '#fff', '#000000', '#ffffff', '#333', '#666', '#999', '#ccc'].includes(value)) continue;
    
    const { line, column } = getLineAndColumn(content, match.index);
    results.push({
      type: 'color',
      value: match[0],
      filePath,
      line,
      column,
    });
  }
  
  // Extract RGB colors
  const rgbMatches = content.matchAll(PATTERNS.rgbColor);
  for (const match of rgbMatches) {
    if (match.index === undefined) continue;
    const { line, column } = getLineAndColumn(content, match.index);
    results.push({
      type: 'color',
      value: match[0],
      filePath,
      line,
      column,
    });
  }
  
  return results;
}

function extractPhones(content: string, filePath: string): DetectedContent[] {
  const results: DetectedContent[] = [];
  const matches = content.matchAll(PATTERNS.phone);
  
  for (const match of matches) {
    if (match.index === undefined) continue;
    
    const value = match[0];
    // Filter out common false positives (version numbers, etc.)
    if (value.length < 7 || /^\d{1,3}\.\d/.test(value)) continue;
    
    const { line, column } = getLineAndColumn(content, match.index);
    results.push({
      type: 'phone',
      value,
      filePath,
      line,
      column,
    });
  }
  
  return results;
}

function extractAppNames(content: string, filePath: string): DetectedContent[] {
  const results: DetectedContent[] = [];
  
  for (const pattern of APP_NAME_CONTEXTS) {
    const matches = content.matchAll(pattern);
    
    for (const match of matches) {
      if (match.index === undefined || !match[1]) continue;
      
      const value = match[1].trim();
      if (isBlacklisted(value)) continue;
      
      const { line, column } = getLineAndColumn(content, match.index);
      results.push({
        type: 'app_name',
        value,
        filePath,
        line,
        column,
      });
    }
  }
  
  return results;
}

function extractSemanticText(content: string, filePath: string): DetectedContent[] {
  const results: DetectedContent[] = [];
  // Look for text between tags or in quotes that looks like a sentence/title (Capital letter start)
  const pattern = /(?:>|["'])([A-Z][^<"']{5,100})(?:<|["'])/g;
  const matches = content.matchAll(pattern);
  
  for (const match of matches) {
    if (match.index === undefined || !match[1]) continue;
    
    const value = match[1].trim();
    if (isBlacklisted(value) || value.includes('{{') || value.includes('<?')) continue;
    
    // Heuristic: Must have at least one space or be multiple words
    if (!value.includes(' ')) continue;

    const { line, column } = getLineAndColumn(content, match.index);
    results.push({
      type: 'text_content' as any,
      value,
      filePath,
      line,
      column,
    });
  }
  
  return results;
}

export function extractContent(file: ScannedFile): DetectedContent[] {
  if (!file.content || shouldSkipFile(file.path)) {
    return [];
  }
  
  const results: DetectedContent[] = [];
  
  results.push(...extractEmails(file.content, file.relativePath));
  results.push(...extractUrls(file.content, file.relativePath));
  results.push(...extractColors(file.content, file.relativePath));
  results.push(...extractPhones(file.content, file.relativePath));
  results.push(...extractAppNames(file.content, file.relativePath));
  
  // Only extract semantic text from view/template files
  if (['.blade.php', '.html', '.vue', '.jsx', '.tsx'].some(ext => file.path.endsWith(ext))) {
    results.push(...extractSemanticText(file.content, file.relativePath));
  }
  
  if (file.relativePath.includes('.env')) {
    results.push(...extractEnvVariables(file.content, file.relativePath));
  }
  
  return results;
}

function extractEnvVariables(content: string, filePath: string): DetectedContent[] {
  const results: DetectedContent[] = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    
    const parts = line.split('=');
    if (parts.length >= 2) {
      // const key = parts[0].trim();

      const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
      
      if (value && !isBlacklisted(value)) {
        results.push({
          type: 'environment_variable' as any,
          value,
          filePath,
          line: i + 1,
          column: line.indexOf('=') + 2,
        });
      }
    }
  }
  
  return results;
}

export function extractAllContent(files: ScannedFile[]): DetectedContent[] {
  const allContent: DetectedContent[] = [];
  
  for (const file of files) {
    allContent.push(...extractContent(file));
  }
  
  // Deduplicate by value
  const seen = new Set<string>();
  return allContent.filter(item => {
    const key = `${item.type}:${item.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
