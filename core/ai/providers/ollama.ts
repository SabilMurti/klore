import { AIProvider, AIMessage, AICompletionOptions, AICompletionResult } from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const OLLAMA_DEFAULT_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

interface OllamaResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaStreamResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

export class OllamaProvider implements AIProvider {
  name = 'ollama';
  type: 'local' = 'local';
  
  private baseUrl: string;
  private model: string;
  private useBinary: boolean = false;
  
  constructor(model: string = 'llama3.2', baseUrl: string = OLLAMA_DEFAULT_URL) {
    this.model = model;
    this.baseUrl = baseUrl;
  }
  
  async isAvailable(): Promise<boolean> {
    // 1. Try HTTP
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (response.ok) return true;
    } catch {
      // Ignore HTTP error
    }

    // 2. Try Binary
    try {
      const { stdout } = await execAsync('ollama.exe list');
      if (stdout) {
        this.useBinary = true;
        return true;
      }
    } catch {
      // Ignore Binary error
    }

    return false;
  }
  
  async listModels(): Promise<string[]> {
    if (this.useBinary) {
        try {
            const { stdout } = await execAsync('ollama.exe list');
            // Parse stdout which is like:
            // NAME                        ID              SIZE      MODIFIED    
            // deepseek-coder:1.3b         3ddd2d3fc8d2    776 MB    9 hours ago
            return stdout.split('\n')
                .slice(1) // Skip header
                .filter(line => line.trim())
                .map(line => line.split(/\s+/)[0]);
        } catch {
            return [];
        }
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];
      
      const data = await response.json() as { models: Array<{ name: string }> };
      return data.models?.map(m => m.name) || [];
    } catch {
      return [];
    }
  }
  
  async complete(
    messages: AIMessage[],
    options: AICompletionOptions = {}
  ): Promise<AICompletionResult> {
    if (this.useBinary) {
        // For binary, we can use `ollama.exe run <model> <prompt>`
        // Note: passing JSON structure context is hard via CLI arguments.
        // It's better to pipe the input.
        
        // Construct the full prompt from messages
        // Simple chat concatenation for now as CLI 'run' handles chat reasonably well if passed as one block?
        // Actually `ollama run` is interactive. We should use `ollama run model "prompt"`.
        
        const lastMessage = messages[messages.length - 1];
        let fullPrompt = lastMessage.content;
        
        // Add system prompt if present
        const systemMessage = messages.find(m => m.role === 'system');
        if (systemMessage) {
            fullPrompt = `System: ${systemMessage.content}\n\nUser: ${fullPrompt}`;
        }

        // Escape generic shell characters is tricky.
        // Better to use piping: echo "prompt" | ollama.exe run model
        // But in node child_process, we can write to stdin.
        
        // However, `exec` is simpler. Let's try to just run it.
        // Limitation: might struggle with very complex prompts/escaping.
        
        // Using spawn is safer for large inputs
        const { spawn } = await import('child_process');
        
        return new Promise((resolve, reject) => {
            const child = spawn('ollama.exe', ['run', this.model], { stdio: ['pipe', 'pipe', 'pipe'] });
            
            let output = '';
            let error = '';
            
            child.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            child.stderr.on('data', (data) => {
                // Ollama logs progress to stderr, ignore it for now or log debug
                error += data.toString();
            });
            
            child.on('close', (code) => {
                if (code !== 0) {
                    // Try to extract meaningful error
                    reject(new Error(`Ollama binary exited with code ${code}: ${error}`));
                } else {
                    resolve({
                        content: output.trim(),
                        usage: {
                            promptTokens: 0, // Cannot get usage from CLI easily
                            completionTokens: 0,
                            totalTokens: 0
                        }
                    });
                }
            });
            
            // Send prompt
            child.stdin.write(fullPrompt);
            child.stdin.end();
        });
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 2048,
        },
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }
    
    const data = await response.json() as OllamaResponse;
    
    return {
      content: data.message.content,
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    };
  }
  
  async *streamComplete(
    messages: AIMessage[],
    options: AICompletionOptions = {}
  ): AsyncGenerator<string> {
    if (this.useBinary) {
        // Streaming via binary is possible with spawn
        const { spawn } = await import('child_process');
        const lastMessage = messages[messages.length - 1];
        let fullPrompt = lastMessage.content;
        const systemMessage = messages.find(m => m.role === 'system');
        if (systemMessage) fullPrompt = systemMessage.content + "\n\n" + fullPrompt;

        const child = spawn('ollama.exe', ['run', this.model], { stdio: ['pipe', 'pipe', 'pipe'] });
        
        // This is a bit complex to convert to AsyncGenerator wrapper cleanly inside this method
        // without external state management variables, but we can do a simple push-based approach.
        // Actually, we can return the generator immediately and yield as data comes.
        
        // Since we can't easily bridge event emitter to async generator without a queue:
        // We will just fall back to non-streaming for binary mode to ensure reliability first.
        const result = await this.complete(messages, options);
        yield result.content;
        return;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 2048,
        },
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line) as OllamaStreamResponse;
          if (data.message?.content) {
            yield data.message.content;
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    }
  }
}
