
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

        // Ensure requests table has pause-related columns
        await poolConnection.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'pausedAt' AND Object_ID = Object_ID(N'requests'))
            BEGIN
                ALTER TABLE requests ADD pausedAt BIGINT NULL;
            END
        `);
        await poolConnection.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'pausedAccum' AND Object_ID = Object_ID(N'requests'))
            BEGIN
                ALTER TABLE requests ADD pausedAccum BIGINT DEFAULT 0;
            END
        `);

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
                const now = Date.now();
                const status = body.status;
                // Handle pause/resume and normal transitions
                if (status === 'paused') {
                    await poolConnection.request()
                        .input('id', sql.VarChar, id)
                        .input('agentId', sql.VarChar, body.agentId || null)
                        .input('agentName', sql.VarChar, body.agentName || null)
                        .input('now', sql.BigInt, now)
                        .query(`
                            UPDATE requests SET
                                status = 'paused',
                                agentId = CASE WHEN status = 'waiting' THEN @agentId ELSE agentId END,
                                agentName = CASE WHEN status = 'waiting' THEN @agentName ELSE agentName END,
                                pausedAt = CASE WHEN pausedAt IS NULL THEN @now ELSE pausedAt END
                            WHERE id = @id
                        `);
                } else if (status === 'in-progress') {
                    // resume from paused or start new in-progress
                    await poolConnection.request()
                        .input('id', sql.VarChar, id)
                        .input('agentId', sql.VarChar, body.agentId || null)
                        .input('agentName', sql.VarChar, body.agentName || null)
                        .input('now', sql.BigInt, now)
                        .query(`
                            UPDATE requests SET
                                status = 'in-progress',
                                agentId = @agentId,
                                agentName = @agentName,
                                startedAt = CASE WHEN startedAt IS NULL THEN @now ELSE startedAt END,
                                pausedAccum = ISNULL(pausedAccum, 0) + CASE WHEN pausedAt IS NOT NULL THEN (@now - pausedAt) ELSE 0 END,
                                pausedAt = NULL,
                                completedAt = NULL
                            WHERE id = @id
                        `);
                } else {
                    // other transitions (waiting, completed, cancelled)
                    await poolConnection.request()
                        .input('id', sql.VarChar, id)
                        .input('status', sql.VarChar, status)
                        .input('agentId', sql.VarChar, body.agentId || null)
                        .input('agentName', sql.VarChar, body.agentName || null)
                        .input('now', sql.BigInt, now)
                        .query(`UPDATE requests SET 
                                status = @status, 
                                agentId = CASE WHEN @status = 'in-progress' THEN @agentId WHEN @status = 'waiting' THEN NULL ELSE agentId END,
                                agentName = CASE WHEN @status = 'in-progress' THEN @agentName WHEN @status = 'waiting' THEN NULL ELSE agentName END,
                                startedAt = CASE WHEN @status = 'in-progress' AND startedAt IS NULL THEN @now WHEN @status = 'waiting' THEN NULL ELSE startedAt END, 
                                completedAt = CASE WHEN @status IN ('completed', 'cancelled') THEN @now WHEN @status IN ('waiting', 'in-progress') THEN NULL ELSE completedAt END 
                                WHERE id = @id`);
                }
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

        // Crear tabla si no existe (inicialización robusta) y asegurar columnas para status/approval
        await poolConnection.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='authorized_agents' AND xtype='U')
            BEGIN
                CREATE TABLE authorized_agents (
                    email VARCHAR(255) PRIMARY KEY,
                    addedAt BIGINT NOT NULL,
                    status VARCHAR(20) DEFAULT 'active',
                    requestedAt BIGINT NULL,
                    approver VARCHAR(255) NULL,
                    approvedAt BIGINT NULL
                );
            END
        `);
        // add 'status' column if missing (migration for older DBs)
        await poolConnection.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'status' AND Object_ID = Object_ID(N'authorized_agents'))
            BEGIN
                ALTER TABLE authorized_agents ADD status VARCHAR(20) DEFAULT 'active';
            END
        `);
        // add notifyReminders column if missing
        await poolConnection.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'notifyReminders' AND Object_ID = Object_ID(N'authorized_agents'))
            BEGIN
                ALTER TABLE authorized_agents ADD notifyReminders BIT DEFAULT 1;
            END
        `);

        if (method === "get") {
            const pending = req.query.get('pending');
            if (pending === '1' || pending === 'true') {
                const result = await poolConnection.request().query("SELECT email FROM authorized_agents WHERE status = 'pending'");
                return { status: 200, jsonBody: result.recordset.map(r => r.email) };
            }
            const result = await poolConnection.request().query("SELECT email FROM authorized_agents WHERE status = 'active'");
            return { status: 200, jsonBody: result.recordset.map(r => r.email) };
        }

        if (method === "post") {
            let body: any;
            try { body = await req.json(); } catch (e) { return { status: 400, body: "JSON malformado" }; }
            const email = body?.email?.toLowerCase();
            if (!email) return { status: 400, body: "Email requerido" };
            context.log(`Registro de agente recibido: ${email}`);
            const makeActive = !!body?.active;

            if (makeActive) {
                await poolConnection.request()
                    .input('email', sql.VarChar, email)
                    .input('now', sql.BigInt, Date.now())
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM authorized_agents WHERE email = @email)
                        BEGIN
                            INSERT INTO authorized_agents (email, addedAt, status, approvedAt) VALUES (@email, @now, 'active', @now)
                        END
                        ELSE
                        BEGIN
                            UPDATE authorized_agents SET status = 'active', approver = NULL, approvedAt = @now WHERE email = @email
                        END
                    `);
                return { status: 201, jsonBody: { success: true, status: 'active' } };
            }

            // public join -> create pending unless exists
            const existing = await poolConnection.request().input('email', sql.VarChar, email).query("SELECT status FROM authorized_agents WHERE email = @email");
            if (existing.recordset.length > 0) {
                const st = existing.recordset[0].status;
                if (st === 'active') return { status: 200, jsonBody: { success: true, status: 'active' } };
                if (st === 'pending') return { status: 202, jsonBody: { success: true, status: 'pending' } };
            }

            await poolConnection.request()
                .input('email', sql.VarChar, email)
                .input('now', sql.BigInt, Date.now())
                .query(`
                    INSERT INTO authorized_agents (email, addedAt, status, requestedAt) VALUES (@email, @now, 'pending', @now)
                `);

            return { status: 202, jsonBody: { success: true, status: 'pending' } };
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

