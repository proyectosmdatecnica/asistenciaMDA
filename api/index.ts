
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as sql from "mssql";
import { GoogleGenAI, Type } from "@google/genai";

const sqlConfigString = process.env.SqlConnectionString;
const API_KEY = process.env.API_KEY;

let pool: sql.ConnectionPool | null = null;

async function getPool(context: InvocationContext) {
    try {
        if (pool && pool.connected) return pool;
        
        if (!sqlConfigString) {
            context.error("ERROR: SqlConnectionString no encontrada en Configuration.");
            throw new Error("Missing SqlConnectionString");
        }
        
        context.log("Intentando conectar a SQL Server...");
        pool = await new sql.ConnectionPool(sqlConfigString).connect();
        context.log("Conexión SQL exitosa.");
        return pool;
    } catch (err: any) {
        context.error("Error crítico de conexión SQL:", err.message);
        pool = null;
        throw err;
    }
}

export async function requestsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const method = req.method.toLowerCase();
    const id = req.params.id;

    try {
        const poolConnection = await getPool(context);

        if (method === "get") {
            const result = await poolConnection.request().query("SELECT * FROM requests ORDER BY createdAt DESC");
            return { status: 200, jsonBody: result.recordset };
        } 
        
        if (method === "post") {
            const r: any = await req.json();
            
            // Prioridad elegida por el usuario tiene precedencia
            const userPriority = r.priority || 'medium';

            let triage = { 
                summary: r.subject, 
                category: 'General' 
            };
            
            let aiSuccessful = false;

            if (API_KEY && API_KEY !== "undefined" && API_KEY !== "") {
                try {
                    const ai = new GoogleGenAI({ apiKey: API_KEY });
                    const response = await ai.models.generateContent({
                        model: "gemini-3-flash-preview",
                        contents: `Analiza este ticket de soporte técnico y clasifícalo.
                        Asunto: ${r.subject}
                        Descripción: ${r.description || 'No provista'}`,
                        config: {
                            responseMimeType: "application/json",
                            responseSchema: {
                                type: Type.OBJECT,
                                properties: {
                                    summary: { type: Type.STRING, description: "Un resumen muy breve de menos de 10 palabras" },
                                    category: { type: Type.STRING, enum: ['Software', 'Hardware', 'Redes', 'Accesos', 'General'] }
                                },
                                required: ['summary', 'category']
                            }
                        }
                    });

                    if (response && response.text) {
                        const parsedTriage = JSON.parse(response.text.trim());
                        triage = parsedTriage;
                        aiSuccessful = true;
                        context.log("Triaje por IA completado con éxito.");
                    }
                } catch (aiErr: any) {
                    context.warn("Fallo el servicio de IA (Gemini):", aiErr.message);
                }
            }

            const finalSummary = aiSuccessful ? triage.summary : `[Revisión Manual] ${triage.summary}`;

            await poolConnection.request()
                .input('id', sql.VarChar, r.id || `T-${Math.floor(1000 + Math.random()*8999)}`)
                .input('userId', sql.VarChar, r.userId)
                .input('userName', sql.VarChar, r.userName)
                .input('subject', sql.VarChar, r.subject)
                .input('description', sql.Text, r.description || '')
                .input('status', sql.VarChar, 'waiting')
                .input('createdAt', sql.BigInt, Date.now())
                .input('priority', sql.VarChar, userPriority)
                .input('aiSummary', sql.Text, finalSummary)
                .input('category', sql.VarChar, triage.category)
                .query(`INSERT INTO requests (id, userId, userName, subject, description, status, createdAt, priority, aiSummary, category) 
                        VALUES (@id, @userId, @userName, @subject, @description, @status, @createdAt, @priority, @aiSummary, @category)`);
            
            return { status: 201, jsonBody: { success: true, aiProcessed: aiSuccessful } };
        }

        if (method === "patch") {
            const body: any = await req.json();
            
            // Si el estado es in-progress, actualizamos también el agente
            await poolConnection.request()
                .input('id', sql.VarChar, id)
                .input('status', sql.VarChar, body.status)
                .input('agentId', sql.VarChar, body.agentId || null)
                .input('agentName', sql.VarChar, body.agentName || null)
                .input('now', sql.BigInt, Date.now())
                .query(`UPDATE requests SET 
                        status = @status, 
                        agentId = CASE WHEN @status = 'in-progress' THEN @agentId WHEN @status = 'waiting' THEN NULL ELSE agentId END,
                        agentName = CASE WHEN @status = 'in-progress' THEN @agentName WHEN @status = 'waiting' THEN NULL ELSE agentName END,
                        startedAt = CASE WHEN @status = 'in-progress' AND startedAt IS NULL THEN @now WHEN @status = 'waiting' THEN NULL ELSE startedAt END, 
                        completedAt = CASE WHEN @status IN ('completed', 'cancelled') THEN @now WHEN @status IN ('waiting', 'in-progress') THEN NULL ELSE completedAt END 
                        WHERE id = @id`);
            return { status: 200, jsonBody: { success: true } };
        }

        return { status: 405, body: "Método no permitido" };
    } catch (err: any) {
        context.error(`Error en ejecución del handler: ${err.message}`);
        return { 
            status: 500, 
            jsonBody: { 
                error: "Error interno del servidor", 
                detail: err.message
            } 
        };
    }
}

app.http('requests', {
    methods: ['GET', 'POST', 'PATCH'],
    authLevel: 'anonymous',
    route: 'requests/{id?}',
    handler: requestsHandler
});
