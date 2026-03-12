
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

async function resolveInstalledAppTopic(token: string, targetUserId: string, teamsAppId: string, context: InvocationContext) {
    try {
        const resp = await fetch(`https://graph.microsoft.com/v1.0/users/${targetUserId}/teamwork/installedApps?$expand=teamsApp`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!resp.ok) {
            context.warn('Could not list installedApps for user', targetUserId, resp.status);
            return `https://graph.microsoft.com/v1.0/teamsApps/${teamsAppId}`;
        }
        const j = await resp.json();
        const items = j.value || [];
        for (const it of items) {
            const ta = it.teamsApp || {};
            // Match either by teamsApp.id (catalog id) or teamsApp.externalId (manifest id)
            if (ta.id === teamsAppId || ta.externalId === teamsAppId) {
                return `https://graph.microsoft.com/v1.0/users/${targetUserId}/teamwork/installedApps/${it.id}`;
            }
        }
        // not found -> fallback to teamsApps path (previous behavior)
        context.log('Installed app not found for user; falling back to teamsApps topic', targetUserId, teamsAppId);
        return `https://graph.microsoft.com/v1.0/teamsApps/${teamsAppId}`;
    } catch (e:any) {
        context.warn('Error resolving installedApp topic', e && e.message || e);
        return `https://graph.microsoft.com/v1.0/teamsApps/${teamsAppId}`;
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
        // Ensure notifications_log table exists for storing Graph errors
        await poolConnection.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='notifications_log' AND xtype='U')
            BEGIN
                CREATE TABLE notifications_log (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    createdAt BIGINT NOT NULL,
                    targetEmail VARCHAR(255) NULL,
                    statusCode INT NULL,
                    responseText NVARCHAR(MAX) NULL,
                    errorMessage NVARCHAR(MAX) NULL,
                    payload NVARCHAR(MAX) NULL
                );
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
            
            // Notify active agents (non-blocking; failures don't break request creation)
            (async () => {
                try {
                    // Also notify the team channel via Incoming Webhook (non-blocking)
                    (async () => {
                        try {
                            const webhookUrl = process.env.TEAMS_INCOMING_WEBHOOK;
                            if (webhookUrl) {
                                const title = `Nuevo ticket ${newId} - ${r.subject}`;
                                const text = `Usuario: ${r.userName || r.userId || ''}\nID: ${newId}\nPrioridad: ${r.priority || 'media'}\n\n${r.description || ''}`;
                                const ok = await sendTeamsIncomingWebhook(webhookUrl, title, text, context);
                                if (!ok) context.warn('Incoming webhook notify failed', newId);
                            }
                        } catch (e:any) { context.warn('Incoming webhook error', e && e.message || e); }
                    })();
                    const agentsRes = await poolConnection.request().query("SELECT email FROM authorized_agents WHERE status = 'active' AND notifyReminders = 1 AND email IS NOT NULL");
                    const agents = agentsRes.recordset || [];
                    if (agents.length > 0) {
                        const teamsAppId = process.env.TEAMS_APP_ID;
                        if (!teamsAppId) {
                            context.warn('TEAMS_APP_ID not configured; skipping notifications');
                        } else {
                            const token = await getGraphAppToken(context);
                            for (const a of agents) {
                                const email = a.email;
                                if (!email) continue;
                                try {
                                    // resolve user id
                                    const uresp = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}?$select=id`, {
                                        headers: { Authorization: `Bearer ${token}` }
                                    });
                                    if (!uresp.ok) {
                                        const txt = await uresp.text();
                                        context.warn('Could not resolve user for notification', email, txt);
                                        await poolConnection.request()
                                            .input('createdAt', sql.BigInt, Date.now())
                                            .input('targetEmail', sql.VarChar, email)
                                            .input('statusCode', sql.Int, uresp.status)
                                            .input('responseText', sql.NVarChar, txt)
                                            .input('errorMessage', sql.NVarChar, 'Could not resolve user')
                                            .input('payload', sql.NVarChar, email)
                                            .query(`INSERT INTO notifications_log (createdAt, targetEmail, statusCode, responseText, errorMessage, payload) VALUES (@createdAt,@targetEmail,@statusCode,@responseText,@errorMessage,@payload)`);
                                        continue;
                                    }
                                    const ujson = await uresp.json();
                                    const targetUserId = ujson.id;
                                    if (!targetUserId) continue;

                                    const topicValue = await resolveInstalledAppTopic(token, targetUserId, teamsAppId, context);
                                    const payload = {
                                        topic: { source: 'entityUrl', value: topicValue },
                                        activityType: 'newRequest',
                                        previewText: { content: `Nuevo ticket ${newId}: ${r.subject}` },
                                        templateParameters: [ { name: 'requestId', value: newId }, { name: 'summary', value: r.subject } ]
                                    };

                                    const gres = await fetch(`https://graph.microsoft.com/v1.0/users/${targetUserId}/teamwork/sendActivityNotification`, {
                                        method: 'POST',
                                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                                        body: JSON.stringify(payload)
                                    });
                                    const gresText = await gres.text();
                                    if (!gres.ok) {
                                        context.warn('Failed to send notification to', email, gres.status, gresText);
                                        await poolConnection.request()
                                            .input('createdAt', sql.BigInt, Date.now())
                                            .input('targetEmail', sql.VarChar, email)
                                            .input('statusCode', sql.Int, gres.status)
                                            .input('responseText', sql.NVarChar, gresText)
                                            .input('errorMessage', sql.NVarChar, 'Graph sendActivityNotification failed')
                                            .input('payload', sql.NVarChar, JSON.stringify(payload))
                                            .query(`INSERT INTO notifications_log (createdAt, targetEmail, statusCode, responseText, errorMessage, payload) VALUES (@createdAt,@targetEmail,@statusCode,@responseText,@errorMessage,@payload)`);
                                    }
                                } catch (e:any) {
                                    const em = e && e.message || String(e);
                                    context.warn('Notify agent error', em);
                                    await poolConnection.request()
                                        .input('createdAt', sql.BigInt, Date.now())
                                        .input('targetEmail', sql.VarChar, email)
                                        .input('statusCode', sql.Int, null)
                                        .input('responseText', sql.NVarChar, null)
                                        .input('errorMessage', sql.NVarChar, em)
                                        .input('payload', sql.NVarChar, JSON.stringify({ email, newId, subject: r.subject }))
                                        .query(`INSERT INTO notifications_log (createdAt, targetEmail, statusCode, responseText, errorMessage, payload) VALUES (@createdAt,@targetEmail,@statusCode,@responseText,@errorMessage,@payload)`);
                                }
                            }
                        }
                    }
                } catch (e:any) {
                    context.warn('Notifications dispatch failed', e && e.message || e);
                }
            })();

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

                    // If transitioning to waiting, notify active agents
                    if (status === 'waiting') {
                        (async () => {
                            try {
                                const rres = await poolConnection.request().input('id', sql.VarChar, id).query('SELECT id, subject FROM requests WHERE id = @id');
                                if (!rres.recordset || rres.recordset.length === 0) return;
                                const reqRow = rres.recordset[0];
                                        // Notify team channel via Incoming Webhook when a request moves to waiting
                                        (async () => {
                                            try {
                                                const webhookUrl = process.env.TEAMS_INCOMING_WEBHOOK;
                                                if (webhookUrl) {
                                                    const title = `Ticket en cola ${reqRow.id} - ${reqRow.subject}`;
                                                    const text = `ID: ${reqRow.id}\nResumen: ${reqRow.subject}\n\nRevisar en la app.`;
                                                    const ok = await sendTeamsIncomingWebhook(webhookUrl, title, text, context);
                                                    if (!ok) context.warn('Incoming webhook notify failed for waiting transition', reqRow.id);
                                                }
                                            } catch (e:any) { context.warn('Incoming webhook error (waiting)', e && e.message || e); }
                                        })();
                                const agentsRes = await poolConnection.request().query("SELECT email FROM authorized_agents WHERE status = 'active' AND notifyReminders = 1 AND email IS NOT NULL");
                                const agents = agentsRes.recordset || [];
                                const teamsAppId = process.env.TEAMS_APP_ID;
                                if (!teamsAppId) {
                                    context.warn('TEAMS_APP_ID not configured; skipping notifications');
                                    return;
                                }
                                if (agents.length === 0) return;
                                const token = await getGraphAppToken(context);
                                for (const a of agents) {
                                    const email = a.email;
                                    if (!email) continue;
                                    try {
                                        const uresp = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}?$select=id`, { headers: { Authorization: `Bearer ${token}` } });
                                        if (!uresp.ok) { const txt = await uresp.text(); context.warn('Could not resolve user for notification', email, txt); await poolConnection.request().input('createdAt', sql.BigInt, Date.now()).input('targetEmail', sql.VarChar, email).input('statusCode', sql.Int, uresp.status).input('responseText', sql.NVarChar, txt).input('errorMessage', sql.NVarChar, 'Could not resolve user').input('payload', sql.NVarChar, email).query(`INSERT INTO notifications_log (createdAt, targetEmail, statusCode, responseText, errorMessage, payload) VALUES (@createdAt,@targetEmail,@statusCode,@responseText,@errorMessage,@payload)`); continue; }
                                        const ujson = await uresp.json();
                                        const targetUserId = ujson.id;
                                        if (!targetUserId) continue;
                                        const topicValue = await resolveInstalledAppTopic(token, targetUserId, teamsAppId, context);
                                        const payload = {
                                            topic: { source: 'entityUrl', value: topicValue },
                                            activityType: 'newRequest',
                                            previewText: { content: `Ticket en cola ${reqRow.id}: ${reqRow.subject}` },
                                            templateParameters: [{ name: 'requestId', value: reqRow.id }, { name: 'summary', value: reqRow.subject }]
                                        };
                                        const gres = await fetch(`https://graph.microsoft.com/v1.0/users/${targetUserId}/teamwork/sendActivityNotification`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                                        const gresText = await gres.text();
                                        if (!gres.ok) { context.warn('Failed to send notification to', email, gres.status, gresText); await poolConnection.request().input('createdAt', sql.BigInt, Date.now()).input('targetEmail', sql.VarChar, email).input('statusCode', sql.Int, gres.status).input('responseText', sql.NVarChar, gresText).input('errorMessage', sql.NVarChar, 'Graph sendActivityNotification failed').input('payload', sql.NVarChar, JSON.stringify(payload)).query(`INSERT INTO notifications_log (createdAt, targetEmail, statusCode, responseText, errorMessage, payload) VALUES (@createdAt,@targetEmail,@statusCode,@responseText,@errorMessage,@payload)`); }
                                    } catch (e:any) { const em = e && e.message || String(e); context.warn('Notify agent error', em); await poolConnection.request().input('createdAt', sql.BigInt, Date.now()).input('targetEmail', sql.VarChar, email).input('statusCode', sql.Int, null).input('responseText', sql.NVarChar, null).input('errorMessage', sql.NVarChar, em).input('payload', sql.NVarChar, JSON.stringify({ id, subject: reqRow.subject })).query(`INSERT INTO notifications_log (createdAt, targetEmail, statusCode, responseText, errorMessage, payload) VALUES (@createdAt,@targetEmail,@statusCode,@responseText,@errorMessage,@payload)`); }
                                }
                            } catch (e:any) { context.warn('Notifications dispatch failed', e && e.message || e); }
                        })();
                    }
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

        // Crear tabla si no existe (inicializaci├│n robusta) y asegurar columnas para status/approval
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

