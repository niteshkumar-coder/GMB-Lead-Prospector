
import { GoogleGenAI } from "@google/genai";
import { Lead } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const fetchGmbLeads = async (
  keyword: string, 
  location: string, 
  radius: number,
  userCoords?: { latitude: number, longitude: number }
): Promise<Lead[]> => {
  // Maps grounding is supported in Gemini 2.5 series models.
  const model = "gemini-2.5-flash"; 
  
  const prompt = `You are a professional GMB Lead Prospector. 
  TASK: Find 100 to 200 businesses for the keyword "${keyword}" within a ${radius}km radius of "${location}".
  
  TOOL USAGE INSTRUCTIONS:
  1. Use Google Maps to find businesses strictly within the specified ${radius}km radius of "${location}".
  2. Use Google Search to cross-reference which businesses are currently ranking below the top 5 (positions 6-100).
  3. Verify phone numbers and website links using the tools.

  LEAD SELECTION CRITERIA:
  - Target businesses that are NOT in the top 3-5 "Local Pack" or Map results.
  - Prioritize businesses with lower ratings or those that are physically located further from the specific coordinate center of ${location} but still within ${radius}km.
  
  OUTPUT FORMAT:
  Return ONLY a Markdown table. Do not include introductory text.
  Headers: | Business Name | Phone | Rank | Website | Maps Link | Rating | Distance |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |

  Important: I need a very long list (as close to 200 as possible). If one search isn't enough, expand the search depth within the specified radius for better coverage.`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        // googleMaps can be used with googleSearch per rules.
        tools: [{ googleMaps: {} }, { googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 8000 },
        maxOutputTokens: 12000, // Increased to handle large tables
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
    console.debug("Gemini response length:", text.length);
    
    // Attempt standard parse
    let leads = parseLeadsFromMarkdown(text, keyword);
    
    // Fallback for cases where the table might be malformed or split
    if (leads.length === 0 && text.includes('|')) {
       leads = fallbackParse(text, keyword);
    }

    return leads;
  } catch (error) {
    console.error("Critical error in Gemini GMB Fetch:", error);
    throw error;
  }
};

const parseLeadsFromMarkdown = (md: string, keyword: string): Lead[] => {
  const lines = md.split('\n');
  const leads: Lead[] = [];
  
  // Find where the table data actually begins
  const separatorIndex = lines.findIndex(l => l.includes('|') && l.includes('---'));
  if (separatorIndex === -1) return [];

  const dataLines = lines.slice(separatorIndex + 1);

  dataLines.forEach((line, index) => {
    const cleanLine = line.trim();
    if (!cleanLine.includes('|')) return;
    
    // Split and clean parts
    const parts = cleanLine.split('|').map(p => p.trim());
    
    // Remove leading/trailing empty elements from split
    if (parts[0] === '') parts.shift();
    if (parts[parts.length - 1] === '') parts.pop();

    if (parts.length >= 5) {
      const name = parts[0];
      // Skip headers or separators if they somehow got into dataLines
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

const fallbackParse = (text: string, keyword: string): Lead[] => {
    const leads: Lead[] = [];
    // More aggressive line-by-line check for table rows
    const lines = text.split('\n');
    lines.forEach((line, index) => {
        if (line.includes('|') && line.split('|').length >= 6) {
            const parts = line.split('|').map(p => p.trim()).filter(p => p !== '');
            // Simple check to avoid headers
            if (parts[0].toLowerCase().includes('name') || parts[0].includes('---')) return;
            
            leads.push({
                id: `fb-lead-${Date.now()}-${index}`,
                businessName: parts[0],
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
