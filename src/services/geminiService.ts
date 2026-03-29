import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateVisualAid(prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: {
      parts: [
        { text: `Medical educational diagram or illustration: ${prompt}. Clean, professional, accurate, highly detailed.` }
      ]
    }
  });

  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) {
    console.error("No image generated. Response:", response);
    throw new Error("No image generated");
  }
  
  for (const part of candidates[0].content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  
  console.error("No image data in response. Parts:", candidates[0].content?.parts);
  throw new Error("No image data in response");
}

export async function* generateNotesStream(
  topic: string,
  wordCount: number,
  files: { data: string; mimeType: string; name: string }[]
): AsyncGenerator<string, void, unknown> {
  const parts: any[] = [];

  // Add files
  for (const file of files) {
    parts.push({
      inlineData: {
        data: file.data,
        mimeType: file.mimeType,
      },
    });
  }

  // Add prompt
  parts.push({
    text: `You are an expert medical tutor. Generate comprehensive, structured study notes on the topic: "${topic}".
    
Instructions:
1. Base your notes primarily on the provided reference materials (if any).
2. Extrapolate and supplement with relevant, up-to-date medical information using web search.
3. The target length for these notes is approximately ${wordCount} words.
4. Format the output in clean Markdown with appropriate headings, bullet points, and emphasis.
5. Include a brief summary at the beginning and key takeaways at the end.
6. To add AI-generated visual aids (diagrams, illustrations), use this exact markdown image syntax: ![description of image](generate-image://<detailed_image_prompt_with_NO_SPACES_use_underscores_instead>). Example: ![Heart Anatomy](generate-image://A_detailed_anatomical_illustration_of_the_human_heart_showing_chambers_and_valves). Include 2-3 visual aids where they would be most educational. IMPORTANT: The image URL MUST NOT contain any spaces. Use underscores (_) instead of spaces.`,
  });

  const responseStream = await ai.models.generateContentStream({
    model: "gemini-3.1-pro-preview",
    contents: { parts },
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction: "You are a helpful medical study assistant. You create structured, accurate, and concise medical notes.",
    },
  });

  for await (const chunk of responseStream) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}

export async function* beautifyNotesStream(
  notes: string
): AsyncGenerator<string, void, unknown> {
  const prompt = `You are an expert medical editor and designer. Take the following medical study notes and improve their formatting and visual appeal using advanced Markdown. 
  
Instructions:
1. Add markdown tables where appropriate to compare concepts.
2. Use bolding, italics, and blockquotes for emphasis and callouts.
3. Create clear, hierarchical headings.
4. Correct any grammar, spelling, or flow issues.
5. DO NOT change the core medical facts.
6. DO NOT remove or alter any image tags (e.g., ![...](generate-image://...)).
7. Return ONLY the improved markdown without any conversational filler.

Notes to improve:
${notes}`;

  const responseStream = await ai.models.generateContentStream({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      systemInstruction: "You are an expert editor who makes markdown notes beautiful, structured, and easy to read.",
    },
  });

  for await (const chunk of responseStream) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}
