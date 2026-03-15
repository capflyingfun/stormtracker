import OpenAI from "openai";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const OPENAI_MODEL = "gpt-4o";

let groqClient: OpenAI | null = null;
let openaiClient: OpenAI | null = null;

function getGroqClient(): OpenAI | null {
  if (!process.env.GROQ_API_KEY) return null;
  if (!groqClient) {
    groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: GROQ_BASE_URL,
    });
  }
  return groqClient;
}

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

export interface AIChatOptions {
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: "json_object" | "text" };
}

export interface AIChatResult {
  content: string;
  provider: "groq" | "openai";
  model: string;
}

export async function aiChat(options: AIChatOptions): Promise<AIChatResult> {
  const groq = getGroqClient();
  const openai = getOpenAIClient();

  if (groq) {
    try {
      const response = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: options.messages,
        max_tokens: options.max_tokens || 2000,
        temperature: options.temperature ?? 0.7,
        ...(options.response_format ? { response_format: options.response_format } : {}),
      });
      const content = response.choices[0]?.message?.content || "";
      console.log(`🤖 AI Response via Groq (${GROQ_MODEL}) — ${content.length} chars`);
      return { content, provider: "groq", model: GROQ_MODEL };
    } catch (groqError: any) {
      console.log(`⚠️ Groq failed (${groqError.message}), falling back to OpenAI...`);
    }
  }

  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: options.messages,
        max_tokens: options.max_tokens || 2000,
        temperature: options.temperature ?? 0.7,
        ...(options.response_format ? { response_format: options.response_format } : {}),
      });
      const content = response.choices[0]?.message?.content || "";
      console.log(`🤖 AI Response via OpenAI (${OPENAI_MODEL}) — ${content.length} chars`);
      return { content, provider: "openai", model: OPENAI_MODEL };
    } catch (openaiError: any) {
      console.error(`❌ OpenAI also failed: ${openaiError.message}`);
      throw openaiError;
    }
  }

  throw new Error("No AI provider available. Set GROQ_API_KEY or OPENAI_API_KEY.");
}

export function getAvailableProvider(): string {
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

export function getProviderInfo(): { provider: string; model: string; free: boolean } {
  if (process.env.GROQ_API_KEY) {
    return { provider: "Groq", model: GROQ_MODEL, free: true };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: "OpenAI", model: OPENAI_MODEL, free: false };
  }
  return { provider: "None", model: "none", free: false };
}
