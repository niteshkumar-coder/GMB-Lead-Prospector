
import { GoogleGenAI } from "@google/genai";
import { Lead } from "../types";

export const fetchGmbLeads = async (
  keyword: string, 
  location: string, 
  radius: number,
  userCoords?: { latitude: number, longitude: number }
): Promise<Lead[]> => {
  // Use a fallback to check both window.process and process
  const apiKey = (window as any).process?.env?.API_KEY || process.env.API_KEY;
  
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("API_KEY is not set. Please ensure the 'API_KEY' environment variable is configured in your Vercel project settings.");
  }

  // Initializing inside the function to ensure the latest API key is used
  const ai = new GoogleGenAI({ apiKey });
  
  /**
   * Model Selection:
   * Per instructions: "Maps grounding is only supported in Gemini 2.5 series models."
   * The previous 'gemini-2.5-flash-lite-latest' returned 404. 
   * Using 'gemini-2.5-flash' which is the canonical name used in the Maps Grounding documentation.
   */
  const model = "gemini-2.5-flash"; 
  
  const prompt = `You are a professional GMB Lead Prospector and SEO expert. 
  TASK: Find between 100 to 200 businesses for the keyword "${keyword}" in "${location}" within a ${radius}km radius.
  
  FILTERING RULES:
  1. Only include businesses that are ranking BELOW the top 5 (GMB position 6th or lower).
  2. These are leads that need SEO help to reach the top 3-5.
  3. For each business, collect: 
     - Business Name
     - Phone Number
     - GMB Ranking Position (Estimate if needed, e.g., 12th, 45th)
     - Website URL (write "None" if not available)
     - Maps Location Link
     - Rating (Star rating)
     - Distance from center of ${location}

  OUTPUT FORMAT:
  Return the results ONLY as a Markdown table. Do not include any chat or intro.
  Headers: | Business Name | Phone | Rank | Website | Maps Link | Rating | Distance |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |

  CRITICAL: Provide as many leads as possible. If you cannot reach 200 in one go, provide the maximum possible number (at least 50-100).`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }, { googleSearch: {} }],
        // Maps Grounding requires coordinates if available for better accuracy
        toolConfig: {
          retrievalConfig: {
            latLng: userCoords ? {
              latitude: userCoords.latitude,
              longitude: userCoords.longitude
            } : undefined
          }
        },
        // We want a long response for 100+ leads
        maxOutputTokens: 15000,
        thinkingConfig: { thinkingBudget: 5000 }
      },
    });

    const text = response.text || "";
    if (!text || text.length < 50) {
      throw new Error("The model returned insufficient data. Please try again or refine your keyword.");
    }

    const leads = parseLeadsFromMarkdown(text, keyword);
    
    if (leads.length === 0) {
      throw new Error("Could not parse table data from the AI response. Please try again.");
    }

    return leads;
  } catch (error: any) {
    console.error("Gemini Prospector Error:", error);
    
    // Handle specific status codes or error messages
    if (error?.message?.includes('404')) {
      throw new Error(`Model not found or unavailable. Please contact support. (Model: ${model})`);
    }
    
    if (error?.message?.includes('API key')) {
      throw new Error("The API Key is invalid or restricted. Check your Google AI Studio settings.");
    }

    throw error;
  }
};

const parseLeadsFromMarkdown = (md: string, keyword: string): Lead[] => {
  const lines = md.split('\n');
  const leads: Lead[] = [];
  
  // Locate the header separator line
  const separatorIndex = lines.findIndex(l => l.includes('|') && l.includes('---'));
  if (separatorIndex === -1) {
    // Try to find the first line with at least 5 pipes as a fallback
    const firstTableLine = lines.findIndex(l => (l.match(/\|/g) || []).length >= 6);
    if (firstTableLine === -1) return [];
  }

  const startIdx = separatorIndex !== -1 ? separatorIndex + 1 : 0;
  const dataLines = lines.slice(startIdx);

  dataLines.forEach((line, index) => {
    const cleanLine = line.trim();
    if (!cleanLine.includes('|')) return;
    
    // Standard markdown table parsing
    const parts = cleanLine.split('|')
      .map(p => p.trim())
      .filter((p, i, arr) => {
        // Remove empty strings caused by leading/trailing pipes
        if (i === 0 && p === '') return false;
        if (i === arr.length - 1 && p === '') return false;
        return true;
      });
    
    // We expect at least Business Name, Phone, Rank, Website, Maps Link
    if (parts.length >= 5) {
      const name = parts[0];
      
      // Filter out header text repeating
      if (
        name.toLowerCase().includes('business name') || 
        name.includes('---') || 
        name === '' ||
        name.toLowerCase().includes('header')
      ) return;

      leads.push({
        id: `prospect-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
        businessName: name,
        phoneNumber: parts[1] || 'N/A',
        rank: parseInt(parts[2]?.replace(/[^0-9]/g, '')) || 0,
        website: parts[3] || 'None',
        locationLink: parts[4] || '#',
        rating: parseFloat(parts[5]) || 0,
        distance: parts[6] || 'N/A',
        keyword: keyword
      });
    }
  });

  // Sort by rank ascending (best to worst) as requested
  return leads.sort((a, b) => a.rank - b.rank);
};