// --- Notifications: send Activity Feed via Microsoft Graph (app-only)
let _cachedGraphToken: { token?: string; expiresAt?: number } = {};
async function getGraphAppToken(context: InvocationContext) {
    try {
        if (_cachedGraphToken.token && _cachedGraphToken.expiresAt && Date.now() < _cachedGraphToken.expiresAt - 60000) return _cachedGraphToken.token;
        const tenant = process.env.GRAPH_TENANT_ID;
        const clientId = process.env.GRAPH_CLIENT_ID;
        const clientSecret = process.env.GRAPH_CLIENT_SECRET;
        if (!tenant || !clientId || !clientSecret) throw new Error('Graph app credentials not configured');
        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('scope', 'https://graph.microsoft.com/.default');
        params.append('client_secret', clientSecret);
        params.append('grant_type', 'client_credentials');

        const resp = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
            method: 'POST',
            body: params,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const data = await resp.json();
        if (!resp.ok) {
            context.error('Failed to get Graph token', data);
            throw new Error('Failed to obtain Graph token');
        }
        _cachedGraphToken.token = data.access_token;
        _cachedGraphToken.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
        return _cachedGraphToken.token;
    } catch (err:any) {
        context.error('getGraphAppToken error', err.message || err);
        throw err;
    }
}

