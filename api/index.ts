
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as sql from "mssql";
import { GoogleGenAI, Type } from "@google/genai";

const sqlConfigString = process.env.SqlConnectionString;
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

// Handler Principal de Tickets
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
            const countResult = await poolConnection.request().query("SELECT COUNT(*) as total FROM requests");
            const nextNum = (countResult.recordset[0].total + 1).toString().padStart(6, '0');
            const newId = `T-${nextNum}`;

            let triage = { summary: r.subject, category: 'General' };
            if (process.env.API_KEY && process.env.API_KEY !== "undefined") {
                try {
                    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                    const response = await ai.models.generateContent({
                        model: "gemini-3-flash-preview",
                        contents: `Resume este problema tecnico en 10 palabras y clasificalo: Asunto: ${r.subject}. Desc: ${r.description}`,
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
                .input('id', sql.VarChar, newId)
                .input('userId', sql.VarChar, r.userId)
                .input('userName', sql.VarChar, r.userName)
                .input('subject', sql.VarChar, r.subject)
                .input('description', sql.Text, r.description || '')
                .input('status', sql.VarChar, 'waiting')
                .input('createdAt', sql.BigInt, Date.now())
                .input('priority', sql.VarChar, r.priority || 'medium')
                .input('aiSummary', sql.Text, triage.summary)
                .input('category', sql.VarChar, triage.category)
                .query(`INSERT INTO requests (id, userId, userName, subject, description, status, createdAt, priority, aiSummary, category) 
                        VALUES (@id, @userId, @userName, @subject, @description, @status, @createdAt, @priority, @aiSummary, @category)`);
            
            return { status: 201, jsonBody: { success: true, id: newId } };
        }

        if (method === "patch") {
            const body: any = await req.json();
            
            if (body.subject !== undefined || body.description !== undefined) {
                await poolConnection.request()
                    .input('id', sql.VarChar, id)
                    .input('subject', sql.VarChar, body.subject)
                    .input('description', sql.Text, body.description)
                    .input('priority', sql.VarChar, body.priority)
                    .query(`UPDATE requests SET 
                                subject = ISNULL(@subject, subject), 
                                description = ISNULL(@description, description), 
                                priority = ISNULL(@priority, priority) 
                            WHERE id = @id AND status = 'waiting'`);
            } else {
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
            }
            return { status: 200, jsonBody: { success: true } };
        }
        return { status: 405, body: "Not Allowed" };
    } catch (err: any) {
        return { status: 500, jsonBody: { error: err.message } };
    }
}

// Handler de Agentes Autorizados
export async function agentsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const method = req.method.toLowerCase();
    try {
        const poolConnection = await getPool(context);
        
        // Crear tabla si no existe (inicialización robusta)
        await poolConnection.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='authorized_agents' AND xtype='U')
            BEGIN
                CREATE TABLE authorized_agents (
                    email VARCHAR(255) PRIMARY KEY, 
                    addedAt BIGINT NOT NULL
                );
            END
        `);

        if (method === "get") {
            const result = await poolConnection.request().query("SELECT email FROM authorized_agents");
            return { status: 200, jsonBody: result.recordset.map(r => r.email) };
        }
        
        if (method === "post") {
            let body: any;
            try {
                body = await req.json();
            } catch (e) {
                return { status: 400, body: "JSON malformado" };
            }

            const email = body?.email?.toLowerCase();
            if (!email) return { status: 400, body: "Email requerido" };

            context.log(`Intentando registrar agente: ${email}`);
            
            await poolConnection.request()
                .input('email', sql.VarChar, email)
                .input('now', sql.BigInt, Date.now())
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM authorized_agents WHERE email = @email)
                    BEGIN
                        INSERT INTO authorized_agents (email, addedAt) VALUES (@email, @now)
                    END
                `);
                
            return { status: 201, jsonBody: { success: true } };
        }
        
        if (method === "delete") {
            const email = req.query.get('email');
            if (!email) return { status: 400, body: "Email requerido" };
            await poolConnection.request().input('email', sql.VarChar, email).query("DELETE FROM authorized_agents WHERE email = @email");
            return { status: 200, jsonBody: { success: true } };
        }
        
        return { status: 405, body: "Not Allowed" };
    } catch (err: any) {
        context.error("Error en agentsHandler:", err.message);
        return { status: 500, jsonBody: { error: err.message } };
    }
}

app.http('requests', { methods: ['GET', 'POST', 'PATCH'], authLevel: 'anonymous', route: 'requests/{id?}', handler: requestsHandler });
app.http('agents', { methods: ['GET', 'POST', 'DELETE'], authLevel: 'anonymous', route: 'agents', handler: agentsHandler });
