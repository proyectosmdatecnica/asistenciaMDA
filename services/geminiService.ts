
import { GoogleGenAI, Type } from "@google/genai";

export const triageRequest = async (subject: string, description: string) => {
  const DEFAULT_TRIAGE = { priority: 'medium', summary: 'Solicitud estándar recibida' };
  
  // Verificamos si la API Key existe en el entorno antes de inicializar
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined") {
    console.warn("Gemini API Key no configurada. Usando triaje por defecto.");
    return DEFAULT_TRIAGE;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Prioriza y resume esta solicitud de IT. Asunto: ${subject}. Desc: ${description}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            priority: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
            summary: { type: Type.STRING },
          },
          required: ['priority', 'summary'],
        },
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error en triaje IA:", error);
    return DEFAULT_TRIAGE;
  }
};
