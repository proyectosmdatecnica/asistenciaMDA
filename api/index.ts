
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as sql from "mssql";
import { GoogleGenAI, Type } from "@google/genai";

type DbMode = 'prod' | 'qa';

const sqlConfigStringProd = process.env.SqlConnectionString;
const sqlConfigStringQa = process.env.SqlConnectionStringQA || process.env.SqlConnectionString_QA;
let poolProd: sql.ConnectionPool | null = null;
let poolQa: sql.ConnectionPool | null = null;
let poolControl: sql.ConnectionPool | null = null;

async function getControlPool(context: InvocationContext) {
    try {
        if (poolControl && poolControl.connected) return poolControl;
        if (!sqlConfigStringProd) throw new Error("SqlConnectionString no configurada.");
        poolControl = await new sql.ConnectionPool(sqlConfigStringProd).connect();
        return poolControl;
    } catch (err: any) {
        context.error("Control SQL Connection Error:", err.message);
        poolControl = null;
        throw err;
    }
}

async function ensureTestingUsersTable(poolConnection: sql.ConnectionPool) {
    await poolConnection.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='testing_users' AND xtype='U')
        BEGIN
            CREATE TABLE testing_users (
                email VARCHAR(255) PRIMARY KEY,
                addedAt BIGINT NOT NULL,
                addedBy VARCHAR(255) NULL
            );
        END
    `);
}

async function isTestingUser(email: string, context: InvocationContext): Promise<boolean> {
    if (!email || !email.includes('@')) return false;
    try {
        const controlPool = await getControlPool(context);
        await ensureTestingUsersTable(controlPool);
        const result = await controlPool.request()
            .input('email', sql.VarChar, email.toLowerCase())
            .query("SELECT TOP 1 email FROM testing_users WHERE email = @email");
        return (result.recordset || []).length > 0;
    } catch (err: any) {
        context.warn('Could not resolve testing user mode', err?.message || err);
        return false;
    }
}

async function resolveDbMode(req: HttpRequest, context: InvocationContext): Promise<DbMode> {
    const raw = (req.headers.get('x-app-mode') || '').trim().toLowerCase();
    if (raw === 'qa' || raw === 'test' || raw === 'testing') return 'qa';
    if (raw === 'prod' || raw === 'production') return 'prod';

    const email = (req.headers.get('x-user-email') || '').trim().toLowerCase();
    if (email) {
        const testingUser = await isTestingUser(email, context);
        if (testingUser) return 'qa';
    }

    return 'prod';
}

function getConnectionString(mode: DbMode): string | undefined {
    if (mode === 'qa') return sqlConfigStringQa || sqlConfigStringProd;
    return sqlConfigStringProd;
}

async function getPool(context: InvocationContext, mode: DbMode) {
    try {
        if (mode === 'qa' && poolQa && poolQa.connected) return poolQa;
        if (mode === 'prod' && poolProd && poolProd.connected) return poolProd;
        const conn = getConnectionString(mode);
        if (!conn) throw new Error("SqlConnectionString no configurada para el modo solicitado.");

        if (mode === 'qa' && !sqlConfigStringQa) {
            context.warn('SqlConnectionStringQA no configurada, usando SqlConnectionString (prod)');
        }

        const created = await new sql.ConnectionPool(conn).connect();
        if (mode === 'qa') poolQa = created;
        else poolProd = created;
        return created;
    } catch (err: any) {
        context.error("SQL Connection Error:", err.message);
        if (mode === 'qa') poolQa = null;
        else poolProd = null;
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

async function insertNotificationLog(
    poolConnection: sql.ConnectionPool,
    targetEmail: string | null,
    statusCode: number | null,
    responseText: string | null,
    errorMessage: string,
    payload: string | null
) {
    await poolConnection.request()
        .input('createdAt', sql.BigInt, Date.now())
        .input('targetEmail', sql.VarChar, targetEmail)
        .input('statusCode', sql.Int, statusCode)
        .input('responseText', sql.NVarChar, responseText)
        .input('errorMessage', sql.NVarChar, errorMessage)
        .input('payload', sql.NVarChar, payload)
        .query(`INSERT INTO notifications_log (createdAt, targetEmail, statusCode, responseText, errorMessage, payload) VALUES (@createdAt,@targetEmail,@statusCode,@responseText,@errorMessage,@payload)`);
}

// Handler Principal de Tickets
export async function requestsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const method = req.method.toLowerCase();
    const id = req.params.id;
    const dbMode = await resolveDbMode(req, context);

    try {
        const poolConnection = await getPool(context, dbMode);

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
        await poolConnection.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'closeComment' AND Object_ID = Object_ID(N'requests'))
            BEGIN
                ALTER TABLE requests ADD closeComment NVARCHAR(MAX) NULL;
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
            
            // Notify active agents (awaited to avoid losing work at function teardown)
            try {
                const title = `Nuevo ticket ${newId} - ${r.subject}`;
                const text = `Usuario: ${r.userName || r.userId || ''}\nID: ${newId}\nPrioridad: ${r.priority || 'media'}\n\n${r.description || ''}`;
                const channelResult = await sendTeamsChannelNotification(title, text, context);
                if (!channelResult.ok) {
                    context.warn('Channel notification failed', channelResult.provider, newId, channelResult.statusCode, channelResult.errorMessage);
                    await insertNotificationLog(
                        poolConnection,
                        null,
                        channelResult.statusCode ?? null,
                        channelResult.responseText ?? null,
                        channelResult.errorMessage || 'Channel notification failed',
                        JSON.stringify({ ticketId: newId, subject: r.subject, provider: channelResult.provider })
                    );
                }

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
                                    templateParameters: [{ name: 'requestId', value: newId }, { name: 'summary', value: r.subject }]
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
                    const closeComment = typeof body.closeComment === 'string' ? body.closeComment.trim() : '';
                    await poolConnection.request()
                        .input('id', sql.VarChar, id)
                        .input('status', sql.VarChar, status)
                        .input('agentId', sql.VarChar, body.agentId || null)
                        .input('agentName', sql.VarChar, body.agentName || null)
                        .input('now', sql.BigInt, now)
                        .input('closeComment', sql.NVarChar, closeComment || null)
                        .query(`UPDATE requests SET 
                                status = @status, 
                                agentId = CASE WHEN @status = 'in-progress' THEN @agentId WHEN @status = 'waiting' THEN NULL ELSE agentId END,
                                agentName = CASE WHEN @status = 'in-progress' THEN @agentName WHEN @status = 'waiting' THEN NULL ELSE agentName END,
                                startedAt = CASE WHEN @status = 'in-progress' AND startedAt IS NULL THEN @now WHEN @status = 'waiting' THEN NULL ELSE startedAt END, 
                                completedAt = CASE WHEN @status IN ('completed', 'cancelled') THEN @now WHEN @status IN ('waiting', 'in-progress') THEN NULL ELSE completedAt END,
                                closeComment = CASE WHEN @status IN ('completed', 'cancelled') THEN @closeComment WHEN @status IN ('waiting', 'in-progress') THEN NULL ELSE closeComment END
                                WHERE id = @id`);

                    // If transitioning to waiting, notify active agents
                    if (status === 'waiting') {
                        try {
                            const rres = await poolConnection.request().input('id', sql.VarChar, id).query('SELECT id, subject FROM requests WHERE id = @id');
                            if (!rres.recordset || rres.recordset.length === 0) return { status: 200, jsonBody: { success: true } };
                            const reqRow = rres.recordset[0];

                            const title = `Ticket en cola ${reqRow.id} - ${reqRow.subject}`;
                            const text = `ID: ${reqRow.id}\nResumen: ${reqRow.subject}\n\nRevisar en la app.`;
                            const channelResult = await sendTeamsChannelNotification(title, text, context);
                            if (!channelResult.ok) {
                                context.warn('Channel notification failed for waiting transition', channelResult.provider, reqRow.id, channelResult.statusCode, channelResult.errorMessage);
                                await insertNotificationLog(
                                    poolConnection,
                                    null,
                                    channelResult.statusCode ?? null,
                                    channelResult.responseText ?? null,
                                    channelResult.errorMessage || 'Channel notification failed for waiting transition',
                                    JSON.stringify({ ticketId: reqRow.id, subject: reqRow.subject, provider: channelResult.provider })
                                );
                            }

                            const agentsRes = await poolConnection.request().query("SELECT email FROM authorized_agents WHERE status = 'active' AND notifyReminders = 1 AND email IS NOT NULL");
                            const agents = agentsRes.recordset || [];
                            const teamsAppId = process.env.TEAMS_APP_ID;
                            if (!teamsAppId) {
                                context.warn('TEAMS_APP_ID not configured; skipping notifications');
                                return { status: 200, jsonBody: { success: true } };
                            }
                            if (agents.length === 0) return { status: 200, jsonBody: { success: true } };
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
                        } catch (e:any) {
                            context.warn('Notifications dispatch failed', e && e.message || e);
                        }
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
    const dbMode = await resolveDbMode(req, context);
    try {
        const poolConnection = await getPool(context, dbMode);

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
        // add showOnUserDashboard column if missing
        await poolConnection.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'showOnUserDashboard' AND Object_ID = Object_ID(N'authorized_agents'))
            BEGIN
                ALTER TABLE authorized_agents ADD showOnUserDashboard BIT DEFAULT 0;
            END
        `);

        if (method === "get") {
            const pending = req.query.get('pending');
            const details = req.query.get('details');
            if (pending === '1' || pending === 'true') {
                const result = await poolConnection.request().query("SELECT email FROM authorized_agents WHERE status = 'pending'");
                return { status: 200, jsonBody: result.recordset.map(r => r.email) };
            }
            if (details === '1' || details === 'true') {
                const result = await poolConnection.request().query("SELECT email, ISNULL(showOnUserDashboard, 0) AS showOnUserDashboard FROM authorized_agents WHERE status = 'active' ORDER BY email ASC");
                return { status: 200, jsonBody: result.recordset.map(r => ({ email: r.email, showOnUserDashboard: !!r.showOnUserDashboard })) };
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

// Testing users management (control list in prod DB)
export async function testingUsersHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const method = req.method.toLowerCase();
    try {
        const controlPool = await getControlPool(context);
        await ensureTestingUsersTable(controlPool);

        if (method === 'get') {
            const result = await controlPool.request().query("SELECT email FROM testing_users ORDER BY email ASC");
            return { status: 200, jsonBody: result.recordset.map(r => r.email) };
        }

        if (method === 'post') {
            let body: any;
            try { body = await req.json(); } catch (e) { return { status: 400, body: 'JSON malformado' }; }
            const email = String(body?.email || '').trim().toLowerCase();
            const addedBy = String(body?.addedBy || req.headers.get('x-user-email') || 'system').trim().toLowerCase();
            if (!email || !email.includes('@')) return { status: 400, body: 'Email requerido' };

            await controlPool.request()
                .input('email', sql.VarChar, email)
                .input('addedAt', sql.BigInt, Date.now())
                .input('addedBy', sql.VarChar, addedBy)
                .query(`
                    IF EXISTS (SELECT 1 FROM testing_users WHERE email = @email)
                    BEGIN
                        UPDATE testing_users SET addedAt = @addedAt, addedBy = @addedBy WHERE email = @email
                    END
                    ELSE
                    BEGIN
                        INSERT INTO testing_users (email, addedAt, addedBy) VALUES (@email, @addedAt, @addedBy)
                    END
                `);

            return { status: 200, jsonBody: { success: true } };
        }

        if (method === 'delete') {
            const email = String(req.query.get('email') || '').trim().toLowerCase();
            if (!email || !email.includes('@')) return { status: 400, body: 'Email requerido' };
            await controlPool.request().input('email', sql.VarChar, email).query("DELETE FROM testing_users WHERE email = @email");
            return { status: 200, jsonBody: { success: true } };
        }

        return { status: 405, body: 'Not Allowed' };
    } catch (err:any) {
        context.error('testingUsersHandler error', err.message);
        return { status: 500, jsonBody: { error: err.message } };
    }
}

app.http('testingUsers', { methods: ['GET', 'POST', 'DELETE'], authLevel: 'anonymous', route: 'testing-users', handler: testingUsersHandler });

// Approve pending request
export async function agentsApproveHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const dbMode = await resolveDbMode(req, context);
    try {
        const poolConnection = await getPool(context, dbMode);
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
    const dbMode = await resolveDbMode(req, context);
    try {
        const poolConnection = await getPool(context, dbMode);
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

// Agent visibility in user dashboard
export async function agentsVisibilityHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const dbMode = await resolveDbMode(req, context);
    try {
        if (req.method.toLowerCase() !== 'post') return { status: 405, body: 'Not Allowed' };
        const poolConnection = await getPool(context, dbMode);
        await poolConnection.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'showOnUserDashboard' AND Object_ID = Object_ID(N'authorized_agents'))
            BEGIN
                ALTER TABLE authorized_agents ADD showOnUserDashboard BIT DEFAULT 0;
            END
        `);
        let body: any;
        try { body = await req.json(); } catch (e) { return { status: 400, body: 'JSON malformado' }; }

        const email = body?.email?.toLowerCase();
        if (!email) return { status: 400, body: 'Email requerido' };
        const showOnUserDashboard = body?.showOnUserDashboard === true ? 1 : 0;

        const result = await poolConnection.request()
            .input('email', sql.VarChar, email)
            .input('show', sql.Bit, showOnUserDashboard)
            .query(`
                UPDATE authorized_agents
                SET showOnUserDashboard = @show
                WHERE email = @email AND status = 'active';
                SELECT @@ROWCOUNT as updated;
            `);

        const updated = result.recordset && result.recordset[0] && (result.recordset[0].updated || result.recordset[0].UPDATED || 0);
        if (updated && updated > 0) return { status: 200, jsonBody: { success: true } };
        return { status: 404, jsonBody: { error: 'Agente activo no encontrado' } };
    } catch (err:any) {
        context.error('agentsVisibilityHandler error', err.message);
        return { status: 500, jsonBody: { error: err.message } };
    }
}

app.http('agentsVisibility', { methods: ['POST'], authLevel: 'anonymous', route: 'agents/visibility', handler: agentsVisibilityHandler });

// Agent settings: GET ?email=...  POST { email, notifyReminders }
export async function agentsSettingsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const dbMode = await resolveDbMode(req, context);
    try {
        const poolConnection = await getPool(context, dbMode);
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
type ChannelSendResult = {
    ok: boolean;
    provider: 'workflow' | 'incoming-webhook' | 'none';
    statusCode?: number;
    responseText?: string;
    errorMessage?: string;
};

async function sendTeamsIncomingWebhook(webhookUrl: string, title: string, text: string, context: InvocationContext): Promise<ChannelSendResult> {
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
        const txt = await resp.text();
        if (!resp.ok) {
            context.warn('Incoming webhook failed', resp.status, txt);
            return {
                ok: false,
                provider: 'incoming-webhook',
                statusCode: resp.status,
                responseText: txt,
                errorMessage: 'Incoming webhook failed'
            };
        }
        return { ok: true, provider: 'incoming-webhook', statusCode: resp.status, responseText: txt };
    } catch (e:any) {
        context.warn('sendTeamsIncomingWebhook error', e && e.message || e);
        return {
            ok: false,
            provider: 'incoming-webhook',
            errorMessage: e && e.message || String(e)
        };
    }
}

async function sendTeamsWorkflowWebhook(workflowUrl: string, title: string, text: string, context: InvocationContext): Promise<ChannelSendResult> {
    try {
        const body = {
            source: 'Asistencia MDA',
            title,
            text,
            createdAt: new Date().toISOString()
        };
        const resp = await fetch(workflowUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const txt = await resp.text();
        if (!resp.ok) {
            context.warn('Workflow webhook failed', resp.status, txt);
            return {
                ok: false,
                provider: 'workflow',
                statusCode: resp.status,
                responseText: txt,
                errorMessage: 'Workflow webhook failed'
            };
        }
        return { ok: true, provider: 'workflow', statusCode: resp.status, responseText: txt };
    } catch (e:any) {
        context.warn('sendTeamsWorkflowWebhook error', e && e.message || e);
        return {
            ok: false,
            provider: 'workflow',
            errorMessage: e && e.message || String(e)
        };
    }
}

async function sendTeamsChannelNotification(title: string, text: string, context: InvocationContext, incomingWebhookOverride?: string): Promise<ChannelSendResult> {
    const workflowUrl = process.env.TEAMS_WORKFLOW_WEBHOOK;
    const incomingWebhookUrl = incomingWebhookOverride || process.env.TEAMS_INCOMING_WEBHOOK;

    if (workflowUrl) {
        const workflowResult = await sendTeamsWorkflowWebhook(workflowUrl, title, text, context);
        if (workflowResult.ok) return workflowResult;
    }

    if (incomingWebhookUrl) {
        return await sendTeamsIncomingWebhook(incomingWebhookUrl, title, text, context);
    }

    return {
        ok: false,
        provider: 'none',
        errorMessage: 'Neither TEAMS_WORKFLOW_WEBHOOK nor TEAMS_INCOMING_WEBHOOK is configured'
    };
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
        const webhook = body.incomingWebhook || process.env.TEAMS_INCOMING_WEBHOOK;

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

        const title = previewText && previewText.content ? previewText.content : 'Notificación de Asistencia MDA';
        const text = `Para: ${userPrincipalName || targetUserId}\n\n${title}\n\n${templateParameters && templateParameters.length ? JSON.stringify(templateParameters) : ''}`;
        const channelResult = await sendTeamsChannelNotification(title, text, context, webhook);
        if (channelResult.ok) {
            return { status: 200, jsonBody: { success: true, fallback: channelResult.provider } };
        }

        return {
            status: 500,
            jsonBody: {
                error: 'Failed to send via Graph and channel webhook',
                provider: channelResult.provider,
                statusCode: channelResult.statusCode,
                detail: channelResult.errorMessage || channelResult.responseText || null
            }
        };
    } catch (err:any) {
        context.error('sendActivityNotificationHandler error', err.message || err);
        return { status: 500, jsonBody: { error: err.message || err } };
    }
}

app.http('sendActivityNotification', { methods: ['POST'], authLevel: 'anonymous', route: 'notifications/send', handler: sendActivityNotificationHandler });

// Expose notification logs for debugging in Testing
export async function notificationsLogsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const dbMode = await resolveDbMode(req, context);
    try {
        const poolConnection = await getPool(context, dbMode);
        const limit = parseInt(req.query.get('limit') || '50', 10);
        const result = await poolConnection.request().query(`SELECT TOP (${limit}) id, createdAt, targetEmail, statusCode, responseText, errorMessage, payload FROM notifications_log ORDER BY createdAt DESC`);
        return { status: 200, jsonBody: result.recordset };
    } catch (err:any) {
        context.error('notificationsLogsHandler error', err && err.message || err);
        return { status: 500, jsonBody: { error: err && err.message || err } };
    }
}

app.http('notificationsLogs', { methods: ['GET'], authLevel: 'anonymous', route: 'notifications/logs', handler: notificationsLogsHandler });

// Returns the effective environment mode for current request context/user
export async function environmentModeHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        const mode = await resolveDbMode(req, context);
        return { status: 200, jsonBody: { mode } };
    } catch (err:any) {
        context.error('environmentModeHandler error', err && err.message || err);
        return { status: 500, jsonBody: { error: err && err.message || err } };
    }
}

app.http('environmentMode', { methods: ['GET'], authLevel: 'anonymous', route: 'environment/mode', handler: environmentModeHandler });

// Stats handler: computes average and median wait (minutes) over recent window and caches in DB
export async function statsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const dbMode = await resolveDbMode(req, context);
    try {
        const poolConnection = await getPool(context, dbMode);

        // ensure cached_stats table
        await poolConnection.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='cached_stats' AND xtype='U')
            BEGIN
                CREATE TABLE cached_stats (
                    stat_key VARCHAR(128) PRIMARY KEY,
                    json_value NVARCHAR(MAX) NOT NULL,
                    updatedAt BIGINT NOT NULL
                );
            END
        `);

        // try read cached value
        const now = Date.now();
        const ttlMs = 60 * 60 * 1000; // 1 hour
        const cached = await poolConnection.request().input('key', sql.VarChar, 'avgWait').query("SELECT json_value, updatedAt FROM cached_stats WHERE stat_key = @key");
        if (cached.recordset && cached.recordset.length > 0) {
            const row = cached.recordset[0];
            if (row.updatedAt && (now - Number(row.updatedAt) < ttlMs)) {
                try {
                    return { status: 200, jsonBody: JSON.parse(row.json_value) };
                } catch (e) {
                    // fallthrough to recompute on parse error
                }
            }
        }

        // Recompute: avg and median wait (minutes) for tickets with startedAt, within last 30 days
        // Use epoch ms arithmetic: (startedAt - createdAt)/60000.0
        const computeSql = `
            DECLARE @threshold BIGINT = DATEDIFF_BIG(MILLISECOND, '1970-01-01', GETUTCDATE()) - 30 * 24 * 60 * 60 * 1000;
            WITH waits AS (
                SELECT CAST((startedAt - createdAt) AS FLOAT) / 60000.0 AS waitMinutes
                FROM requests
                WHERE startedAt IS NOT NULL AND createdAt IS NOT NULL AND createdAt >= @threshold
            )
            SELECT
                ISNULL(AVG(waitMinutes), 0) AS avgWaitMinutes,
                (SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY waitMinutes) FROM waits END) AS medianWaitMinutes,
                (SELECT COUNT(*) FROM waits) AS sampleCount;
        `;

        const res = await poolConnection.request().query(computeSql);
        const statsRow = res.recordset && res.recordset[0] ? res.recordset[0] : { avgWaitMinutes: 0, medianWaitMinutes: 0, sampleCount: 0 };

        const payload = {
            avgWaitMinutes: Number(statsRow.avgWaitMinutes) || 0,
            medianWaitMinutes: Number(statsRow.medianWaitMinutes) || 0,
            sampleCount: Number(statsRow.sampleCount) || 0,
            windowDays: 30,
            computedAt: now
        };

        const payloadStr = JSON.stringify(payload);
        // upsert into cached_stats
        await poolConnection.request().input('key', sql.VarChar, 'avgWait').input('val', sql.NVarChar, payloadStr).input('now', sql.BigInt, now)
            .query(`
                IF EXISTS (SELECT 1 FROM cached_stats WHERE stat_key = @key)
                    UPDATE cached_stats SET json_value = @val, updatedAt = @now WHERE stat_key = @key
                ELSE
                    INSERT INTO cached_stats (stat_key, json_value, updatedAt) VALUES (@key, @val, @now)
            `);

        return { status: 200, jsonBody: payload };
    } catch (err:any) {
        context.error('statsHandler error', err && err.message || err);
        return { status: 500, jsonBody: { error: err && err.message || err } };
    }
}

app.http('stats', { methods: ['GET'], authLevel: 'anonymous', route: 'stats', handler: statsHandler });
