
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as sql from "mssql";
import { GoogleGenAI, Type } from "@google/genai";

const sqlConfigString = process.env.SqlConnectionString;
const API_KEY = process.env.API_KEY;

let pool: sql.ConnectionPool | null = null;

async function getPool(context: InvocationContext) {
    try {
        if (pool && pool.connected) return pool;
        if (!sqlConfigString) throw new Error("SqlConnectionString no configurada.");
        pool = await new sql.ConnectionPool(sqlConfigString).connect();
        return pool;
    } catch (err: any) {
        context.error("SQL Connection Error:", err.message);
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
            const userPriority = r.priority || 'medium';
            let triage = { summary: r.subject, category: 'General' };
            
            if (API_KEY && API_KEY !== "undefined" && API_KEY !== "") {
                try {
                    const ai = new GoogleGenAI({ apiKey: API_KEY });
                    const response = await ai.models.generateContent({
                        model: "gemini-3-flash-preview",
                        contents: `Analiza: ${r.subject}. Desc: ${r.description}`,
                        config: {
                            responseMimeType: "application/json",
                            responseSchema: {
                                type: Type.OBJECT,
                                properties: {
                                    summary: { type: Type.STRING },
                                    category: { type: Type.STRING, enum: ['Software', 'Hardware', 'Redes', 'Accesos', 'General'] }
                                },
                                required: ['summary', 'category']
                            }
                        }
                    });
                    if (response.text) triage = JSON.parse(response.text.trim());
                } catch (e) { context.warn("AI Fail"); }
            }

            await poolConnection.request()
                .input('id', sql.VarChar, r.id)
                .input('userId', sql.VarChar, r.userId)
                .input('userName', sql.VarChar, r.userName)
                .input('subject', sql.VarChar, r.subject)
                .input('description', sql.Text, r.description || '')
                .input('status', sql.VarChar, 'waiting')
                .input('createdAt', sql.BigInt, Date.now())
                .input('priority', sql.VarChar, userPriority)
                .input('aiSummary', sql.Text, triage.summary)
                .input('category', sql.VarChar, triage.category)
                .query(`INSERT INTO requests (id, userId, userName, subject, description, status, createdAt, priority, aiSummary, category) 
                        VALUES (@id, @userId, @userName, @subject, @description, @status, @createdAt, @priority, @aiSummary, @category)`);
            
            return { status: 201, jsonBody: { success: true } };
        }

        if (method === "patch") {
            const body: any = await req.json();
            context.log(`Actualizando Ticket ${id} a estado ${body.status} por agente ${body.agentName || 'N/A'}`);
            
            try {
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
            } catch (sqlErr: any) {
                context.error("Error SQL en PATCH:", sqlErr.message);
                return { status: 500, jsonBody: { error: "Error de base de datos. ¿Faltan las columnas agentId/agentName?", detail: sqlErr.message } };
            }
        }

        return { status: 405, body: "Method Not Allowed" };
    } catch (err: any) {
        context.error(`Handler Error: ${err.message}`);
        return { status: 500, jsonBody: { error: err.message } };
    }
}

app.http('requests', {
    methods: ['GET', 'POST', 'PATCH'],
    authLevel: 'anonymous',
    route: 'requests/{id?}',
    handler: requestsHandler
});
