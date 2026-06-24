import { GoogleGenAI } from "@google/genai";
import { DashboardStats } from "../types";

// Helper to get the env key if it exists
export const getEnvApiKey = (): string => {
  // @ts-ignore
  if (import.meta.env && import.meta.env.VITE_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_API_KEY;
  }
  return process.env.API_KEY || '';
};

export const generateAIResponse = async (
  prompt: string, 
  stats: DashboardStats, 
  language: string,
  userApiKey?: string
): Promise<string> => {
  const apiKey = userApiKey || getEnvApiKey();

  if (!apiKey) {
    return "API Key is missing. Please enter your Google Gemini API Key in the settings or configure the environment.";
  }

  const ai = new GoogleGenAI({ apiKey });

  // Summarize stats for the prompt context to keep token count reasonable
  const context = {
    totalCollected: Math.round(stats.totalAmount),
    totalDonations: stats.totalDonations,
    avgDonation: Math.round(stats.avgDonation),
    topCauses: stats.byTheme.slice(0, 5).map(c => `${c.name}: ${Math.round(c.value)}€`),
    topCountries: stats.byCountry.slice(0, 5).map(c => `${c.name}: ${Math.round(c.value)}€`),
    recentTrend: "Data available from uploaded CSV"
  };

  const systemInstruction = `You are a helpful and professional data assistant for a charity called "Muslim Hands France". 
  You are analyzing a donor dashboard.
  Current Context: ${JSON.stringify(context)}.
  
  Guidelines:
  1. Answer based on the provided data context.
  2. Be concise but encouraging.
  3. If asked about data not present (like specific names of donors), say you don't have access to private individual data, only aggregates.
  4. Respond in the requested language: ${language}.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      },
    });

    return response.text || "Je n'ai pas pu générer de réponse. Veuillez réessayer.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Une erreur est survenue lors de la connexion à l'assistant IA. Vérifiez votre clé API.";
  }
};