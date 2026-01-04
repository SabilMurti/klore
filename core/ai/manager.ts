import { AIProvider, AIMessage, AIConfig, DEFAULT_MODELS, AICompletionResult, AICompletionOptions } from './types';
import { OllamaProvider, OpenAIProvider, GeminiProvider, AnthropicProvider } from './providers';

export class AIManager {
  private provider: AIProvider | null = null;
  private config: AIConfig;
  
  constructor(config: AIConfig) {
    this.config = config;
    this.initProvider();
  }
  
  private initProvider(): void {
    const model = this.config.model || DEFAULT_MODELS[this.config.provider];
    
    switch (this.config.provider) {
      case 'ollama':
        this.provider = new OllamaProvider(model, this.config.baseUrl);
        break;
      case 'openai':
        if (!this.config.apiKey) throw new Error('OpenAI API key required');
        this.provider = new OpenAIProvider(this.config.apiKey, model, this.config.baseUrl);
        break;
      case 'gemini':
        if (!this.config.apiKey) throw new Error('Gemini API key required');
        this.provider = new GeminiProvider(this.config.apiKey, model);
        break;
      case 'anthropic':
        if (!this.config.apiKey) throw new Error('Anthropic API key required');
        this.provider = new AnthropicProvider(this.config.apiKey, model, this.config.baseUrl);
        break;
      default:
        throw new Error(`Unknown provider: ${this.config.provider}`);
    }
  }
  
  async isAvailable(): Promise<boolean> {
    return this.provider?.isAvailable() ?? false;
  }
  
  getProviderName(): string {
    return this.provider?.name ?? 'none';
  }
  
  getProviderType(): 'local' | 'online' | 'none' {
    return this.provider?.type ?? 'none';
  }
  
  async complete(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult> {
    if (!this.provider) throw new Error('No AI provider configured');
    return this.provider.complete(messages, options);
  }
  
  async *streamComplete(messages: AIMessage[], options?: AICompletionOptions): AsyncGenerator<string> {
    if (!this.provider) throw new Error('No AI provider configured');
    if (!this.provider.streamComplete) {
      // Fallback to non-streaming
      const result = await this.provider.complete(messages, options);
      yield result.content;
      return;
    }
    yield* this.provider.streamComplete(messages, options);
  }
  
  async chat(userMessage: string, systemPrompt?: string): Promise<string> {
    const messages: AIMessage[] = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    messages.push({ role: 'user', content: userMessage });
    
    const result = await this.complete(messages);
    return result.content;
  }
}

// Factory function for creating AI manager
export function createAIManager(config: AIConfig): AIManager {
  return new AIManager(config);
}

// Auto-detect available provider
export async function autoDetectProvider(): Promise<AIConfig | null> {
  // Try Ollama first (local)
  const ollama = new OllamaProvider(undefined, process.env.OLLAMA_BASE_URL);
  if (await ollama.isAvailable()) {
    return { provider: 'ollama', baseUrl: process.env.OLLAMA_BASE_URL };
  }
  
  // Check for API keys in environment
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', apiKey: process.env.OPENAI_API_KEY };
  }
  
  if (process.env.GEMINI_API_KEY) {
    return { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY };
  }
  
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY };
  }
  
  return null;
}
