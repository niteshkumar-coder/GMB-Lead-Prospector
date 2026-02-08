
import { GoogleGenAI } from "@google/genai";
import { Lead } from "../types";

export class QuotaError extends Error {
  retryAfter: number;
  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = "QuotaError";
    this.retryAfter = retryAfter;
  }
}

export const fetchGmbLeads = async (
  keyword: string, 
  location: string, 
  radius: number,
  userCoords?: { latitude: number, longitude: number }
): Promise<Lead[]> => {
  const apiKey = (window as any).process?.env?.API_KEY || process.env.API_KEY;
  
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("API_KEY is missing. Please ensure your environment is configured.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.5-flash"; 
  
  const origin = userCoords 
    ? `GPS Coordinates (${userCoords.latitude}, ${userCoords.longitude})`
    : location;

  // Reduced target to 40 to prevent internal Maps tool timeouts and 429s on Free Tier
  const prompt = `GMB SCAN: Find 40 businesses for "${keyword}" near ${origin} (${radius}km).
  
  CRITICAL: Focus on businesses ranking rank 6 to 50 (below top 5).
  
  INSTRUCTIONS:
  1. Use Google Maps tool.
  2. Return ONLY a Markdown table: 
  | Business Name | Phone | Rank | Website | Maps Link | Rating | Distance |
  
  Constraint: Table only, no text.`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: userCoords ? {
              latitude: userCoords.latitude,
              longitude: userCoords.longitude
            } : undefined
          }
        },
        maxOutputTokens: 20000,
        temperature: 0.1
      },
    });

    const text = response.text || "";
    const leads = parseLeadsFromMarkdown(text, keyword);
    
    if (leads.length === 0) {
      throw new Error(`The scanner returned empty results. Try a broader search keyword.`);
    }

    return leads;
  } catch (error: any) {
    console.error("GMB Fetch Error:", error);
    
    const errorMsg = error.message || "";
    // Resource Exhausted or 429 is common on Free Tier
    if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
      const waitMatch = errorMsg.match(/retry in ([\d.]+)s/);
      const waitSeconds = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) : 60;
      throw new QuotaError("API Quota Reached (Free Tier)", waitSeconds);
    }
    
    throw new Error(errorMsg || "Scan failed. Check your internet connection.");
  }
};

const parseLeadsFromMarkdown = (md: string, keyword: string): Lead[] => {
  if (!md) return [];
  const lines = md.split('\n');
  const leads: Lead[] = [];
  
  const dataLines = lines.filter(line => {
    const pipes = (line.match(/\|/g) || []).length;
    return pipes >= 6 && !line.includes('---') && !line.toLowerCase().includes('business name');
  });

  dataLines.forEach((line, index) => {
    const parts = line.split('|')
      .map(p => p.trim())
      .filter((p, i, arr) => !(i === 0 && p === '') && !(i === arr.length - 1 && p === ''));
    
    if (parts.length >= 6) {
      const cleanName = parts[0].replace(/\*\*/g, '').replace(/`/g, '').trim();
      if (!cleanName) return;

      const rawRank = parts[2]?.replace(/[^0-9]/g, '') || '';
      const finalRank = parseInt(rawRank) || (index + 1);

      leads.push({
        id: `lead-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
        businessName: cleanName,
        phoneNumber: parts[1] || 'N/A',
        rank: finalRank,
        website: parts[3] || 'None',
        locationLink: parts[4] || '#',
        rating: parseFloat(parts[5]) || 0,
        distance: parts[6] || '0 km',
        keyword: keyword
      });
    }
  });

  return leads.sort((a, b) => a.rank - b.rank);
};
