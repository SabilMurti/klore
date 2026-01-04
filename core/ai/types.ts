// AI Provider types and interfaces

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface AICompletionResult {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIProvider {
  name: string;
  type: 'local' | 'online';
  isAvailable(): Promise<boolean>;
  complete(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult>;
  streamComplete?(messages: AIMessage[], options?: AICompletionOptions): AsyncGenerator<string>;
}

export interface AIConfig {
  provider: 'ollama' | 'openai' | 'gemini' | 'anthropic';
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

// Default models for each provider
export const DEFAULT_MODELS: Record<string, string> = {
  ollama: 'llama3.2',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash-exp',
  anthropic: 'claude-3-5-sonnet-20240620',
};
