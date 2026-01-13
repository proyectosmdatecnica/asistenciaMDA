import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as sql from "mssql";
import { GoogleGenAI, Type } from "@google/genai";

const sqlConfigString = process.env.SqlConnectionString;
const API_KEY = process.env.API_KEY;

let pool: any = null;

async function getPool(context: InvocationContext) {
    if (pool && pool.connected) return pool;
    if (!sqlConfigString) {
        throw new Error("SqlConnectionString no configurada en las variables de entorno de Azure.");
    }
    context.log("Iniciando conexión a base de datos...");
    pool = await new sql.ConnectionPool(sqlConfigString).connect();
    return pool;
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
            
            let triage = { priority: 'medium', summary: r.subject, category: 'General' };
            
            if (API_KEY && API_KEY !== "undefined") {
                try {
                    const ai = new GoogleGenAI({ apiKey: API_KEY });
                    const response = await ai.models.generateContent({
                        model: "gemini-3-flash-preview",
                        contents: `Analiza este ticket de IT. Asunto: ${r.subject}. Descripción: ${r.description || ''}`,
                        config: {
                            responseMimeType: "application/json",
                            responseSchema: {
                                type: Type.OBJECT,
                                properties: {
                                    priority: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                                    summary: { type: Type.STRING },
                                    category: { type: Type.STRING }
                                },
                                required: ['priority', 'summary', 'category']
                            }
                        }
                    });
                    triage = JSON.parse(response.text);
                } catch (aiErr) {
                    context.warn("IA no disponible temporalmente.");
                }
            }

            await poolConnection.request()
                .input('id', sql.VarChar, r.id || `T-${Math.floor(1000 + Math.random()*8999)}`)
                .input('userId', sql.VarChar, r.userId)
                .input('userName', sql.VarChar, r.userName)
                .input('subject', sql.VarChar, r.subject)
                .input('description', sql.Text, r.description || '')
                .input('status', sql.VarChar, 'waiting')
                .input('createdAt', sql.BigInt, Date.now())
                .input('priority', sql.VarChar, triage.priority)
                .input('aiSummary', sql.Text, triage.summary)
                .input('category', sql.VarChar, triage.category)
                .query(`INSERT INTO requests (id, userId, userName, subject, description, status, createdAt, priority, aiSummary, category) 
                        VALUES (@id, @userId, @userName, @subject, @description, @status, @createdAt, @priority, @aiSummary, @category)`);
            
            return { status: 201, jsonBody: { success: true } };
        }

        if (method === "patch") {
            const body: any = await req.json();
            await poolConnection.request()
                .input('id', sql.VarChar, id)
                .input('status', sql.VarChar, body.status)
                .input('now', sql.BigInt, Date.now())
                .query(`UPDATE requests SET 
                        status = @status, 
                        startedAt = CASE 
                            WHEN @status = 'in-progress' AND startedAt IS NULL THEN @now 
                            WHEN @status = 'waiting' THEN NULL 
                            ELSE startedAt END, 
                        completedAt = CASE 
                            WHEN @status = 'completed' OR @status = 'cancelled' THEN @now 
                            WHEN @status = 'waiting' OR @status = 'in-progress' THEN NULL
                            ELSE completedAt END 
                        WHERE id = @id`);
            return { status: 200, jsonBody: { success: true } };
        }

        return { status: 405, body: "Método no soportado" };
    } catch (err: any) {
        context.error(`Error en la API: ${err.message}`);
        return { status: 500, jsonBody: { error: err.message } };
    }
}

app.http('requests', {
    methods: ['GET', 'POST', 'PATCH'],
    authLevel: 'anonymous',
    route: 'requests/{id?}',
    handler: requestsHandler
});