// Approve pending request
export async function agentsApproveHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        const poolConnection = await getPool(context);
        let body: any;
        try { body = await req.json(); } catch (e) { return { status: 400, body: 'JSON malformado' }; }
        const email = body?.email?.toLowerCase();
        const approver = body?.approver || 'system';
        if (!email) return { status: 400, body: 'Email requerido' };
        const now = Date.now();
        const result = await poolConnection.request().input('email', sql.VarChar, email).input('approver', sql.VarChar, approver).input('now', sql.BigInt, now)
            .query(`
                UPDATE authorized_agents SET status = 'active', approver = @approver, approvedAt = @now WHERE email = @email AND status = 'pending';
                SELECT @@ROWCOUNT as updated;
            `);
        const updated = result.recordset && result.recordset[0] && (result.recordset[0].updated || result.recordset[0].UPDATED || 0);
        if (updated && updated > 0) return { status: 201, jsonBody: { success: true } };
        return { status: 404, jsonBody: { error: 'No pending request' } };
    } catch (err:any) {
        context.error('agentsApproveHandler error', err.message);
        return { status: 500, jsonBody: { error: err.message } };
    }
}

// Reject pending request
export async function agentsRejectHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        const poolConnection = await getPool(context);
        let body: any;
        try { body = await req.json(); } catch (e) { return { status: 400, body: 'JSON malformado' }; }
        const email = body?.email?.toLowerCase();
        if (!email) return { status: 400, body: 'Email requerido' };
        const result = await poolConnection.request().input('email', sql.VarChar, email).query(`
            DELETE FROM authorized_agents WHERE email = @email AND status = 'pending';
            SELECT @@ROWCOUNT as deleted;
        `);
        const deleted = result.recordset && result.recordset[0] && (result.recordset[0].deleted || result.recordset[0].DELETED || 0);
        if (deleted && deleted > 0) return { status: 200, jsonBody: { success: true } };
        return { status: 404, jsonBody: { error: 'No pending request' } };
    } catch (err:any) {
        context.error('agentsRejectHandler error', err.message);
        return { status: 500, jsonBody: { error: err.message } };
    }
}

app.http('agentsApprove', { methods: ['POST'], authLevel: 'anonymous', route: 'agents/approve', handler: agentsApproveHandler });
app.http('agentsReject', { methods: ['POST'], authLevel: 'anonymous', route: 'agents/reject', handler: agentsRejectHandler });

// Agent settings: GET ?email=...  POST { email, notifyReminders }
export async function agentsSettingsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        const poolConnection = await getPool(context);
        if (req.method.toLowerCase() === 'get') {
            const email = req.query.get('email');
            if (!email) return { status: 400, body: 'Email requerido' };
            const result = await poolConnection.request().input('email', sql.VarChar, email.toLowerCase()).query("SELECT notifyReminders FROM authorized_agents WHERE email = @email");
            if (result.recordset.length === 0) return { status: 200, jsonBody: { notifyReminders: true } };
            const val = result.recordset[0].notifyReminders;
            return { status: 200, jsonBody: { notifyReminders: !!val } };
        }

        if (req.method.toLowerCase() === 'post') {
            let body: any;
            try { body = await req.json(); } catch (e) { return { status: 400, body: 'JSON malformado' }; }
            const email = body?.email?.toLowerCase();
            if (!email) return { status: 400, body: 'Email requerido' };
            const notify = body?.notifyReminders === true ? 1 : 0;
            const now = Date.now();
            // update if exists, else insert as pending with notify flag
            await poolConnection.request()
                .input('email', sql.VarChar, email)
                .input('notify', sql.Bit, notify)
                .input('now', sql.BigInt, now)
                .query(`
                    IF EXISTS (SELECT 1 FROM authorized_agents WHERE email = @email)
                    BEGIN
                        UPDATE authorized_agents SET notifyReminders = @notify WHERE email = @email
                    END
                    ELSE
                    BEGIN
                        INSERT INTO authorized_agents (email, addedAt, status, requestedAt, notifyReminders) VALUES (@email, @now, 'pending', @now, @notify)
                    END
                `);
            return { status: 200, jsonBody: { success: true } };
        }

        return { status: 405, body: 'Not Allowed' };
    } catch (err:any) {
        context.error('agentsSettingsHandler error', err.message);
        return { status: 500, jsonBody: { error: err.message } };
    }
}

app.http('agentsSettings', { methods: ['GET','POST'], authLevel: 'anonymous', route: 'agents/settings', handler: agentsSettingsHandler });
