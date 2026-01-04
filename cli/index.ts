#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as p from '@clack/prompts';
import color from 'picocolors';

// Load environment variables from .env file
dotenv.config();

import { scanProject, formatBytes, extractAllContent } from '../core/scanner';
import { generateKlore } from '../core/template';
import { KloreTemplate, DetectedContent } from '../core/types';
import { printHeader, printSection, printKV, handleError, formatBytes as formatBytesUI } from './ui';

const program = new Command();

program
  .name('klore')
  .description('Klore Noir CLI - AI-powered project template engine')
  .version('1.0.0');

// ... existing imports ...

// =============================================================================
// =============================================================================
// SCAN COMMAND
// =============================================================================
program
  .command('scan')
  .description('Scan a project directory')
  .argument('[path]', 'Path to project', '.')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (projectPath: string, options: { verbose?: boolean }) => {
    try {
      const fullPath = path.resolve(projectPath);
      
      printHeader('Klore Scanner', 'Analyze project structure & tech stack');
      
      const s = p.spinner();
      s.start('Scanning project structure...');
      
      const result = await scanProject(fullPath);
      
      s.stop('Scan complete!');
      
      printSection('📊 Statistics');
      printKV('Files', result.totalFiles);
      printKV('Size', formatBytesUI(result.totalSize));
      
      if (result.techStack.framework || result.techStack.language.length > 0) {
        printSection('🛠️ Tech Stack');
        if (result.techStack.framework) printKV('Framework', result.techStack.framework);
        if (result.techStack.language.length > 0) printKV('Languages', result.techStack.language.join(', '));
        if (result.techStack.packageManagers.length > 0) printKV('Pkg Manager', result.techStack.packageManagers.join(', '));
        if (result.techStack.bundler) printKV('Bundler', result.techStack.bundler);
      }
      
      // Extract content
      const content = extractAllContent(result.files);
      
      if (content.length > 0 && options.verbose) {
        printSection('🔍 Detected Content');
        const grouped = groupByType(content);
        Object.entries(grouped).forEach(([type, items]) => {
           printKV(type, `${items.length} detected`);
        });
      }
      
      p.outro(color.green('✅ Scan complete!'));
    } catch (error) {
      handleError(error);
      process.exit(1);
    }
  });

