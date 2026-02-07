
import { GoogleGenAI } from "@google/genai";
import { Lead } from "../types";

export const fetchGmbLeads = async (
  keyword: string, 
  location: string, 
  radius: number,
  userCoords?: { latitude: number, longitude: number }
): Promise<Lead[]> => {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("API_KEY is not set in the environment. Please ensure the 'API_KEY' environment variable is configured in your Vercel project settings.");
  }

  // Always initialize right before use as per best practices
  const ai = new GoogleGenAI({ apiKey });
  
  // Maps grounding is only supported in Gemini 2.5 series models.
  // Using gemini-2.5-flash-lite-latest for optimal performance and Maps support.
  const model = "gemini-2.5-flash-lite-latest"; 
  
  const prompt = `You are a professional GMB Lead Prospector. 
  TASK: Find businesses for the keyword "${keyword}" in "${location}" within a ${radius}km radius.
  
  FILTERING RULES:
  1. Only include businesses that are NOT in the top 5 GMB results (ranking position 6th or lower).
  2. For each business, collect: Name, Phone Number, GMB Rank (e.g., 6th, 20th), Website URL, Maps Link, Rating, and Distance.
  3. Aim to find a large number of leads (target 100+).

  OUTPUT FORMAT:
  Return the results ONLY as a Markdown table with these exact headers:
  | Business Name | Phone | Rank | Website | Maps Link | Rating | Distance |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |

  If no website is available, write "None". Use Google Search and Google Maps tools to verify current rankings and data.`;

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
        }
      },
    });

    const text = response.text || "";
    if (!text || text.length < 20) {
      throw new Error("The search returned no results. Try increasing the radius or using a broader keyword.");
    }

    return parseLeadsFromMarkdown(text, keyword);
  } catch (error: any) {
    console.error("Gemini API Error Detail:", error);
    
    // Check for specific error messages from the SDK
    if (error?.message?.includes('API key not valid')) {
      throw new Error("The provided API Key is invalid. Please verify it in your environment settings.");
    }
    
    throw error;
  }
};

const parseLeadsFromMarkdown = (md: string, keyword: string): Lead[] => {
  const lines = md.split('\n');
  const leads: Lead[] = [];
  
  // Find the table start by looking for the Markdown separator line
  const separatorIndex = lines.findIndex(l => l.includes('|') && l.includes('---'));
  if (separatorIndex === -1) return [];

  const dataLines = lines.slice(separatorIndex + 1);

  dataLines.forEach((line, index) => {
    const cleanLine = line.trim();
    if (!cleanLine.includes('|')) return;
    
    // Split by pipe and filter out the empty results from leading/trailing pipes
    const rawParts = cleanLine.split('|');
    const parts = rawParts
      .map(p => p.trim())
      .filter((p, i) => {
        if (i === 0 && p === '') return false;
        if (i === rawParts.length - 1 && p === '') return false;
        return true;
      });
    
    if (parts.length >= 5) {
      const name = parts[0];
      // Skip headers or formatting lines
      if (
        name.toLowerCase().includes('name') || 
        name.includes('---') || 
        name === '' ||
        name.toLowerCase() === 'business name'
      ) return;

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