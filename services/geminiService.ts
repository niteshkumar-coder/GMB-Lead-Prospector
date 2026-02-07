
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
    throw new Error("API_KEY is missing. Please check your environment.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.5-flash"; 
  
  const origin = userCoords 
    ? `Coordinates: ${userCoords.latitude}, ${userCoords.longitude}`
    : location;

  // Simplified prompt to avoid model confusion and ensure tool usage
  const prompt = `Search for "${keyword}" within ${radius}km of ${origin} using Google Maps.
  
  EXTRACT: Approximately 100 businesses.
  DISTANCE: Calculate precisely from the origin point.
  FORMAT: Markdown table ONLY.
  
  Columns: | Business Name | Phone | Rank | Website | Maps Link | Rating | Distance |`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }, { googleSearch: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: userCoords ? {
              latitude: userCoords.latitude,
              longitude: userCoords.longitude
            } : undefined
          }
        },
        maxOutputTokens: 30000,
        temperature: 0.2
      },
    });

    const text = response.text || "";
    const leads = parseLeadsFromMarkdown(text, keyword);
    
    if (leads.length === 0) {
      throw new Error(`The scanner couldn't find "${keyword}" in this specific ${radius}km area. Try increasing the radius or using a simpler keyword.`);
    }

    return leads;
  } catch (error: any) {
    console.error("Prospecting Error:", error);
    throw new Error(error?.message || "Scan failed. Please try again.");
  }
};

const parseLeadsFromMarkdown = (md: string, keyword: string): Lead[] => {
  if (!md) return [];
  const lines = md.split('\n');
  const leads: Lead[] = [];
  
  const dataLines = lines.filter(line => {
    const pipes = (line.match(/\|/g) || []).length;
    return pipes >= 5 && !line.includes('---') && !line.toLowerCase().includes('business name');
  });

  dataLines.forEach((line, index) => {
    const parts = line.split('|')
      .map(p => p.trim())
      .filter((p, i, arr) => !(i === 0 && p === '') && !(i === arr.length - 1 && p === ''));
    
    if (parts.length >= 5) {
      const cleanName = parts[0].replace(/\*\*/g, '').replace(/`/g, '');
      if (!cleanName || cleanName.length < 2) return;

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
