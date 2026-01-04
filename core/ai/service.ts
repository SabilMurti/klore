import { AIManager } from './manager';
import { AIConfig, AIMessage } from './types';
import { 
  SYSTEM_PROMPT, 
  buildTemplatizePrompt, 
  buildBrandParsePrompt, 
  buildSuggestVariablesPrompt,
  buildAnalyzeProjectPrompt,
  buildExtractReplaceablePrompt
} from './prompts';
import { DetectedContent, KloreVariable, ScanResult, ScannedFile } from '../types';

interface TemplatizeResult {
  type: string;
  value: string;
  suggestedName: string;
  required: boolean;
  group: string;
}

interface BrandParseResult {
  [key: string]: string;
}

interface ProjectAnalysis {
  projectType: string;
  description: string;
  mainTechnologies: string[];
  suggestedGroups: string[];
}

interface ReplaceableContent {
  type: string;
  value: string;
  context: string;
  suggestedName: string;
  group: string;
}

export class AIService {
  private manager: AIManager;
  
  constructor(config: AIConfig) {
    this.manager = new AIManager(config);
  }
  
  async isAvailable(): Promise<boolean> {
    return this.manager.isAvailable();
  }

  /**
   * Analyze project structure to determine its type
   */
  async analyzeProjectType(files: ScannedFile[]): Promise<ProjectAnalysis> {
    // Get file list and sample content from key files
    const filePaths = files.map(f => f.relativePath);
    
    // Find main content files for sampling
    const viewFiles = files.filter(f => 
      f.path.endsWith('.html') || 
      f.path.endsWith('.blade.php') || 
      f.path.endsWith('.vue') ||
      f.path.endsWith('.jsx') ||
      f.path.endsWith('.tsx')
    );
    
    const sampleContent = viewFiles
      .slice(0, 3)
      .map(f => `--- ${f.relativePath} ---\n${f.content?.slice(0, 2000) || ''}`)
      .join('\n\n');
    
    const prompt = buildAnalyzeProjectPrompt(filePaths, sampleContent);
    
    const messages: AIMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];
    
