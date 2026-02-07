
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

  const prompt = `You are a high-performance GMB Data Extraction Bot.
  
  TASK: Extract business information for "${keyword}" in "${location}" within ${radius}km.
  
  CRITICAL OUTPUT RULES:
  1. SCOPE: Find 100 to 200 businesses. Start from Rank 1 and go down to Rank 100+.
  2. FORMAT: You MUST return the data ONLY as a Markdown table.
  3. NO PREAMBLE: Do not say "Here are the leads" or "Sure". Start immediately with the table header.
  4. NO CODE BLOCKS: Do not wrap the table in \`\`\` symbols.
  5. DISTANCE: Every business needs a distance from ${referencePoint}. Use "m" or "km".
  6. RANK: Ensure the "Rank" column contains a simple number (e.g. 1, 2, 3).

  COLUMNS:
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
        maxOutputTokens: 30000, // Increased for larger lead counts
        temperature: 0.1
      },
    });

    const text = response.text || "";
    
    // Log response length for debugging purposes
    console.debug(`Response received. Length: ${text.length} chars`);

    const leads = parseLeadsFromMarkdown(text, keyword);
    
    if (leads.length === 0) {
      // If parsing fails, try to see if the AI actually returned an error message instead of a table
      if (text.toLowerCase().includes("limit") || text.toLowerCase().includes("quota")) {
        throw new Error("API Quota or Limit reached. Please try again in a few moments.");
      }
      throw new Error("The AI response could not be parsed into a table. Please try a more specific keyword or location.");
    }

    return leads;
  } catch (error: any) {
    console.error("Prospecting Error:", error);
    throw new Error(error?.message || "An error occurred while scanning Google Maps.");
  }
};

const parseLeadsFromMarkdown = (md: string, keyword: string): Lead[] => {
  if (!md) return [];
  
  const lines = md.split('\n');
  const leads: Lead[] = [];
  
  // Find lines that look like data (contain multiple pipes)
  const dataLines = lines.filter(line => {
    const pipes = (line.match(/\|/g) || []).length;
    // Must have at least 5 pipes to be a valid row in our 7-column table
    return pipes >= 5 && !line.includes('---') && !line.toLowerCase().includes('business name');
  });

  dataLines.forEach((line, index) => {
    // Split and clean parts
    const parts = line.split('|')
      .map(p => p.trim())
      .filter((p, i, arr) => {
        // Remove empty strings resulting from leading/trailing pipes
        if (i === 0 && p === '') return false;
        if (i === arr.length - 1 && p === '') return false;
        return true;
      });
    
    if (parts.length >= 5) {
      // Cleanup common Markdown artifacts (bolding, etc)
      const cleanName = parts[0].replace(/\*\*/g, '').replace(/`/g, '');
      if (!cleanName || cleanName === '') return;

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
