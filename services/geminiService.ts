
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

  const prompt = `You are a specialized GMB Deep-Scan Extraction Bot.
  
  TASK: Perform an EXHAUSTIVE scan for "${keyword}" within a STRICT ${radius}km radius of the following starting point: ${referencePoint}.
  
  CRITICAL INSTRUCTIONS:
  1. DISTANCE CALCULATION: For every business found, you MUST calculate the distance starting EXACTLY from the coordinates provided: ${userCoords ? `Latitude ${userCoords.latitude}, Longitude ${userCoords.longitude}` : location}. 
  2. RADIUS ENFORCEMENT: Find EVERY business that falls within the ${radius}km circle.
  3. DATA QUALITY: Only include businesses that are actually within the ${radius}km distance from the starting point.
  4. FORMAT: Return the data ONLY as a Markdown table.
  5. NO CONVERSATION: Start with the table header immediately. No code blocks. No "Sure".

  COLUMNS:
  | Business Name | Phone | Rank | Website | Maps Link | Rating | Distance |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |

  The "Distance" column MUST show how far the business is from ${userCoords ? 'the user\'s GPS location' : 'the city center'}.`;

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
        temperature: 0.1
      },
    });

    const text = response.text || "";
    const leads = parseLeadsFromMarkdown(text, keyword);
    
    if (leads.length === 0) {
      if (text.toLowerCase().includes("limit") || text.toLowerCase().includes("quota")) {
        throw new Error("API Limit reached. Please wait a moment.");
      }
      throw new Error(`No leads found for "${keyword}" within ${radius}km. Try increasing the radius or check if GPS is blocked.`);
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

  return leads.sort((a, b) => a.rank - b.rank);
};
