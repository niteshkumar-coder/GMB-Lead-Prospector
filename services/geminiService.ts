
import { GoogleGenAI } from "@google/genai";
import { Lead } from "../types";

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
  // Gemini 2.5 Flash is required for Google Maps grounding
  const model = "gemini-2.5-flash"; 
  
  const origin = userCoords 
    ? `GPS Coordinates (${userCoords.latitude}, ${userCoords.longitude})`
    : location;

  const prompt = `GMB DEEP SCAN: Find ~100 businesses for "${keyword}" near ${origin} (Radius: ${radius}km).
  
  INSTRUCTIONS:
  1. Use Google Maps tool to fetch REAL businesses.
  2. List up to 100 results, especially those ranked below top 10.
  3. Calculate distance EXACTLY from the origin provided.
  4. Return ONLY a Markdown table with these columns: 
  | Business Name | Phone | Rank | Website | Maps Link | Rating | Distance |
  
  Format: Table only, no intro text.`;

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
        maxOutputTokens: 30000,
        temperature: 0.1
      },
    });

    const text = response.text || "";
    const leads = parseLeadsFromMarkdown(text, keyword);
    
    if (leads.length === 0) {
      throw new Error(`The scanner found 0 results for "${keyword}". Try a larger radius or check if location access is blocked.`);
    }

    return leads;
  } catch (error: any) {
    console.error("GMB Fetch Error:", error);
    
    // Check for Quota/Rate Limit error
    if (error.message?.includes("429") || error.message?.includes("quota")) {
      const waitMatch = error.message.match(/retry in ([\d.]+)s/);
      const waitTime = waitMatch ? waitMatch[1] : "60";
      throw new Error(`API LIMIT REACHED: You are using the Free Tier. Please wait ${waitTime} seconds before scanning again.`);
    }
    
    throw new Error(error?.message || "Scan failed. Check your internet connection.");
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
