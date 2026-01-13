
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as sql from "mssql";

const sqlConfigString = process.env.SqlConnectionString;

export async function requestsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`HTTP ${req.method} request received for /api/requests`);

    if (!sqlConfigString) {
        context.error("SqlConnectionString is not defined in environment variables.");
        return { status: 500, body: "Server Configuration Error" };
    }

    let pool;
    try {
        pool = await sql.connect(sqlConfigString);
        const method = req.method.toLowerCase();
        const id = req.params.id;

        if (method === "get") {
            const result = await pool.request().query("SELECT * FROM requests ORDER BY createdAt DESC");
            return {
                status: 200,
                jsonBody: result.recordset
            };
        } 
        else if (method === "post") {
            const r: any = await req.json();
            if (!r || !r.id) return { status: 400, body: "Invalid request body." };

            await pool.request()
                .input('id', sql.VarChar, r.id)
                .input('userId', sql.VarChar, r.userId)
                .input('userName', sql.VarChar, r.userName)
                .input('subject', sql.VarChar, r.subject)
                .input('description', sql.Text, r.description)
                .input('status', sql.VarChar, r.status || 'waiting')
                .input('createdAt', sql.BigInt, r.createdAt || Date.now())
                .input('priority', sql.VarChar, r.priority || 'medium')
                .input('aiSummary', sql.Text, r.aiSummary || '')
                .input('category', sql.VarChar, r.category || 'General')
                .query(`INSERT INTO requests (id, userId, userName, subject, description, status, createdAt, priority, aiSummary, category) 
                        VALUES (@id, @userId, @userName, @subject, @description, @status, @createdAt, @priority, @aiSummary, @category)`);
            
            return { status: 201, jsonBody: { success: true } };
        }
        else if (method === "patch") {
            if (!id) return { status: 400, body: "Request ID is required for updates." };
            const body: any = await req.json();
            
            await pool.request()
                .input('id', sql.VarChar, id)
                .input('status', sql.VarChar, body.status)
                .input('startedAt', sql.BigInt, body.startedAt || null)
                .input('completedAt', sql.BigInt, body.completedAt || null)
                .query(`UPDATE requests SET 
                        status = @status, 
                        startedAt = COALESCE(@startedAt, startedAt), 
                        completedAt = COALESCE(@completedAt, completedAt) 
                        WHERE id = @id`);
            
            return { status: 200, jsonBody: { success: true } };
        }
        
        return { status: 405, body: "Method Not Allowed" };
    } catch (err: any) {
        context.error(`API Error: ${err.message}`);
        return { 
            status: 500, 
            body: `Internal Server Error: ${err.message}` 
        };
    } finally {
        if (pool) await pool.close();
    }
}

app.http('requests', {
    methods: ['GET', 'POST', 'PATCH'],
    authLevel: 'anonymous',
    route: 'requests/{id?}',
    handler: requestsHandler
});
