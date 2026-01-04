import { AIProvider, AIMessage, AICompletionOptions, AICompletionResult } from '../types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1';

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamChunk {
  type: string;
  index?: number;
  delta?: {
    type: string;
    text?: string;
  };
}

export class AnthropicProvider implements AIProvider {
  name = 'anthropic';
  type: 'online' = 'online';
  
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  
  constructor(apiKey: string, model: string = 'claude-3-haiku-20240307', baseUrl: string = ANTHROPIC_API_URL) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl;
  }
  
  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }
  
  async complete(
    messages: AIMessage[],
    options: AICompletionOptions = {}
  ): Promise<AICompletionResult> {
    // Anthropic requires a system prompt to be separate if possible, 
    // but the Messages API supports multiple roles if correctly formatted.
    // However, the best practice is to separate it.
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        messages: userMessages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        system: systemMessage?.content,
        temperature: options.temperature ?? 0,
        max_tokens: options.maxTokens ?? 4096,
        stream: false,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic error: ${error}`);
    }
    
    const data = await response.json() as AnthropicResponse;
    
    return {
      content: data.content[0]?.text || '',
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
    };
  }
  
  async *streamComplete(
    messages: AIMessage[],
    options: AICompletionOptions = {}
  ): AsyncGenerator<string> {
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        messages: userMessages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        system: systemMessage?.content,
        temperature: options.temperature ?? 0,
        max_tokens: options.maxTokens ?? 4096,
        stream: true,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic error: ${error}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));
      
      for (const line of lines) {
        const data = line.replace('data: ', '').trim();
        
        try {
          const parsed = JSON.parse(data) as AnthropicStreamChunk;
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield parsed.delta.text;
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}
