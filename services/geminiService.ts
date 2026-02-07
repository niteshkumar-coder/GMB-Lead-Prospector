
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
    throw new Error("API_KEY is missing. Please configure it in your environment settings.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // Using gemini-2.5-flash for reliable Maps Grounding
  const model = "gemini-2.5-flash"; 
  
  // Define a clear origin point for the AI
  const referencePoint = userCoords 
    ? `User's Current GPS Location (Lat: ${userCoords.latitude}, Lng: ${userCoords.longitude})`
    : `the geographic center of ${location}`;

  const prompt = `You are a high-performance GMB Deep-Scanner. 
  
  TARGET: Find approximately 100 business leads for "${keyword}" within a ${radius}km radius.
  ORIGIN POINT: ${referencePoint}.

  CRITICAL RULES:
  1. QUANTITY: Aim for a list of 100 leads. If there are fewer than 100 businesses in the area, list ALL of them.
  2. RANKING: Rank them from 1 to 100 based on their Google Maps prominence.
  3. DISTANCE: Calculate the distance for EACH business starting EXACTLY from the GPS coordinates: ${userCoords ? `Lat ${userCoords.latitude}, Lng ${userCoords.longitude}` : location}.
  4. RADIUS: Every result MUST be within ${radius}km of the origin.
  5. FORMAT: Output ONLY a Markdown table. No text before or after.
  6. TABLE COLUMNS: | Business Name | Phone | Rank | Website | Maps Link | Rating | Distance |

  | Business Name | Phone | Rank | Website | Maps Link | Rating | Distance |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |`;

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
        maxOutputTokens: 30000, // Sufficient for ~100 leads
        temperature: 0.1
      },
    });

    const text = response.text || "";
    const leads = parseLeadsFromMarkdown(text, keyword);
    
    if (leads.length === 0) {
      if (text.toLowerCase().includes("limit") || text.toLowerCase().includes("quota")) {
        throw new Error("API Limit reached. Please wait a moment.");
      }
      throw new Error(`No businesses found for "${keyword}" within ${radius}km. Try a broader search.`);
    }

    return leads;
  } catch (error: any) {
    console.error("Prospecting Error:", error);
    throw new Error(error?.message || "An error occurred while scanning the area.");
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

  // Sort by rank ascending
  return leads.sort((a, b) => a.rank - b.rank);
};
