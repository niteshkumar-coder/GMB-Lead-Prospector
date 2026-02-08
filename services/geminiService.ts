
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
  // Directly initialize using process.env.API_KEY as per coding guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Maps grounding is supported in Gemini 2.5 series models.
  const model = "gemini-2.5-flash"; 
  
  const origin = userCoords 
    ? `GPS Coordinates (${userCoords.latitude}, ${userCoords.longitude})`
    : location;

  // Search prompt targeting leads ranking below the top 5
  const prompt = `GMB LEAD GEN: Find 15 businesses for "${keyword}" near ${origin} (${radius}km).
  
  TARGET: Businesses ranking rank 6 to 30 (strictly below top 5 results).
  
  RETURN DATA:
  1. Business Name
  2. Phone
  3. Rank (approximate position)
  4. Website URL
  5. Maps Link
  6. Rating
  7. Distance from ${origin}
  
  OUTPUT: Markdown table ONLY.`;

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
        temperature: 0.1
      },
    });

    const text = response.text || "";
    const leads = parseLeadsFromMarkdown(text, keyword);
    
    if (leads.length === 0) {
      throw new Error(`The scanning engine found no matching results for this keyword. Try a broader search.`);
    }

    return leads;
  } catch (error: any) {
    console.error("GMB Fetch Error:", error);
    
    const errorMsg = error.message || "";
    
    // Check for quota exhaustion and return specific wait time if available
    if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
      const waitMatch = errorMsg.match(/retry in ([\d.]+)s/);
      const waitSeconds = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) : 60;
      throw new QuotaError("API limit reached", waitSeconds);
    }
    
    throw new Error(errorMsg || "Communication failure. Please verify your connection.");
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
