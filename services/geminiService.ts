
import { GoogleGenAI } from "@google/genai";
import { Lead } from "../types";

// Never access process.env at the top level. 
// This function is only called when the user clicks 'Search'.
const getAIClient = () => {
  const apiKey = (window as any).process?.env?.API_KEY || (process as any)?.env?.API_KEY || '';
  if (!apiKey) {
    console.error("API_KEY is missing from environment");
  }
  return new GoogleGenAI({ apiKey });
};

export const fetchGmbLeads = async (
  keyword: string, 
  location: string, 
  radius: number,
  userCoords?: { latitude: number, longitude: number }
): Promise<Lead[]> => {
  const ai = getAIClient();
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
        tools: [{ googleMaps: {} }, { googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 8000 },
        maxOutputTokens: 12000, 
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
    let leads = parseLeadsFromMarkdown(text, keyword);
    
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
  
  const separatorIndex = lines.findIndex(l => l.includes('|') && l.includes('---'));
  if (separatorIndex === -1) return [];

  const dataLines = lines.slice(separatorIndex + 1);

  dataLines.forEach((line, index) => {
    const cleanLine = line.trim();
    if (!cleanLine.includes('|')) return;
    
    const parts = cleanLine.split('|').map(p => p.trim());
    
    if (parts[0] === '') parts.shift();
    if (parts[parts.length - 1] === '') parts.pop();

    if (parts.length >= 5) {
      const name = parts[0];
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
    const lines = text.split('\n');
    lines.forEach((line, index) => {
        if (line.includes('|') && line.split('|').length >= 6) {
            const parts = line.split('|').map(p => p.trim()).filter(p => p !== '');
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
