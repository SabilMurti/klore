import { AIProvider, AIMessage, AICompletionOptions, AICompletionResult } from '../types';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export class GeminiProvider implements AIProvider {
  name = 'gemini';
  type: 'online' = 'online';
  
  private apiKey: string;
  private model: string;
  
  constructor(apiKey: string, model: string = 'gemini-1.5-flash') {
    this.apiKey = apiKey;
    this.model = model;
  }
  
  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    
    try {
      const response = await fetch(
        `${GEMINI_API_URL}/models?key=${this.apiKey}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }
  
  private convertMessages(messages: AIMessage[]): Array<{ role: string; parts: Array<{ text: string }> }> {
    // Gemini uses 'user' and 'model' roles, combine system into first user message
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');
    
    const converted: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    
    for (let i = 0; i < chatMessages.length; i++) {
      const msg = chatMessages[i];
      let content = msg.content;
      
      // Prepend system message to first user message
      if (i === 0 && msg.role === 'user' && systemMessage) {
        content = `${systemMessage.content}\n\n${content}`;
      }
      
      converted.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: content }],
      });
    }
    
    return converted;
  }
  
  async complete(
    messages: AIMessage[],
    options: AICompletionOptions = {}
  ): Promise<AICompletionResult> {
    const response = await fetch(
      `${GEMINI_API_URL}/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: this.convertMessages(messages),
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxTokens ?? 2048,
          },
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini error: ${error}`);
    }
    
    const data = await response.json() as GeminiResponse;
    const content = data.candidates[0]?.content.parts[0]?.text || '';
    
    return {
      content,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      } : undefined,
    };
  }
  
  async *streamComplete(
    messages: AIMessage[],
    options: AICompletionOptions = {}
  ): AsyncGenerator<string> {
    const response = await fetch(
      `${GEMINI_API_URL}/models/${this.model}:streamGenerateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: this.convertMessages(messages),
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxTokens ?? 2048,
          },
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini error: ${error}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Gemini streams as JSON array chunks
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === '[' || trimmed === ']' || trimmed === ',') continue;
        
        try {
          const parsed = JSON.parse(trimmed.replace(/^,/, '')) as GeminiResponse;
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) yield text;
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}
