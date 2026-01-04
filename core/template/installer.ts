import * as fs from 'fs';
import * as path from 'path';
import * as p from '@clack/prompts';
import color from 'picocolors';
import { KloreTemplate, KloreVariable, KloreReplacement } from '../types';
import { parseKlore } from './kloreParser';

export interface InstallOptions {
  templatePath: string;
  outputPath: string;
  force?: boolean;
  values?: Record<string, string>;  // Pre-filled values (for AI install)
}

export interface InstallResult {
  success: boolean;
  outputPath: string;
  filesCreated: number;
  replacementsApplied: number;
  errors: string[];
}

/**
 * Read and parse .klore file from a template directory
 */
export async function readKloreFile(templatePath: string): Promise<KloreTemplate | null> {
  const klorePath = path.join(templatePath, '.klore');
  
  if (!fs.existsSync(klorePath)) {
    return null;
  }
  
  const content = await fs.promises.readFile(klorePath, 'utf-8');
  return parseKlore(content);
}

/**
 * Generate prompt based on variable type
 */
function getVariablePrompt(variable: KloreVariable): string {
  const name = variable.name
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toLowerCase();
  
  switch (variable.name) {
    case 'appName':
    case 'storeName':
    case 'companyName':
    case 'brandName':
      return 'What is your store/company name?';
    case 'primaryColor':
      return 'What is your primary brand color? (hex)';
    case 'secondaryColor':
      return 'What is your secondary color? (hex)';
    case 'contactEmail':
    case 'email':
      return 'What is your contact email?';
    case 'contactPhone':
    case 'phone':
      return 'What is your phone number?';
    case 'address':
    case 'physicalAddress':
      return 'What is your business address?';
    case 'businessHours':
      return 'What are your business hours?';
    default:
      return `Enter ${name}:`;
  }
}

/**
 * Validate input based on variable type
 */
function validateInput(value: string, variable: KloreVariable): string | undefined {
  if (variable.required && !value.trim()) {
    return 'This field is required';
  }
  
  if (!value.trim()) return undefined; // Optional empty is OK
  
  switch (variable.type) {
    case 'EMAIL':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return 'Please enter a valid email address';
      }
      break;
    case 'COLOR':
      if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value)) {
        return 'Please enter a valid hex color (e.g., #FF7800)';
      }
      break;
    case 'PHONE':
      if (!/^[\d\s\-\+\(\)]+$/.test(value)) {
        return 'Please enter a valid phone number';
      }
      break;
    case 'URL':
      try {
        new URL(value);
      } catch {
        if (value && value !== '#') {
          return 'Please enter a valid URL';
        }
      }
      break;
  }
  
  return undefined;
}

/**
 * Prompt user for all template variables
 */
export async function promptVariables(
  template: KloreTemplate,
  prefilledValues?: Record<string, string>
): Promise<Record<string, string> | null> {
  const values: Record<string, string> = {};
  const promptedNames = new Set<string>();  // Track already prompted variables
  
  // Deduplicate variables by name (keep first occurrence)
  const seenNames = new Set<string>();
  const uniqueVariables = template.variables.filter(v => {
    if (seenNames.has(v.name)) return false;
    seenNames.add(v.name);
    return true;
  });
  
  // Group variables by their group
  const grouped = new Map<string, KloreVariable[]>();
  const ungrouped: KloreVariable[] = [];
  
  for (const variable of uniqueVariables) {
    const group = template.groups.find(g => g.variables.includes(variable.name));
    if (group) {
      if (!grouped.has(group.name)) {
        grouped.set(group.name, []);
      }
      grouped.get(group.name)!.push(variable);
    } else {
      ungrouped.push(variable);
    }
  }
  
  // Define group order and labels
  const groupOrder = ['branding', 'colors', 'contact', 'content', 'social', 'institution', 'legal'];
  const groupLabels: Record<string, string> = {
    branding: '🏷️ Brand Identity',
    colors: '🎨 Theme Colors',
    contact: '📍 Contact Information',
    content: '📝 Content',
    social: '📱 Social Media',
    institution: '🏫 Organization',
    legal: '⚖️ Legal',
  };
  
  // Process groups in order
  for (const groupName of groupOrder) {
    const variables = grouped.get(groupName);
    if (!variables || variables.length === 0) continue;
    
    p.log.info(color.cyan(groupLabels[groupName] || groupName));
    
    for (const variable of variables) {
      // Skip if prefilled
      if (prefilledValues && prefilledValues[variable.name]) {
        values[variable.name] = prefilledValues[variable.name];
        p.log.step(`${variable.name}: ${color.dim(prefilledValues[variable.name])}`);
        continue;
      }
      
      const result = await p.text({
        message: getVariablePrompt(variable),
        placeholder: variable.defaultValue || '',
        defaultValue: variable.defaultValue || '',
        validate: (value) => validateInput(value, variable),
      });
      
      if (p.isCancel(result)) {
        return null;
      }
      
      values[variable.name] = (result as string) || variable.defaultValue || '';
    }
  }
  
  // Process ungrouped
  if (ungrouped.length > 0) {
    p.log.info(color.cyan('📦 Other Settings'));
    
    for (const variable of ungrouped) {
      if (prefilledValues && prefilledValues[variable.name]) {
        values[variable.name] = prefilledValues[variable.name];
        continue;
      }
      
      const result = await p.text({
        message: getVariablePrompt(variable),
        placeholder: variable.defaultValue || '',
        defaultValue: variable.defaultValue || '',
        validate: (value) => validateInput(value, variable),
      });
      
      if (p.isCancel(result)) {
        return null;
      }
      
      values[variable.name] = (result as string) || variable.defaultValue || '';
    }
  }
  
  return values;
}

