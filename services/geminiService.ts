
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
  // Use a direct approach to get the key
  const apiKey = process.env.API_KEY;
  
  if (!apiKey || apiKey === "undefined" || apiKey.length < 5) {
    throw new Error("System API Key is not detected. 1. Go to Vercel Settings -> Environment Variables. 2. Ensure Key is 'API_KEY'. 3. REDEPLOY your project.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.5-flash"; 
  
  const origin = userCoords 
    ? `GPS Coordinates (${userCoords.latitude}, ${userCoords.longitude})`
    : location;

  const prompt = `GMB DEEP SCAN: Identify 15 businesses for "${keyword}" near ${origin}.
  STRICT RADIUS LIMIT: ${radius}km.
  RANKING TARGET: Positions 6 through 30.
  REQUIRED FIELDS: Name, Phone, Address, Rank, Website, Maps Link, Rating, Distance.
  OUTPUT: Markdown table only.`;

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
    const allLeads = parseLeadsFromMarkdown(text, keyword);
    
    const filteredLeads = allLeads.filter(lead => parseDistanceValue(lead.distance) <= radius);

    if (filteredLeads.length === 0 && allLeads.length > 0) {
      throw new Error(`Results found but all were outside ${radius}km. Try a larger radius.`);
    }

    if (filteredLeads.length === 0) {
      throw new Error("No businesses found in range. Try different keywords.");
    }

    return filteredLeads;
  } catch (error: any) {
    console.error("GMB Scan Error:", error);
    const errorMsg = error.message || "";
    
    if (errorMsg.includes("429") || errorMsg.includes("quota")) {
      throw new QuotaError("API Quota limit reached. Retrying shortly...", 30);
    }
    
    if (errorMsg.includes("API key not valid") || errorMsg.includes("API_KEY")) {
      throw new Error("API Key Invalid. Please check your Vercel Environment Variables and REDEPLOY.");
    }
    
    throw new Error(errorMsg || "Connection failed. Please try again.");
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
    const parts = line.split('|').map(p => p.trim()).filter(p => p !== '');
    if (parts.length >= 7) {
      leads.push({
        id: `l-${Date.now()}-${index}`,
        businessName: parts[0].replace(/\*\*/g, ''),
        phoneNumber: parts[1] || 'N/A',
        address: parts[2] || 'N/A',
        rank: parseInt(parts[3]) || (index + 6),
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
