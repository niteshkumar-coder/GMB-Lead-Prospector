
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

/**
 * Helper to extract numeric value from distance strings like "5.2 km" or "800 m"
 */
const parseDistanceValue = (distStr: string): number => {
  if (!distStr) return 0;
  const clean = distStr.toLowerCase().replace(/,/g, '').trim();
  const val = parseFloat(clean);
  if (isNaN(val)) return 0;
  if (clean.endsWith('km')) return val;
  if (clean.endsWith('m')) return val / 1000;
  return val;
};

export const fetchGmbLeads = async (
  keyword: string, 
  location: string, 
  radius: number,
  userCoords?: { latitude: number, longitude: number }
): Promise<Lead[]> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is required to perform this scan. Please connect your account.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.5-flash"; 
  
  const origin = userCoords 
    ? `GPS Coordinates (${userCoords.latitude}, ${userCoords.longitude})`
    : location;

  const prompt = `GMB DEEP SCAN: Identify 15 businesses for "${keyword}" near ${origin}.
  
  STRICT RADIUS LIMIT: All businesses MUST be within exactly ${radius}km of the starting point. 
  DO NOT return any results located further than ${radius}km away.
  
  RANKING TARGET: Focus on businesses ranking in positions 6 through 30 (below the top 5).
  
  REQUIRED DATA FIELDS:
  1. Business Name
  2. Phone Number
  3. Approximate Rank
  4. Website URL (If none, write 'None')
  5. Google Maps Link
  6. Rating (numeric 0.0 - 5.0)
  7. Exact Distance from ${origin} (specify km or m)
  
  OUTPUT: Provide a Markdown table with these columns ONLY. No preamble or chatty text.`;

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
    if (!text.includes('|')) {
       throw new Error("The scanner could not find structured ranking data for this keyword. Try a more common business category.");
    }

    const allLeads = parseLeadsFromMarkdown(text, keyword);
    
    // STRICT FILTERING: Ensure code-level enforcement of the radius
    const filteredLeads = allLeads.filter(lead => {
      const distValue = parseDistanceValue(lead.distance);
      // We allow a small 5% buffer for rounding errors in AI estimation, otherwise strictly enforced
      return distValue <= radius * 1.05;
    });

    if (filteredLeads.length === 0 && allLeads.length > 0) {
      throw new Error(`The scanner found leads, but they were all outside your ${radius}km radius. Try increasing the search radius.`);
    }

    if (filteredLeads.length === 0) {
      throw new Error("No qualifying businesses found within the specified range. Try increasing the search radius.");
    }

    return filteredLeads;
  } catch (error: any) {
    console.error("GMB Internal Error:", error);
    
    const errorMsg = error.message || "Unknown error";
    
    if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
      const waitMatch = errorMsg.match(/retry in ([\d.]+)s/);
      const waitSeconds = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) : 60;
      throw new QuotaError("System cooling down... please wait.", waitSeconds);
    }
    
    if (errorMsg.includes("Requested entity was not found") || errorMsg.includes("API Key")) {
      throw new Error("API Key issue detected. Please re-authenticate the scanner.");
    }
    
    throw new Error(errorMsg);
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
      const finalRank = parseInt(rawRank) || (index + 6); 

      leads.push({
        id: `lead-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
        businessName: cleanName,
        phoneNumber: parts[1] || 'N/A',
        rank: finalRank,
        website: parts[3] || 'None',
        locationLink: parts[4] || '#',
        rating: parseFloat(parts[5]) || 0,
        distance: parts[6] || 'N/A',
        keyword: keyword
      });
    }
  });

  return leads.sort((a, b) => a.rank - b.rank);
};
