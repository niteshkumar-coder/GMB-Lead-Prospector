
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
  
  const referencePoint = userCoords 
    ? `the user's current GPS coordinates (${userCoords.latitude}, ${userCoords.longitude})`
    : `the geographic center of ${location}`;

  const prompt = `You are an expert GMB Data Extractor. 
  TASK: Find exactly 100 to 200 businesses for the keyword "${keyword}" in or around "${location}" within a ${radius}km radius.
  
  CRITICAL INSTRUCTIONS:
  1. RANKING SCOPE: Include ALL businesses ranking from the 1st position down to the 100th position. Do not skip any businesses.
  2. DISTANCE: Calculate the exact distance for every business relative to ${referencePoint}.
  3. STRICT UNIT FORMAT: Use "m" for meters (e.g., "350 m") and "km" for kilometers (e.g., "1.2 km").

  REQUIRED DATA FIELDS FOR EACH BUSINESS:
  - Business Name
  - Phone Number
  - GMB Rank (Position number: 1st, 2nd, 3rd... up to 100th)
  - Website URL (Write "None" if not available)
  - Google Maps Link (Direct link to the place)
  - Rating (Numerical star rating)
  - Distance (Format: "X m" or "X.X km")

  OUTPUT FORMAT:
  Return ONLY a Markdown table with the following headers. No preamble or chat.
  | Business Name | Phone | Rank | Website | Maps Link | Rating | Distance |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |

  Maximize the output to provide at least 100 leads. If the area is small, find all available businesses in the top 100 rankings.`;

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
        maxOutputTokens: 20000,
        temperature: 0.1
      },
    });

    const text = response.text || "";
    if (!text || text.length < 100) {
      throw new Error("Insufficient data received. Try searching with a larger radius.");
    }

    const leads = parseLeadsFromMarkdown(text, keyword);
    
    if (leads.length === 0) {
      throw new Error("Could not parse lead data from response. Please try again.");
    }

    return leads;
  } catch (error: any) {
    console.error("Prospecting Error:", error);
    throw new Error(error?.message || "An error occurred while scanning Google Maps.");
  }
};

const parseLeadsFromMarkdown = (md: string, keyword: string): Lead[] => {
  const lines = md.split('\n');
  const leads: Lead[] = [];
  
  const separatorIndex = lines.findIndex(l => l.includes('|') && l.includes('---'));
  if (separatorIndex === -1) return [];

  const dataLines = lines.slice(separatorIndex + 1);

  dataLines.forEach((line, index) => {
    const cleanLine = line.trim();
    if (!cleanLine.includes('|')) return;
    
    const parts = cleanLine.split('|')
      .map(p => p.trim())
      .filter((p, i, arr) => !(i === 0 && p === '') && !(i === arr.length - 1 && p === ''));
    
    if (parts.length >= 7) {
      const name = parts[0];
      if (name.toLowerCase().includes('name') || name.includes('---') || name === '') return;

      leads.push({
        id: `lead-${Date.now()}-${index}`,
        businessName: name,
        phoneNumber: parts[1] || 'N/A',
        rank: parseInt(parts[2]?.replace(/[^0-9]/g, '')) || (index + 1),
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