// Fallback: send a message to a Teams channel using an Incoming Webhook URL
async function sendTeamsIncomingWebhook(webhookUrl: string, title: string, text: string, context: InvocationContext) {
    try {
        const body = {
            '@type': 'MessageCard',
            '@context': 'http://schema.org/extensions',
            summary: title,
            themeColor: '0076D7',
            title,
            text
        };
        const resp = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!resp.ok) {
            const txt = await resp.text();
            context.warn('Incoming webhook failed', resp.status, txt);
            return false;
        }
        return true;
    } catch (e:any) {
        context.warn('sendTeamsIncomingWebhook error', e && e.message || e);
        return false;
    }
}

export async function sendActivityNotificationHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (req.method.toLowerCase() !== 'post') return { status: 405, body: 'Not Allowed' };
    try {
        const body: any = await req.json();
        const userAadId = body.userAadId;
        const userPrincipalName = body.userPrincipalName;
        const activityType = body.activityType || 'newRequest';
        const previewText = body.previewText || { content: body.summary || 'Ten├®s una nueva solicitud' };
        const templateParameters = Array.isArray(body.templateParameters) ? body.templateParameters : (body.templateParameters ? Object.keys(body.templateParameters).map(k => ({ name: k, value: String(body.templateParameters[k]) })) : []);

        if (!userAadId && !userPrincipalName) return { status: 400, body: 'userAadId or userPrincipalName required' };

        let token: string | undefined;
        try { token = await getGraphAppToken(context); } catch (e) { token = undefined; }
        let targetUserId = userAadId;

        if (!targetUserId && userPrincipalName) {
            // resolve user id by UPN
            const uresp = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userPrincipalName)}?$select=id`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!uresp.ok) {
                const txt = await uresp.text();
                context.error('Failed to resolve user', txt);
                return { status: 404, jsonBody: { error: 'User not found' } };
            }
            const ujson = await uresp.json();
            targetUserId = ujson.id;
        }

        const teamsAppId = process.env.TEAMS_APP_ID || body.teamsAppId;
        const webhook = process.env.TEAMS_INCOMING_WEBHOOK || body.incomingWebhook;

        const topicUrl = body.topicUrl || (teamsAppId ? `https://graph.microsoft.com/v1.0/teamsApps/${teamsAppId}` : undefined);
        const payload = {
            topic: topicUrl ? { source: 'entityUrl', value: topicUrl } : undefined,
            activityType,
            previewText,
            templateParameters
        };

        if (token && teamsAppId) {
            try {
                const gres = await fetch(`https://graph.microsoft.com/v1.0/users/${targetUserId}/teamwork/sendActivityNotification`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const gresText = await gres.text();
                if (gres.ok) return { status: 200, jsonBody: { success: true } };
                context.warn('Graph sendActivityNotification failed', gres.status, gresText);
            } catch (e:any) {
                context.warn('Graph send failed', e && e.message || e);
            }
        }

        if (webhook) {
            const title = previewText && previewText.content ? previewText.content : 'Notificación de Asistencia MDA';
            const text = `Para: ${userPrincipalName || targetUserId}\n\n${title}\n\n${templateParameters && templateParameters.length ? JSON.stringify(templateParameters) : ''}`;
            const ok = await sendTeamsIncomingWebhook(webhook, title, text, context);
            if (ok) return { status: 200, jsonBody: { success: true, fallback: 'webhook' } };
            return { status: 500, jsonBody: { error: 'Failed to send via Graph and webhook' } };
        }

        return { status: 400, body: 'TEAMS_APP_ID env/teamsAppId or TEAMS_INCOMING_WEBHOOK required' };
    } catch (err:any) {
        context.error('sendActivityNotificationHandler error', err.message || err);
        return { status: 500, jsonBody: { error: err.message || err } };
    }
}

app.http('sendActivityNotification', { methods: ['POST'], authLevel: 'anonymous', route: 'notifications/send', handler: sendActivityNotificationHandler });

// Expose notification logs for debugging in Testing
export async function notificationsLogsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        const poolConnection = await getPool(context);
        const limit = parseInt(req.query.get('limit') || '50', 10);
        const result = await poolConnection.request().query(`SELECT TOP (${limit}) id, createdAt, targetEmail, statusCode, responseText, errorMessage, payload FROM notifications_log ORDER BY createdAt DESC`);
        return { status: 200, jsonBody: result.recordset };
    } catch (err:any) {
        context.error('notificationsLogsHandler error', err && err.message || err);
        return { status: 500, jsonBody: { error: err && err.message || err } };
    }
}

app.http('notificationsLogs', { methods: ['GET'], authLevel: 'anonymous', route: 'notifications/logs', handler: notificationsLogsHandler });
