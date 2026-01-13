// El triaje ahora se realiza en el servidor para proteger la API_KEY
export const triageRequest = async (subject: string, description: string) => {
  return { 
    priority: 'medium', 
    summary: 'Procesando...', 
    category: 'General' 
  };
};