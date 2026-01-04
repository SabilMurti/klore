import { KloreTemplate, KloreVariable, KloreGroup, KloreReplacement } from '../types';

// Token types for the .klore parser
type TokenType = 
  | 'NAME' | 'VERSION' | 'AUTHOR' | 'DESCRIPTION'
  | 'FRAMEWORK' | 'REQUIRES'
  | 'VAR' | 'GROUP' | 'REPLACE' | 'WITH' | 'IN'
  | 'IF' | 'THEN' | 'END'
  | 'ON_INSTALL' | 'RUN'
  | 'AI_HINT'
  | 'STRING' | 'IDENTIFIER' | 'ARRAY'
  | 'COLOR' | 'EMAIL' | 'PHONE' | 'URL' | 'NUMBER'
  | 'REQUIRED' | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  line: number;
}

class KloreParser {
  private lines: string[] = [];
  private currentLine = 0;
  
  parse(content: string): KloreTemplate {
    this.lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    this.currentLine = 0;
    
    const template: KloreTemplate = {
      name: '',
      version: '1.0.0',
      author: '',
      description: '',
      variables: [],
      groups: [],
      replacements: [],
      conditionals: [],
      onInstall: [],
      aiHints: [],
    };
    
    while (this.currentLine < this.lines.length) {
      const line = this.lines[this.currentLine];
      this.parseLine(line, template);
      this.currentLine++;
    }
    
    return template;
  }
  
  private parseLine(line: string, template: KloreTemplate): void {
    const tokens = this.tokenize(line);
    if (tokens.length === 0) return;
    
    const command = tokens[0].toUpperCase();
    
    switch (command) {
      case 'NAME':
        template.name = this.extractString(line);
        break;
      case 'VERSION':
        template.version = this.extractString(line);
        break;
      case 'AUTHOR':
        template.author = this.extractString(line);
        break;
      case 'DESCRIPTION':
        template.description = this.extractString(line);
        break;
      case 'FRAMEWORK':
        template.framework = this.extractString(line);
        break;
      case 'REQUIRES':
        template.requires = this.extractArray(line);
        break;
      case 'VAR':
        template.variables.push(this.parseVariable(tokens));
        break;
      case 'ASK':
        template.variables.push(this.parseAsk(line));
        break;
      case 'GROUP':
        template.groups.push(this.parseGroup(tokens));
        break;
      case 'REPLACE':
        template.replacements.push(this.parseReplacement(line));
        break;
      case 'AI_HINT':
        template.aiHints?.push(this.extractString(line));
        break;
      case 'ON_INSTALL':
      case 'ON':
        this.parseOnInstall(template);
        break;
    }
  }
  
  private tokenize(line: string): string[] {
    const tokens: string[] = [];
    const regex = /"[^"]*"|'[^']*'|\[.*?\]|\S+/g;
    let match;
    
    while ((match = regex.exec(line)) !== null) {
      tokens.push(match[0]);
    }
    
