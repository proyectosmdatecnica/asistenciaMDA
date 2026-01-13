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
            let triage = { priority: 'medium', summary: r.subject, category: 'General' };
            
            if (API_KEY && API_KEY !== "undefined") {
                try {
                    const ai = new GoogleGenAI({ apiKey: API_KEY });
                    const response = await ai.models.generateContent({
                        model: "gemini-3-flash-preview",
                        contents: `Analiza ticket IT: ${r.subject}. ${r.description || ''}`,
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
                    context.warn("Fallo triaje IA, continuando con datos básicos.");
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
                .query(`UPDATE requests SET status = @status, 
                        startedAt = CASE WHEN @status = 'in-progress' AND startedAt IS NULL THEN @now WHEN @status = 'waiting' THEN NULL ELSE startedAt END, 
                        completedAt = CASE WHEN @status IN ('completed', 'cancelled') THEN @now WHEN @status IN ('waiting', 'in-progress') THEN NULL ELSE completedAt END 
                        WHERE id = @id`);
            return { status: 200, jsonBody: { success: true } };
        }

        return { status: 405, body: "Método no permitido" };
    } catch (err: any) {
        context.error(`Error en ejecución: ${err.message}`);
        return { 
            status: 500, 
            jsonBody: { 
                error: "Error interno del servidor", 
                detail: err.message,
                hint: "Verifica que la base de datos acepte conexiones y que el ConnectionString sea correcto." 
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