    const result = await this.manager.complete(messages, { temperature: 0 });
    
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ProjectAnalysis;
      }
    } catch {
      console.error('Failed to parse project analysis:', result.content);
    }
    
    return {
      projectType: 'unknown',
      description: '',
      mainTechnologies: [],
      suggestedGroups: ['branding', 'contact']
    };
  }

  /**
   * Extract replaceable content from a file using AI
   */
  async extractReplaceableContent(
    projectType: string,
    filename: string,
    content: string
  ): Promise<ReplaceableContent[]> {
    const prompt = buildExtractReplaceablePrompt(projectType, filename, content);
    
    const messages: AIMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];
    
    const result = await this.manager.complete(messages, { temperature: 0 });
    
    try {
      // Clean and parse JSON
      const startObj = result.content.indexOf('{');
      const startArr = result.content.indexOf('[');
      let jsonStr = '';
      
      if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
         // It's likely an object
         const end = result.content.lastIndexOf('}');
         if (end > startObj) jsonStr = result.content.substring(startObj, end + 1);
      } else if (startArr !== -1) {
         // It's likely an array
         const end = result.content.lastIndexOf(']');
         if (end > startArr) jsonStr = result.content.substring(startArr, end + 1);
      }
      
      if (!jsonStr) return [];
      
      // --- Robust JSON Cleaning ---
      // 1. Remove comments
      jsonStr = jsonStr.replace(/\/\/.*$/gm, '');
      // 2. Fix trailing commas
      jsonStr = jsonStr.replace(/,\s*([\}\]])/g, '$1');
      // 3. Escape control characters inside string values
      jsonStr = jsonStr.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
        return match
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t');
      });

      try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) return parsed as ReplaceableContent[];
        if (parsed.items && Array.isArray(parsed.items)) return parsed.items as ReplaceableContent[];
        return [];
      } catch (parseError) {
        // Fallback or log error
        console.debug(`Failed to parse extracted JSON for ${filename}`, parseError);
        return [];
      }
    } catch (e) {
      // Silent fail for this file, continue with others
      console.debug(`Failed to parse JSON for ${filename}:`, (e as Error).message);
    }
    
    return [];
  }

  /**
   * Full smart extraction: analyze project then extract from each view file
   */
  async smartExtractAll(files: ScannedFile[]): Promise<{
    projectAnalysis: ProjectAnalysis;
    replaceables: Array<ReplaceableContent & { filePath: string }>;
  }> {
    console.log('🔍 Analyzing project type...');
    const projectAnalysis = await this.analyzeProjectType(files);
    console.log(`📋 Detected: ${projectAnalysis.projectType} - ${projectAnalysis.description}`);
    
    const replaceables: Array<ReplaceableContent & { filePath: string }> = [];
    
    // Filter to view files - INCLUDE livewire and components as they contain brand content
    const viewFiles = files.filter(f => 
      (f.path.endsWith('.html') || 
       f.path.endsWith('.blade.php') || 
       f.path.endsWith('.vue') ||
       f.path.endsWith('.jsx') ||
       f.path.endsWith('.tsx') ||
       f.path.endsWith('.env.example')) &&
      f.content &&
      !f.path.includes('node_modules') &&
      !f.path.includes('vendor') &&
      !f.path.includes('/errors/') &&
      !f.path.includes('/.zerrors/') &&
      !f.path.includes('/Exports/') &&
      !f.path.includes('/auth/') && // Skip auth views (generic)
      !f.path.includes('/profile/') && // Skip profile views (generic)
      f.content.length > 100 // Skip tiny files
    );
    
    // Prioritize key files for brand content
    const prioritized = viewFiles.sort((a, b) => {
      // High priority: main layout, navbar, footer, homepage
      const highPriority = ['navbar', 'footer', 'homepage', 'app.blade', 'layout', 'welcome'];
      // Medium priority: index, home, about, contact
      const mediumPriority = ['index', 'home', 'about', 'contact', 'landing', 'main'];
      
      const aHighPriority = highPriority.some(t => a.relativePath.toLowerCase().includes(t));
      const bHighPriority = highPriority.some(t => b.relativePath.toLowerCase().includes(t));
      if (aHighPriority && !bHighPriority) return -1;
      if (!aHighPriority && bHighPriority) return 1;
      
      const aMediumPriority = mediumPriority.some(t => a.relativePath.toLowerCase().includes(t));
      const bMediumPriority = mediumPriority.some(t => b.relativePath.toLowerCase().includes(t));
      if (aMediumPriority && !bMediumPriority) return -1;
      if (!aMediumPriority && bMediumPriority) return 1;
      
      // Then sort by content length (larger = more content = more likely main page)
      return (b.content?.length || 0) - (a.content?.length || 0);
    });
    
    // Limit to top 15 files for comprehensive but efficient analysis
    const limitedFiles = prioritized.slice(0, 15);
    
    console.log(`📄 Analyzing ${limitedFiles.length} key files (from ${viewFiles.length} total)...`);
    
    for (let i = 0; i < limitedFiles.length; i++) {
      const file = limitedFiles[i];
      if (!file.content) continue;
      
      // Progress indicator
      console.log(`   [${i + 1}/${limitedFiles.length}] ${file.relativePath}`);
      
      // Add delay between requests to avoid rate limiting (2s for cloud models)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      const extracted = await this.extractReplaceableContent(
        projectAnalysis.projectType,
        file.relativePath,
        file.content
      );
      
      for (const item of extracted) {
        replaceables.push({
          ...item,
          filePath: file.relativePath
        });
      }
    }
    
    // Deduplicate by suggestedName (keep first occurrence)
    const seenNames = new Set<string>();
    const deduped = replaceables.filter(item => {
      if (seenNames.has(item.suggestedName)) return false;
      seenNames.add(item.suggestedName);
      return true;
    });
    
    console.log(`✅ Found ${deduped.length} replaceable items`);
    
    return {
      projectAnalysis,
      replaceables: deduped
    };
  }
  
  /**
   * Analyze a file and detect replaceable content using AI
   */
  async analyzeFileForTemplating(filename: string, content: string): Promise<TemplatizeResult[]> {
    const prompt = buildTemplatizePrompt(filename, content);
    
    const messages: AIMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];
    
    const result = await this.manager.complete(messages);
    
    try {
      const jsonMatch = result.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as TemplatizeResult[];
      }
      return [];
    } catch {
      console.error('Failed to parse AI response:', result.content);
      return [];
    }
  }
  
  /**
   * Parse a brand description and extract values for template variables
   */
  async parseBrandDescription(
    description: string,
    availableVariables: string[]
  ): Promise<BrandParseResult> {
    const prompt = buildBrandParsePrompt(description, availableVariables);
    
    const messages: AIMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];
    
    const result = await this.manager.complete(messages);
    
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as BrandParseResult;
      }
      return {};
    } catch {
      console.error('Failed to parse AI response:', result.content);
      return {};
    }
  }
  
  /**
   * Suggest template variables based on scan results
   */
  async suggestTemplateVariables(
    scanResult: ScanResult,
    detectedContent: DetectedContent[]
  ): Promise<{ variables: KloreVariable[]; groups: Array<{ name: string; variables: string[] }> }> {
    const prompt = buildSuggestVariablesPrompt(
      scanResult.techStack.framework || 'Unknown',
      scanResult.techStack.language,
      detectedContent.map(c => ({ type: c.type, value: c.value }))
    );
    
    const messages: AIMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];
    
    const result = await this.manager.complete(messages, { temperature: 0 });
    
    try {
      const start = result.content.indexOf('{');
      const end = result.content.lastIndexOf('}');
      
      if (start !== -1 && end !== -1 && end > start) {
        let jsonStr = result.content.substring(start, end + 1);
        
        // Robust Cleaning
        jsonStr = jsonStr.replace(/\/\/.*$/gm, '');
        jsonStr = jsonStr.replace(/\.\.\./g, '');
        jsonStr = jsonStr.replace(/["']?\(rest of the variables\)["']?/g, '');
        jsonStr = jsonStr.replace(/["']?\(rest more items\)["']?/g, '');
        jsonStr = jsonStr.replace(/,\s*([\}\]])/g, '$1');
        jsonStr = jsonStr.replace(/,(\s*,)+/g, ',');
        
        try {
          const parsed = JSON.parse(jsonStr) as {
            variables: Array<{
              name: string;
              type: string;
              defaultValue: string;
              required: boolean;
              group?: string;
            }>;
            groups: Array<{ name: string; variables: string[] }>;
          };
          
          return {
            variables: (parsed.variables || []).filter(v => v && v.name).map(v => ({
              name: v.name,
              type: (v.type?.toUpperCase() || 'STRING') as KloreVariable['type'],
              defaultValue: v.defaultValue || '',
              required: v.required ?? false,
            })),
            groups: parsed.groups || [],
          };
        } catch (parseError) {
          console.error('JSON Parse Error after cleaning:', parseError);
          throw parseError;
        }
      }
      return { variables: [], groups: [] };
    } catch (e) {
      console.error('Failed to parse AI response:', result.content);
      return { variables: [], groups: [] };
    }
  }
  
  /**
   * Stream a chat response
   */
  async *streamChat(message: string): AsyncGenerator<string> {
    const messages: AIMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: message },
    ];
    
    yield* this.manager.streamComplete(messages);
  }
  
  /**
   * Simple chat completion
   */
  async chat(message: string): Promise<string> {
    return this.manager.chat(message, SYSTEM_PROMPT);
  }
}

export function createAIService(config: AIConfig): AIService {
  return new AIService(config);
}