    return tokens;
  }
  
  private extractString(line: string): string {
    const match = line.match(/"([^"]*)"|'([^']*)'/);
    return match ? (match[1] || match[2] || '') : '';
  }
  
  private extractArray(line: string): string[] {
    const match = line.match(/\[([^\]]*)\]/);
    if (!match) return [];
    
    return match[1]
      .split(',')
      .map(s => s.trim().replace(/["']/g, ''))
      .filter(s => s.length > 0);
  }
  
  private parseVariable(tokens: string[]): KloreVariable {
    // VAR name TYPE "default" [REQUIRED]
    const name = tokens[1] || '';
    const type = (tokens[2]?.toUpperCase() || 'STRING') as KloreVariable['type'];
    const defaultValue = tokens[3] ? tokens[3].replace(/["']/g, '') : '';
    const required = tokens.some(t => t.toUpperCase() === 'REQUIRED');
    
    return { name, type, defaultValue, required };
  }
  
  private parseAsk(line: string): KloreVariable {
    // ASK varName "question" DEFAULT "value" [REQUIRED]
    const nameMatch = line.match(/^ASK\s+(\w+)/i);
    const defaultMatch = line.match(/DEFAULT\s+"([^"]*)"/i);
    const required = line.toUpperCase().includes('REQUIRED');
    
    const name = nameMatch?.[1] || '';
    const defaultValue = defaultMatch?.[1] || '';
    
    // Infer type from variable name
    let type: KloreVariable['type'] = 'STRING';
    if (name.toLowerCase().includes('color')) type = 'COLOR';
    else if (name.toLowerCase().includes('email')) type = 'EMAIL';
    else if (name.toLowerCase().includes('phone')) type = 'PHONE';
    else if (name.toLowerCase().includes('url')) type = 'URL';
    
    return { name, type, defaultValue, required };
  }
  
  private parseGroup(tokens: string[]): KloreGroup {
    // GROUP name [var1, var2, var3]
    const name = tokens[1] || '';
    const arrayMatch = tokens.join(' ').match(/\[([^\]]*)\]/);
    const variables = arrayMatch 
      ? arrayMatch[1].split(',').map(s => s.trim())
      : [];
    
    return { name, variables };
  }
  
  private parseReplacement(line: string): KloreReplacement {
    // REPLACE "original" WITH {{ variable }} IN "pattern"
    // Regex explanation:
    // REPLACE\s+           : Match REPLACE keyword
    // "((?:[^"\\]|\\.)*)"  : Match original string with escaped quotes support (Group 1)
    // \s+WITH\s+\{\{\s*(\w+)\s*\}\}\s+ : Match WITH {{ var }} (Group 2)
    // IN\s+(.+)$           : Match IN patterns (Group 3)
    
    // Simple checks first to ensure format
    if (!line.includes('REPLACE') || !line.includes('WITH')) return { original: '', variable: '', filePatterns: ['**/*'] };

    try {
      // Extract original string carefully (supporting escaped quotes)
      const afterReplace = line.substring(line.indexOf('REPLACE') + 7).trim();
      let originalEnd = -1;
      
      if (afterReplace.startsWith('"')) {
        let escaped = false;
        for (let i = 1; i < afterReplace.length; i++) {
          if (afterReplace[i] === '\\' && !escaped) {
            escaped = true;
            continue;
          }
          if (afterReplace[i] === '"' && !escaped) {
            originalEnd = i;
            break;
          }
          escaped = false;
        }
      }
      
      let original = '';
      let remaining = '';
      
      if (originalEnd > -1) {
        // Found the quoted string end
        const rawOriginal = afterReplace.substring(1, originalEnd);
        // UNESCAPE: \n -> newline, \" -> ", \\ -> \
        original = rawOriginal
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
          
        remaining = afterReplace.substring(originalEnd + 1);
      } else {
        // Fallback for simple case (shouldn't happen with correct format)
        return { original: '', variable: '', filePatterns: ['**/*'] };
      }
      
      // Parse variable - allow optional quotes around {{ var }}
      // WITH "{{ var }}" or WITH {{ var }}
      const variableMatch = remaining.match(/WITH\s+["']?\{\{\s*(\w+)\s*\}\}["']?/i);
      const variable = variableMatch?.[1] || '';
      
      // Parse patterns
      const patternsMatch = remaining.match(/IN\s+(.+)$/i);
      const filePatterns = patternsMatch
        ? patternsMatch[1].match(/"[^"]+"/g)?.map(s => s.replace(/"/g, '')) || ['**/*']
        : ['**/*'];
        
      return { original, variable, filePatterns };
    } catch (e) {
      // Fallback
      return { original: '', variable: '', filePatterns: ['**/*'] };
    }
  }
  
  private parseOnInstall(template: KloreTemplate): void {
    this.currentLine++;
    while (this.currentLine < this.lines.length) {
      const line = this.lines[this.currentLine];
      if (line.toUpperCase() === 'END') break;
      
      const trimmed = line.trim();
      const upperLine = trimmed.toUpperCase();
      
      if (upperLine.startsWith('RUN')) {
        const command = this.extractString(line);
        if (command) template.onInstall?.push(command);
      } else if (upperLine.startsWith('REPLACE')) {
        template.replacements.push(this.parseReplacement(trimmed));
      }
      
      this.currentLine++;
    }
  }
}

export function parseKlore(content: string): KloreTemplate {
  const parser = new KloreParser();
  return parser.parse(content);
}

export function generateKlore(template: KloreTemplate): string {
  const lines: string[] = [];
  
  lines.push(`# ${template.name} Template`);
  lines.push('# Generated by Klore AI - Comprehensive Templatization');
  lines.push('');
  lines.push(`NAME "${template.name.toLowerCase().replace(/\s+/g, '-')}-template"`);
  if (template.version) lines.push(`VERSION "${template.version}"`);
  if (template.framework) lines.push(`FRAMEWORK "${template.framework}"`);
  lines.push('');
  
  // AI hints if available
  if (template.aiHints && template.aiHints.length > 0) {
    lines.push('# ═══════════════════════════════════════');
    lines.push('# PROJECT ANALYSIS');
    lines.push('# ═══════════════════════════════════════');
    for (const hint of template.aiHints) {
      lines.push(`# ${hint}`);
    }
    lines.push('');
  }

  lines.push('# ═══════════════════════════════════════');
  lines.push('# TEMPLATE VARIABLES');
  lines.push('# ═══════════════════════════════════════');
  lines.push('');

  // Define group order and display names
  const groupOrder = ['branding', 'colors', 'contact', 'content', 'social', 'institution', 'legal', 'maps', 'config'];
  const groupEmojis: Record<string, string> = {
    branding: '🏷️',
    colors: '🎨',
    contact: '📍',
    content: '📝',
    social: '📱',
    institution: '🏫',
    legal: '⚖️',
    maps: '🗺️',
    config: '⚙️'
  };
  const groupDescriptions: Record<string, string> = {
    branding: 'Brand Identity',
    colors: 'Theme Colors',
    contact: 'Contact Information',
    content: 'Page Content',
    social: 'Social Media',
    institution: 'Organization Info',
    legal: 'Legal & Copyright',
    maps: 'Location & Maps',
    config: 'Configuration'
  };

  // Group variables by their semantic group
  const groupedVars: Record<string, KloreVariable[]> = {};
  for (const v of template.variables) {
    const group = template.groups.find(g => g.variables.includes(v.name));
    const groupName = group ? group.name : 'other';
    if (!groupedVars[groupName]) groupedVars[groupName] = [];
    groupedVars[groupName].push(v);
  }

  // Output groups in order
  for (const groupKey of groupOrder) {
    const vars = groupedVars[groupKey];
    if (!vars || vars.length === 0) continue;
    
    const emoji = groupEmojis[groupKey] || '📦';
    const description = groupDescriptions[groupKey] || groupKey;
    
    lines.push(`# ${emoji} ${description.toUpperCase()}`);
    lines.push(`# ${'─'.repeat(40)}`);
    
    for (const v of vars) {
      // Generate smart question based on variable name and type
      let question = generateSmartQuestion(v.name, groupKey);
      
      // Escape and truncate long default values
      let defaultVal = v.defaultValue || '';
      if (defaultVal.length > 100) {
        defaultVal = defaultVal.substring(0, 100) + '...';
      }
      defaultVal = defaultVal.replace(/"/g, '\\"').replace(/\n/g, ' ');
      
      let line = `ASK ${v.name} "${question}"`;
      if (defaultVal) line += ` DEFAULT "${defaultVal}"`;
      if (v.required) line += ' REQUIRED';
      lines.push(line);
    }
    lines.push('');
  }
  
  // Handle any ungrouped variables
  const otherVars = groupedVars['other'] || groupedVars['General Settings'];
  if (otherVars && otherVars.length > 0) {
    lines.push('# 📦 OTHER SETTINGS');
    lines.push(`# ${'─'.repeat(40)}`);
    for (const v of otherVars) {
      const question = generateSmartQuestion(v.name, 'other');
      let defaultVal = (v.defaultValue || '').replace(/"/g, '\\"').replace(/\n/g, ' ');
      if (defaultVal.length > 100) defaultVal = defaultVal.substring(0, 100) + '...';
      
      let line = `ASK ${v.name} "${question}"`;
      if (defaultVal) line += ` DEFAULT "${defaultVal}"`;
      if (v.required) line += ' REQUIRED';
      lines.push(line);
    }
    lines.push('');
  }

  lines.push('# ═══════════════════════════════════════');
  lines.push('# REPLACEMENTS');
  lines.push('# ═══════════════════════════════════════');
  lines.push('');
  lines.push('ON INSTALL');
  lines.push('');
  
  lines.push('    # Setup environment');
  lines.push('    COPY ".env.example" TO ".env"');
  lines.push('');

  // Group replacements by category for readability
  const replacementsByGroup: Record<string, KloreReplacement[]> = {};
  for (const r of template.replacements) {
    const v = template.variables.find(v => v.name === r.variable);
    const group = template.groups.find(g => g.variables.includes(r.variable));
    const groupName = group?.name || 'other';
    if (!replacementsByGroup[groupName]) replacementsByGroup[groupName] = [];
    replacementsByGroup[groupName].push(r);
  }

  for (const groupKey of [...groupOrder, 'other']) {
    const replacements = replacementsByGroup[groupKey];
    if (!replacements || replacements.length === 0) continue;
    
    const emoji = groupEmojis[groupKey] || '📦';
    const description = groupDescriptions[groupKey] || groupKey;
    lines.push(`    # ${emoji} ${description}`);
    
    for (const r of replacements) {
      const patterns = r.filePatterns.map(p => `"${p}"`).join(' ');
      // Escape quotes and newlines - but DON'T truncate! We need the full text for matching
      let original = r.original.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      
      lines.push(`    REPLACE "${original}" WITH "{{ ${r.variable} }}" IN ${patterns}`);
    }
    lines.push('');
  }

  lines.push('    # Run setup commands');
  const commands = template.onInstall || [];
  if (commands.length === 0) {
    lines.push('    RUN "composer install" MESSAGE "Installing PHP dependencies..."');
    lines.push('    RUN "php artisan key:generate" MESSAGE "Generating app key..."');
    lines.push('    RUN "php artisan migrate --seed" MESSAGE "Setting up database..."');
    lines.push('    RUN "npm install" MESSAGE "Installing Node dependencies..."');
    lines.push('    RUN "npm run build" MESSAGE "Building assets..."');
  } else {
    for (const cmd of commands) {
      let msg = `Running ${cmd}...`;
      if (cmd.includes('composer install')) msg = 'Installing PHP dependencies...';
      if (cmd.includes('npm install')) msg = 'Installing Node dependencies...';
      if (cmd.includes('artisan migrate')) msg = 'Setting up database...';
      if (cmd.includes('npm run build')) msg = 'Building assets...';
      
      lines.push(`    RUN "${cmd}" MESSAGE "${msg}"`);
    }
  }

  lines.push('');
  lines.push('END');
  lines.push('');
  lines.push('# ═══════════════════════════════════════');
  lines.push('# Template ready! 🚀');
  lines.push('# ═══════════════════════════════════════');
  
  return lines.join('\n');
}

function generateSmartQuestion(varName: string, groupKey: string): string {
  // Convert camelCase to readable text
  const readable = varName.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
  
  // Group-specific questions
  const questions: Record<string, Record<string, string>> = {
    branding: {
      storeName: 'What is your store/company name?',
      appName: 'What is your application name?',
      companyName: 'What is your company name?',
      tagline: 'What is your tagline/slogan?',
      storeDescription: 'Describe your store/company in one paragraph:',
    },
    colors: {
      primaryColor: 'What is your primary brand color? (hex)',
      secondaryColor: 'What is your secondary color? (hex)',
      accentColor: 'What is your accent color? (hex)',
    },
    contact: {
      email: 'What is your contact email?',
      phone: 'What is your phone number?',
      address: 'What is your business address?',
      businessHours: 'What are your business hours?',
    },
    social: {
      facebookUrl: 'Enter your Facebook URL:',
      instagramUrl: 'Enter your Instagram URL:',
      twitterUrl: 'Enter your Twitter/X URL:',
      youtubeUrl: 'Enter your YouTube URL:',
    },
  };
  
  // Check for specific match
  if (questions[groupKey]?.[varName]) {
    return questions[groupKey][varName];
  }
  
  // Generate generic question
  return `Enter ${readable}:`;
}
