
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
  // Safe access to process.env
  const apiKey = typeof process !== 'undefined' ? process.env.API_KEY : undefined;
  
  if (!apiKey) {
    throw new Error("API_KEY not found in environment. If you just added it to Vercel, please REDEPLOY your project for changes to take effect.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.5-flash"; 
  
  const origin = userCoords 
    ? `GPS Coordinates (${userCoords.latitude}, ${userCoords.longitude})`
    : location;

  const prompt = `GMB DEEP SCAN: Identify 15 businesses for "${keyword}" near ${origin}.
  
  STRICT RADIUS LIMIT: All businesses MUST be located within exactly ${radius}km of the starting point. 
  DO NOT return any results located further than ${radius}km away. This is the highest priority.
  
  RANKING TARGET: Only return businesses ranking in positions 6 through 30 (strictly below the top 5 GMB results).
  
  REQUIRED DATA FIELDS FOR EACH BUSINESS:
  1. Business Name
  2. Phone Number (International format if possible)
  3. Physical Address
  4. Approximate Local Rank
  5. Website URL (If none, write 'None')
  6. Google Maps Link
  7. Rating (numeric 0.0 - 5.0)
  8. Exact Distance from ${origin} (specify km or m)
  
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
       throw new Error("The scanner could not verify structured ranking data. Try a more specific business category or location.");
    }

    const allLeads = parseLeadsFromMarkdown(text, keyword);
    
    // CODE-LEVEL RADIUS ENFORCEMENT
    const filteredLeads = allLeads.filter(lead => {
      const distValue = parseDistanceValue(lead.distance);
      return distValue <= radius;
    });

    if (filteredLeads.length === 0 && allLeads.length > 0) {
      throw new Error(`The scanner found leads, but they were all outside your ${radius}km limit. Try increasing the search radius.`);
    }

    if (filteredLeads.length === 0) {
      throw new Error("No qualifying businesses found in the specified range. Try a broader keyword.");
    }

    return filteredLeads;
  } catch (error: any) {
    console.error("GMB Internal Error:", error);
    
    const errorMsg = error.message || "Unknown error";
    
    if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
      const waitMatch = errorMsg.match(/retry in ([\d.]+)s/);
      const waitSeconds = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) : 60;
      throw new QuotaError("Maps network congested. Re-syncing...", waitSeconds);
    }
    
    if (errorMsg.includes("Requested entity was not found") || errorMsg.includes("API Key") || errorMsg.includes("not found in environment")) {
      throw new Error("Authentication failed. Ensure API_KEY is set in Vercel and the project is Redeployed.");
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
    return pipes >= 7 && !line.includes('---') && !line.toLowerCase().includes('business name');
  });

  dataLines.forEach((line, index) => {
    const parts = line.split('|')
      .map(p => p.trim())
      .filter((p, i, arr) => !(i === 0 && p === '') && !(i === arr.length - 1 && p === ''));
    
    if (parts.length >= 7) {
      const cleanName = parts[0].replace(/\*\*/g, '').replace(/`/g, '').trim();
      if (!cleanName) return;

      const rawRank = parts[3]?.replace(/[^0-9]/g, '') || '';
      const finalRank = parseInt(rawRank) || (index + 6); 

      leads.push({
        id: `lead-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
        businessName: cleanName,
        phoneNumber: parts[1] || 'N/A',
        address: parts[2] || 'N/A',
        rank: finalRank,
        website: parts[4] || 'None',
        locationLink: parts[5] || '#',
        rating: parseFloat(parts[6]) || 0,
        distance: parts[7] || 'N/A',
        keyword: keyword
      });
    }
  });

  return leads.sort((a, b) => a.rank - b.rank);
};
