
import { GoogleGenAI, Type } from "@google/genai";

export const triageRequest = async (subject: string, description: string) => {
  try {
    // Inicializamos la IA justo antes de usarla, no al cargar el archivo.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analiza la siguiente solicitud de soporte de un usuario y determina:
      1. Prioridad (Baja, Media, Alta).
      2. Un resumen técnico corto (máx 10 palabras) para el agente.
      
      Asunto: ${subject}
      Descripción: ${description}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            priority: {
              type: Type.STRING,
              enum: ['low', 'medium', 'high'],
              description: 'Nivel de urgencia detectado',
            },
            summary: {
              type: Type.STRING,
              description: 'Resumen conciso para el agente técnico',
            },
          },
          required: ['priority', 'summary'],
        },
      },
    });

    const jsonStr = response.text.trim();
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Error in AI triage:", error);
    return { priority: 'medium', summary: 'Solicitud recibida correctamente' };
  }
};