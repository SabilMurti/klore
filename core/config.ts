import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface AppConfig {
  aiProvider: 'ollama' | 'openai' | 'anthropic' | 'gemini';
  ollamaModel: string;
  openaiKey?: string;
  anthropicKey?: string;
  geminiKey?: string;
  templatesPath?: string;
}

const CONFIG_PATH = path.join(os.homedir(), '.klore-noir-config.json');

const DEFAULT_CONFIG: AppConfig = {
  aiProvider: 'ollama',
  ollamaModel: 'llama3',
};

export function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
  return DEFAULT_CONFIG;
}

export function saveConfig(config: AppConfig): void {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save config:', e);
    throw e;
  }
}