/**
 * Apply replacements to file content
 */
function applyReplacements(
  content: string,
  replacements: KloreReplacement[],
  values: Record<string, string>,
  filename?: string  // For debugging
): string {
  let result = content;
  let matchCount = 0;
  
  for (const replacement of replacements) {
    const value = values[replacement.variable];
    if (value !== undefined && replacement.original) {
      // Escape special regex characters in original
      const escaped = replacement.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      
      const before = result;
      result = result.replace(regex, value);
      
      if (before !== result) {
        matchCount++;
      }
    }
  }
  
  return result;
}

/**
 * Copy template files with replacements applied
 */
async function copyWithReplacements(
  srcDir: string,
  destDir: string,
  replacements: KloreReplacement[],
  values: Record<string, string>,
  // Only exclude exact matches - not patterns!
  excludeNames: string[] = ['.klore', 'node_modules', 'vendor', '.git']
): Promise<{ files: number; replaced: number }> {
  let filesCreated = 0;
  let replacementsApplied = 0;
  
  async function processDir(src: string, dest: string) {
    const entries = await fs.promises.readdir(src, { withFileTypes: true });
    
    // Create destination directory
    await fs.promises.mkdir(dest, { recursive: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      // Check exclusions - exact match only!
      if (excludeNames.includes(entry.name)) {
        continue;
      }
      
      if (entry.isDirectory()) {
        await processDir(srcPath, destPath);
      } else {
        // Check if this is a text file we should process
        const ext = path.extname(entry.name).toLowerCase();
        const textExtensions = [
          '.php', '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte',
          '.html', '.htm', '.css', '.scss', '.less',
          '.json', '.xml', '.yaml', '.yml', '.toml',
          '.md', '.txt', '.env.example', '.gitignore',
          '.blade.php', '.twig', '.ejs', '.pug'
        ];
        
        const isTextFile = textExtensions.includes(ext) || 
          entry.name.endsWith('.blade.php') ||
          entry.name === '.env.example';
        
        if (isTextFile) {
          // Read, replace, write
          const content = await fs.promises.readFile(srcPath, 'utf-8');
          const replaced = applyReplacements(content, replacements, values, entry.name);
          await fs.promises.writeFile(destPath, replaced, 'utf-8');
          
          if (content !== replaced) {
            replacementsApplied++;
          }
        } else {
          // Binary file - just copy
          await fs.promises.copyFile(srcPath, destPath);
        }
        
        filesCreated++;
      }
    }
  }
  
  await processDir(srcDir, destDir);
  
  return { files: filesCreated, replaced: replacementsApplied };
}

/**
 * Run post-install commands
 */
async function runPostInstall(
  commands: string[],
  cwd: string
): Promise<void> {
  const { spawn } = await import('child_process');
  
  for (const cmd of commands) {
    const s = p.spinner();
    s.start(`Running: ${cmd}`);
    
    await new Promise<void>((resolve, reject) => {
      const child = spawn(cmd, [], {
        cwd,
        shell: true,
        stdio: 'pipe'
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          s.stop(`Completed: ${cmd}`);
          resolve();
        } else {
          s.stop(`Failed: ${cmd}`);
          reject(new Error(`Command failed with code ${code}`));
        }
      });
      
      child.on('error', (err) => {
        s.stop(`Error: ${cmd}`);
        reject(err);
      });
    });
  }
}

/**
 * Main install function
 */
export async function installTemplate(options: InstallOptions): Promise<InstallResult> {
  const errors: string[] = [];
  
  // 1. Read .klore file
  const template = await readKloreFile(options.templatePath);
  if (!template) {
    return {
      success: false,
      outputPath: options.outputPath,
      filesCreated: 0,
      replacementsApplied: 0,
      errors: ['No .klore file found in template directory']
    };
  }
  
  // 2. Check if output exists
  if (fs.existsSync(options.outputPath) && !options.force) {
    return {
      success: false,
      outputPath: options.outputPath,
      filesCreated: 0,
      replacementsApplied: 0,
      errors: ['Output directory already exists. Use --force to overwrite.']
    };
  }
  
  // 3. Prompt for variables (or use prefilled)
  const values = options.values || await promptVariables(template);
  if (!values) {
    return {
      success: false,
      outputPath: options.outputPath,
      filesCreated: 0,
      replacementsApplied: 0,
      errors: ['Installation cancelled by user']
    };
  }
  
  const s = p.spinner();
  s.start('Copying template files...');
  
  try {
    const { files, replaced } = await copyWithReplacements(
      options.templatePath,
      options.outputPath,
      template.replacements,
      values
    );
    
    s.stop(`Copied ${files} files, applied replacements to ${replaced} files`);
    
    // 5. Run post-install commands if any
    if (template.onInstall && template.onInstall.length > 0) {
      const shouldRun = await p.confirm({
        message: `Run post-install commands? (${template.onInstall.length} commands)`,
        initialValue: true,
      });
      
      if (!p.isCancel(shouldRun) && shouldRun) {
        try {
          await runPostInstall(template.onInstall, options.outputPath);
        } catch (err) {
          errors.push(`Post-install error: ${(err as Error).message}`);
        }
      }
    }
    
    return {
      success: true,
      outputPath: options.outputPath,
      filesCreated: files,
      replacementsApplied: replaced,
      errors
    };
  } catch (err) {
    s.stop('Error copying files');
    return {
      success: false,
      outputPath: options.outputPath,
      filesCreated: 0,
      replacementsApplied: 0,
      errors: [(err as Error).message]
    };
  }
}
