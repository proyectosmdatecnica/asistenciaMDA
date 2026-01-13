import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as sql from "mssql";

const sqlConfigString = process.env.SqlConnectionString;
let pool: any = null;

async function getPool(context: InvocationContext) {
    if (pool && pool.connected) {
        return pool;
    }
    if (!sqlConfigString) {
        context.error("Variable SqlConnectionString no configurada.");
        throw new Error("SqlConnectionString missing.");
    }
    context.log("Conectando a SQL Server...");
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
            if (!r || !r.id) return { status: 400, body: "ID de ticket faltante." };

            await poolConnection.request()
                .input('id', sql.VarChar, r.id)
                .input('userId', sql.VarChar, r.userId)
                .input('userName', sql.VarChar, r.userName)
                .input('subject', sql.VarChar, r.subject)
                .input('description', sql.Text, r.description || '')
                .input('status', sql.VarChar, r.status || 'waiting')
                .input('createdAt', sql.BigInt, r.createdAt || Date.now())
                .input('priority', sql.VarChar, r.priority || 'medium')
                .input('aiSummary', sql.Text, r.aiSummary || '')
                .input('category', sql.VarChar, r.category || 'General')
                .query(`INSERT INTO requests (id, userId, userName, subject, description, status, createdAt, priority, aiSummary, category) 
                        VALUES (@id, @userId, @userName, @subject, @description, @status, @createdAt, @priority, @aiSummary, @category)`);
            
            return { status: 201, jsonBody: { success: true } };
        }

        if (method === "patch") {
            if (!id) return { status: 400, body: "ID requerido." };
            const body: any = await req.json();
            const now = Date.now();
            
            await poolConnection.request()
                .input('id', sql.VarChar, id)
                .input('status', sql.VarChar, body.status)
                .input('now', sql.BigInt, now)
                .query(`UPDATE requests SET 
                        status = @status, 
                        startedAt = CASE WHEN @status = 'in-progress' AND startedAt IS NULL THEN @now ELSE startedAt END, 
                        completedAt = CASE WHEN @status = 'completed' THEN @now ELSE completedAt END 
                        WHERE id = @id`);
            
            return { status: 200, jsonBody: { success: true } };
        }

        return { status: 405, body: "Method Not Allowed" };
    } catch (err: any) {
        context.error(`Error API: ${err.message}`);
        return { status: 500, body: `Server Error: ${err.message}` };
    }
}

app.http('requests', {
    methods: ['GET', 'POST', 'PATCH'],
    authLevel: 'anonymous',
    route: 'requests/{id?}',
    handler: requestsHandler
});