// =============================================================================
// CREATE COMMAND - Interactive Mode
// =============================================================================
program
  .command('create')
  .description('Create a template from a project')
  .argument('[path]', 'Path to project')
  .option('-o, --output <file>', 'Output file name')
  .option('-n, --name <name>', 'Template name')
  .option('--ai', 'Use AI to suggest variables')
  .option('-p, --provider <provider>', 'AI provider')
  .option('-m, --model <model>', 'AI model to use')
  .option('--scan', 'Show project scan before creating template')
  .action(async (projectPath: string | undefined, options: { 
    output?: string; 
    name?: string; 
    ai?: boolean;
    provider?: string;
    model?: string;
    scan?: boolean;
  }) => {
    try {
      printHeader('Template Creator', 'Convert project to reusable template');
      
      // 1. Get project path if not provided

      let targetPath = projectPath;
      if (!targetPath) {
        const pathInput = await p.text({
          message: 'Enter the project path:',
          placeholder: './my-project',
          defaultValue: '.',
          validate: (value) => {
            if (!value) return 'Path is required';
            return undefined;
          }
        });
        
        if (p.isCancel(pathInput)) {
          p.cancel('Operation cancelled.');
          process.exit(0);
        }
        targetPath = pathInput as string;
      }
      
      const fullPath = path.resolve(targetPath);
      
      // 2. Scan project
      const s = p.spinner();
      s.start('Scanning project structure...');
      
      const result = await scanProject(fullPath);
      
      s.stop(`Scanned ${result.files.length} files`);
      
      // Show scan results if --scan flag or interactive
      if (options.scan || !projectPath) {
        printSection('📊 Project Info');
        printKV('Files', result.totalFiles);
        printKV('Size', formatBytes(result.totalSize));
        printKV('Framework', result.techStack.framework || 'Unknown');
        printKV('Languages', result.techStack.language.join(', ') || 'None');
      }
      
      
      // 3. AI Provider Selection
      let useAI = options.ai;
      let provider = options.provider;
      let model = options.model;
      
      if (useAI === undefined && !options.provider) {
        const aiChoice = await p.select({
          message: 'Choose AI provider for smart extraction:',
          options: [
            { value: 'ollama', label: '🦙 Ollama (Local)', hint: 'Free, runs locally' },
            { value: 'openai', label: '🤖 OpenAI', hint: 'Requires API key' },
            { value: 'anthropic', label: '🧠 Anthropic Claude', hint: 'Requires API key' },
            { value: 'gemini', label: '✨ Google Gemini', hint: 'Requires API key' },
            { value: 'none', label: '❌ No AI', hint: 'Basic regex extraction' },
          ],
        });
        
        if (p.isCancel(aiChoice)) {
          p.cancel('Operation cancelled.');
          process.exit(0);
        }
        
        if (aiChoice === 'none') {
          useAI = false;
        } else {
          useAI = true;
          provider = aiChoice as string;
        }
      }
      
      // 4. Model Selection for Ollama
      if (useAI && provider === 'ollama' && !model) {
        const { autoDetectProvider } = await import('../core/ai');
        
        s.start('Checking available Ollama models...');
        try {
          const detected = await autoDetectProvider();
        } catch (e) {
            // Ignore if fails
        }
        s.stop('Models loaded');
        
        // Try to get list of models
        const modelOptions = [
          { value: 'deepseek-v3.1:671b-cloud', label: '🚀 DeepSeek V3 (Cloud)', hint: 'Fast, high quality' },
          { value: 'llama3.2:latest', label: '🦙 Llama 3.2', hint: 'Local, balanced' },
          { value: 'deepseek-coder:1.3b', label: '💻 DeepSeek Coder 1.3B', hint: 'Local, fast' },
          { value: 'qwen2.5-coder:7b', label: '🔮 Qwen 2.5 Coder 7B', hint: 'Local, good for code' },
          { value: 'custom', label: '✏️ Enter custom model', hint: 'Type your own' },
        ];
        
        const modelChoice = await p.select({
          message: 'Select Ollama model:',
          options: modelOptions,
        });
        
        if (p.isCancel(modelChoice)) {
          p.cancel('Operation cancelled.');
          process.exit(0);
        }
        
        if (modelChoice === 'custom') {
          const customModel = await p.text({
            message: 'Enter model name:',
            placeholder: 'llama3.2:latest',
          });
          
          if (p.isCancel(customModel)) {
            p.cancel('Operation cancelled.');
            process.exit(0);
          }
          model = customModel as string;
        } else {
          model = modelChoice as string;
        }
      }
      
      // 5. Extract content
      s.start('Extracting content patterns...');
      const content = extractAllContent(result.files);
      s.stop(`Extracted ${content.length} unique patterns`);
      
      // 6. Build template
      const template: KloreTemplate = {
        name: options.name || path.basename(fullPath) + ' Template',
        version: '1.0.0',
        author: '',
        description: `Template created from ${path.basename(fullPath)}`,
        framework: result.techStack.framework || undefined,
        variables: [],
        groups: [],
        replacements: [],
        conditionals: [],
        onInstall: [],
        aiHints: [],
      };

      if (useAI && provider) {
        s.start(`Using ${provider} AI for smart extraction...`);
        
        const { createAIService } = await import('../core/ai');
        
        let aiConfig: any = { 
          provider,
          model,
          apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY,
        };

        if (provider === 'ollama' && process.env.OLLAMA_BASE_URL) {
          aiConfig.baseUrl = process.env.OLLAMA_BASE_URL;
        }

        const ai = createAIService(aiConfig);
        
        s.stop('AI service initialized');
        
        // Use new smart extraction
        const { projectAnalysis, replaceables } = await ai.smartExtractAll(result.files);
        
        if (replaceables.length > 0) {
          // Group replaceables by their group
          const groupMap = new Map<string, string[]>();
          
          for (const item of replaceables) {
            template.variables.push({
              name: item.suggestedName,
              type: 'STRING',
              defaultValue: item.value,
              required: item.group === 'branding',
            });
            
            template.replacements.push({
              original: item.value,
              variable: item.suggestedName,
              filePatterns: [item.filePath],
            });
            
            // Build groups
            if (!groupMap.has(item.group)) {
              groupMap.set(item.group, []);
            }
            groupMap.get(item.group)!.push(item.suggestedName);
          }
          
          // Convert group map to array
          template.groups = Array.from(groupMap.entries()).map(([name, variables]) => ({
            name,
            variables
          }));
          
          // Add AI hints about project type
          template.aiHints = [
            `Project Type: ${projectAnalysis.projectType}`,
            `Description: ${projectAnalysis.description}`,
          ];
          
          p.log.success(`AI extracted ${template.variables.length} replaceable items`);
        } else {
          p.log.warn('AI found no replaceable content, using basic extraction.');
          useBasicExtraction(template, content);
        }
      } else {
        useBasicExtraction(template, content);
        p.log.info(`Basic extraction found ${template.variables.length} items`);
      }
      
      // Add install commands based on package managers
      for (const pm of result.techStack.packageManagers) {
        if (['npm', 'pnpm', 'yarn', 'bun'].includes(pm)) {
          template.onInstall?.push(`${pm} install`);
        } else if (pm === 'composer') {
          template.onInstall?.push('composer install');
        }
      }
      
      // Generate .klore content
      const kloreContent = generateKlore(template);
      
      // Write to file
      const fs = await import('fs');
      const outputPath = options.output 
        ? path.resolve(options.output)
        : path.join(fullPath, '.klore');
        
      await fs.promises.writeFile(outputPath, kloreContent, 'utf-8');

      // Summary
      printSection('📋 Template Summary');
      printKV('Variables', template.variables.length);
      printKV('Replacements', template.replacements.length);
      printKV('Groups', template.groups.length);
      
      p.outro(color.green(`✅ Template created: ${outputPath}`));
    } catch (error) {
      handleError(error);
      process.exit(1);
    }
  });

