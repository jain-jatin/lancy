import { GoogleGenerativeAI } from "@google/generative-ai";

export const apiClient = {
  getGeminiClient(): GoogleGenerativeAI | null {
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || localStorage.getItem("GEMINI_API_KEY");
    if (!apiKey || apiKey.includes("YOUR_FREE_GEMINI")) return null;
    return new GoogleGenerativeAI(apiKey);
  },

  getGroqApiKey(): string | null {
    const apiKey = (import.meta as any).env?.VITE_GROQ_API_KEY || localStorage.getItem("GROQ_API_KEY");
    if (!apiKey || apiKey.includes("YOUR_FREE_GROQ")) return null;
    return apiKey;
  },

  // High-speed Groq fetch helper
  async fetchGroq(apiKey: string, systemPrompt: string, userPrompt: string, modelName = "llama-3.1-8b-instant"): Promise<string> {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.0,
        max_tokens: 300,
      })
    });
    if (!res.ok) {
      throw new Error(`Groq API returned status ${res.status}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  }
};
