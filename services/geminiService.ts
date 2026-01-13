
import { GoogleGenAI, Type } from "@google/genai";

export const triageRequest = async (subject: string, description: string) => {
  const DEFAULT_TRIAGE = { 
    priority: 'medium', 
    summary: 'Solicitud estándar recibida',
    category: 'General'
  };
  
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined") return DEFAULT_TRIAGE;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analiza esta solicitud de IT. 
      Asunto: ${subject}. 
      Descripción: ${description}.
      Clasifícala y resúmela.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            priority: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
            summary: { type: Type.STRING, description: "Resumen de una frase" },
            category: { type: Type.STRING, enum: ['Software', 'Hardware', 'Redes', 'Accesos', 'Otros'] }
          },
          required: ['priority', 'summary', 'category'],
        },
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error en triaje IA:", error);
    return DEFAULT_TRIAGE;
  }
};