// =============================================================================
// INSTALL COMMAND - Use a template
// =============================================================================
program
  .command('install')
  .description('Install a template to create a new project')
  .argument('<template-path>', 'Path to template folder (must contain .klore file)')
  .option('-o, --output <path>', 'Output directory for new project')
  .option('--force', 'Overwrite output directory if exists')
  .option('--defaults', 'Use default values without prompting')
  .action(async (templatePath: string, options: { 
    output?: string;
    force?: boolean;
    defaults?: boolean;
  }) => {
    try {
      const { installTemplate, readKloreFile } = await import('../core/template/installer');
      
      const fullTemplatePath = path.resolve(templatePath);
      
      printHeader('Template Installer', 'Create project from template');
      
      // Check if .klore exists
      const template = await readKloreFile(fullTemplatePath);
      if (!template) {
        throw new Error('No .klore file found in template directory');
      }
      
      // Show template info
      printSection('📦 Template Info');
      printKV('Name', template.name);
      printKV('Version', template.version);
      if (template.framework) printKV('Framework', template.framework);
      printKV('Variables', template.variables.length);
      printKV('Replacements', template.replacements.length);
      
      // Get output path
      let outputPath = options.output;
      if (!outputPath) {
        const outputInput = await p.text({
          message: 'Where do you want to create the new project?',
          placeholder: './my-new-project',
          validate: (value) => {
            if (!value.trim()) return 'Output path is required';
            return undefined;
          }
        });
        
        if (p.isCancel(outputInput)) {
          p.cancel('Installation cancelled.');
          process.exit(0);
        }
        
        outputPath = outputInput as string;
      }
      
      const fullOutputPath = path.resolve(outputPath);
      
      // Build pre-filled values if using defaults
      let prefilledValues: Record<string, string> | undefined;
      if (options.defaults) {
        p.log.info(color.dim('Using default values for all variables...'));
        prefilledValues = {};
        for (const v of template.variables) {
          prefilledValues[v.name] = v.defaultValue || '';
        }
      } else {
        printSection('📝 Configuration');
        p.log.message(color.dim('Please fill in the template variables:'));
      }
      
      const result = await installTemplate({
        templatePath: fullTemplatePath,
        outputPath: fullOutputPath,
        force: options.force,
        values: prefilledValues,
      });
      
      if (result.success) {
        printSection('✨ Installation Complete');
        printKV('Location', result.outputPath);
        printKV('Files', result.filesCreated);
        printKV('Replacements', result.replacementsApplied);
        
        // Show next steps
        const relPath = path.relative(process.cwd(), result.outputPath);
        printSection('🚀 Next Steps');
        console.log(`\n   ${color.green('cd')} ${relPath}`);
        console.log(`   ${color.green('npm install')} (or composer install)`);
        console.log(`   ${color.green('npm run dev')}\n`);
      } else {
        throw new Error(`Installation failed: ${result.errors.join(', ')}`);
      }
    } catch (error) {
      handleError(error);
      process.exit(1);
    }
  });

