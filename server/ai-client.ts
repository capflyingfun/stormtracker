import OpenAI from "openai";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const OPENAI_MODEL = "gpt-4o";

let openrouterClient: OpenAI | null = null;
let groqClient: OpenAI | null = null;
let openaiClient: OpenAI | null = null;

function getOpenRouterClient(): OpenAI | null {
  if (!process.env.OPENROUTER_API_KEY) return null;
  if (!openrouterClient) {
    openrouterClient = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        "HTTP-Referer": "https://stormtracker.onrender.com",
        "X-Title": "StormTracker Weather App",
      },
    });
  }
  return openrouterClient;
}

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
  provider: "openrouter" | "groq" | "openai";
  model: string;
}

export async function aiChat(options: AIChatOptions): Promise<AIChatResult> {
  const openrouter = getOpenRouterClient();
  const groq = getGroqClient();
  const openai = getOpenAIClient();

  if (openrouter) {
    try {
      const response = await openrouter.chat.completions.create({
        model: OPENROUTER_MODEL,
        messages: options.messages,
        max_tokens: options.max_tokens || 2000,
        temperature: options.temperature ?? 0.7,
        ...(options.response_format ? { response_format: options.response_format } : {}),
      });
      const content = response.choices[0]?.message?.content || "";
      const modelUsed = (response as any).model || OPENROUTER_MODEL;
      console.log(`🤖 AI Response via OpenRouter (${modelUsed}) — ${content.length} chars [FREE]`);
      return { content, provider: "openrouter", model: modelUsed };
    } catch (routerError: any) {
      console.log(`⚠️ OpenRouter failed (${routerError.message}), trying next provider...`);
    }
  }

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
      console.log(`🤖 AI Response via Groq (${GROQ_MODEL}) — ${content.length} chars [FREE]`);
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

  throw new Error("No AI provider available. Set OPENROUTER_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY.");
}

export function getAvailableProvider(): string {
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

export function getProviderInfo(): { provider: string; model: string; free: boolean } {
  if (process.env.OPENROUTER_API_KEY) {
    return { provider: "OpenRouter", model: OPENROUTER_MODEL, free: true };
  }
  if (process.env.GROQ_API_KEY) {
    return { provider: "Groq", model: GROQ_MODEL, free: true };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: "OpenAI", model: OPENAI_MODEL, free: false };
  }
  return { provider: "None", model: "none", free: false };
}
