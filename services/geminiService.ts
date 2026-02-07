
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
  
  // Define the reference point for the prompt
  const referencePoint = userCoords 
    ? `the user's current GPS coordinates (${userCoords.latitude}, ${userCoords.longitude})`
    : `the geographic center of ${location}`;

  const prompt = `You are an expert GMB Lead Generator. 
  TASK: Find exactly 100 to 200 businesses for the keyword "${keyword}" in or around "${location}" within a ${radius}km radius.
  
  CRITICAL INSTRUCTIONS:
  1. TARGET LEADS: Only include businesses ranking 6th or lower (not in the top 5).
  2. DISTANCE: Calculate the distance for every business relative to ${referencePoint}. This is the most important field.
  3. DATA COLLECTION: 
     - Business Name
     - Phone Number
     - GMB Rank (Estimate position like 7th, 15th, 88th)
     - Website URL (Write "None" if not available)
     - Google Maps Link
     - Rating (Star rating)
     - Distance (e.g., "1.2 km", "5.4 km")

  OUTPUT FORMAT:
  Return ONLY a Markdown table. Do not include any introductory text.
  Headers: | Business Name | Phone | Rank | Website | Maps Link | Rating | Distance |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |

  Maximize the output to reach as close to 200 leads as possible. If the area is small, find all available businesses beyond the top 5.`;

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
        maxOutputTokens: 20000, // High token count for 100-200 leads
        temperature: 0.2 // Lower temperature for more consistent table formatting
      },
    });

    const text = response.text || "";
    if (!text || text.length < 100) {
      throw new Error("The search returned insufficient data. Please try a broader keyword or a larger radius.");
    }

    const leads = parseLeadsFromMarkdown(text, keyword);
    
    if (leads.length === 0) {
      throw new Error("Found results but could not format them into a table. Please try searching again.");
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
    
    if (parts.length >= 6) {
      const name = parts[0];
      if (name.toLowerCase().includes('name') || name.includes('---') || name === '') return;

      leads.push({
        id: `lead-${Date.now()}-${index}`,
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

  return leads.sort((a, b) => a.rank - b.rank);
};