// =============================================================================
// AI COMMAND
// =============================================================================
program
  .command('ai')
  .description('AI assistant commands')
  .option('-p, --provider <provider>', 'AI provider (ollama, openai, gemini)', 'ollama')
  .option('-m, --model <model>', 'AI model to use')
  .option('--api-key <key>', 'API key for online providers')
  .action(async (options: { provider: string; model?: string; apiKey?: string }) => {
    try {
      const { createAIService, autoDetectProvider } = await import('../core/ai');
      
      // Get base config from options
      let config: any = { 
        provider: options.provider,
        model: options.model,
        apiKey: options.apiKey || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY,
        baseUrl: process.env.OLLAMA_BASE_URL,
      };
      
      // Only auto-detect if the user didn't specify a model or if it's the default ollama
      if (!options.model && options.provider === 'ollama') {
        const detected = await autoDetectProvider();
        if (detected) {
          config = { ...config, ...detected };
        }
      }

      // Ensure model is set if explicitly provided in options
      if (options.model) {
        config.model = options.model;
      }
      
      const ai = createAIService(config);
      const available = await ai.isAvailable();
      
      if (!available) {
        throw new Error(`AI provider '${options.provider}' is not available.\n${options.provider === 'ollama' ? '   Make sure Ollama is running: ollama serve' : '   Check your API key or network connection.'}`);
      }
      
      printHeader('AI Assistant', `Provider: ${options.provider} | Model: ${options.model || 'default'}`);
      
      // Simple REPL for testing
      console.log('\n💬 Enter a message (or "exit" to quit):');
      
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      
      const prompt = () => {
        rl.question('\n> ', async (input) => {
          if (input.toLowerCase() === 'exit') {
            console.log('\n👋 Goodbye!\n');
            rl.close();
            return;
          }
          
          try {
            process.stdout.write('\n🤖 ');
            for await (const chunk of ai.streamChat(input)) {
              process.stdout.write(chunk);
            }
            console.log('\n');
          } catch (error) {
            console.error('\n❌ Error:', (error as Error).message);
          }
          
          prompt();
        });
      };
      
      prompt();
    } catch (error) {
      handleError(error);
      process.exit(1);
    }
  });

// =============================================================================
// GUI COMMAND
// =============================================================================
program
  .command('gui')
  .description('Open the GUI application')
  .action(() => {
    console.log('🚀 Launching Klore GUI...');
    // TODO: Launch Electron app
    console.log('GUI launch not yet implemented');
  });

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
function groupByType(content: DetectedContent[]): Record<string, DetectedContent[]> {
  return content.reduce((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push(item);
    return acc;
  }, {} as Record<string, DetectedContent[]>);
}

function mapContentTypeToVarType(type: string): 'STRING' | 'COLOR' | 'EMAIL' | 'PHONE' | 'URL' {
  switch (type) {
    case 'color': return 'COLOR';
    case 'email': return 'EMAIL';
    case 'phone': return 'PHONE';
    case 'url': return 'URL';
    default: return 'STRING';
  }
}

function mapContentTypeToVarName(type: string): string {
  switch (type) {
    case 'app_name': return 'appName';
    case 'environment_variable': return 'configValue';
    case 'text_content': return 'contentText';
    case 'color': return 'brandColor';
    case 'email': return 'contactEmail';
    case 'phone': return 'phone';
    case 'url': return 'websiteUrl';
    default: return 'variable';
  }
}

function useBasicExtraction(template: KloreTemplate, content: DetectedContent[]) {
  const varNames = new Map<string, number>();
  
  // Group content by value across all files
  const valueGroups = new Map<string, { type: string, files: Set<string> }>();
  
  for (const item of content) {
    if (!valueGroups.has(item.value)) {
      valueGroups.set(item.value, { type: item.type, files: new Set() });
    }
    valueGroups.get(item.value)!.files.add(item.filePath);
  }

  for (const [value, info] of valueGroups.entries()) {
    const baseName = mapContentTypeToVarName(info.type);
    const count = varNames.get(baseName) || 0;
    varNames.set(baseName, count + 1);
    
    const varName = count === 0 ? baseName : `${baseName}${count}`;
    
    template.variables.push({
      name: varName,
      type: mapContentTypeToVarType(info.type),
      defaultValue: value,
      required: info.type === 'app_name' || info.type === 'email',
    });
    
    template.replacements.push({
      original: value,
      variable: varName,
      filePatterns: Array.from(info.files),
    });
  }
}

program.parse();
