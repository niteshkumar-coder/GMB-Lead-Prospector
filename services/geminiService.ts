
import { GoogleGenAI } from "@google/genai";
import { Lead } from "../types";

export const fetchGmbLeads = async (
  keyword: string, 
  location: string, 
  radius: number,
  userCoords?: { latitude: number, longitude: number }
): Promise<Lead[]> => {
  // Always initialize right before use as per instructions for dynamic key handling
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Use gemini-2.5-flash for Maps Grounding support
  const model = "gemini-2.5-flash-latest"; 
  
  const prompt = `You are a professional GMB Lead Prospector. 
  TASK: Find businesses for the keyword "${keyword}" in "${location}" within a ${radius}km radius.
  
  FILTERING RULES:
  1. Only include businesses that are NOT in the top 5 GMB results (ranking position 6th or lower).
  2. For each business, collect: Name, Phone, Rank, Website, Maps Link, Rating, and Distance.
  3. Aim to find as many leads as possible (up to 100 in this batch).

  OUTPUT FORMAT:
  Return the results ONLY as a Markdown table with these exact headers:
  | Business Name | Phone | Rank | Website | Maps Link | Rating | Distance |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |

  If no website is available, write "None". Use Google Search and Google Maps tools to verify data.`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }, { googleSearch: {} }],
        // Note: googleMaps tool requires no responseMimeType or responseSchema
        toolConfig: {
          retrievalConfig: {
            latLng: userCoords ? {
              latitude: userCoords.latitude,
              longitude: userCoords.longitude
            } : undefined
          }
        }
      },
    });

    const text = response.text || "";
    if (!text || text.length < 10) {
      throw new Error("The AI returned an empty or invalid response.");
    }

    return parseLeadsFromMarkdown(text, keyword);
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    // Rethrow with more context if it's a known error type
    if (error?.message?.includes('API_KEY')) {
      throw new Error("Invalid or missing API Key. Please check your Vercel environment variables.");
    }
    throw error;
  }
};

const parseLeadsFromMarkdown = (md: string, keyword: string): Lead[] => {
  const lines = md.split('\n');
  const leads: Lead[] = [];
  
  // Find the table start
  const separatorIndex = lines.findIndex(l => l.includes('|') && l.includes('---'));
  if (separatorIndex === -1) return [];

  const dataLines = lines.slice(separatorIndex + 1);

  dataLines.forEach((line, index) => {
    const cleanLine = line.trim();
    if (!cleanLine.includes('|')) return;
    
    // Split by pipe and clean up
    const parts = cleanLine.split('|')
      .map(p => p.trim())
      .filter((p, i, arr) => !(i === 0 && p === '') && !(i === arr.length - 1 && p === ''));
    
    if (parts.length >= 5) {
      const name = parts[0];
      // Skip header leftovers or empty names
      if (name.toLowerCase().includes('name') || name.includes('---') || name === '') return;

      leads.push({
        id: `lead-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
        businessName: name,
        phoneNumber: parts[1] || 'N/A',
        rank: parseInt(parts[2]?.replace(/[^0-9]/g, '')) || (index + 6),
        website: parts[3] || 'None',
        locationLink: parts[4] || '#',
        rating: parseFloat(parts[5]) || 0,
        distance: parts[6] || 'N/A',
        keyword: keyword
      });
    }
  });

  return leads;
};
