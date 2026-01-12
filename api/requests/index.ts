
import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as sql from "mssql";

const sqlConfig = process.env.SqlConnectionString;

// Fix: Use the newer HttpRequest and InvocationContext types for Azure Functions v4.
// This replaces AzureFunction and Context which are not exported in the v4 library.
export default async function (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (!sqlConfig) {
        return { status: 500, body: "Error: SqlConnectionString no configurada" };
    }

    let pool;
    try {
        pool = await sql.connect(sqlConfig);
        const method = req.method.toLowerCase();
        
        // Fix: In v4, query parameters are in a URLSearchParams object (use .get()) 
        // and route parameters are available via req.params.
        const id = req.params.id || req.query.get('id');

        if (method === "get") {
            const result = await pool.request().query("SELECT * FROM requests ORDER BY createdAt DESC");
            return { 
                status: 200,
                jsonBody: result.recordset 
            };
        } 
        else if (method === "post") {
            // Fix: req.body is a stream in v4; use await req.json() to parse the body.
            const r = await req.json() as any;
            await pool.request()
                .input('id', sql.VarChar, r.id)
                .input('userId', sql.VarChar, r.userId)
                .input('userName', sql.VarChar, r.userName)
                .input('subject', sql.VarChar, r.subject)
                .input('description', sql.Text, r.description)
                .input('status', sql.VarChar, r.status)
                .input('createdAt', sql.BigInt, r.createdAt)
                .input('priority', sql.VarChar, r.priority)
                .input('aiSummary', sql.Text, r.aiSummary || '')
                .query(`INSERT INTO requests (id, userId, userName, subject, description, status, createdAt, priority, aiSummary) 
                        VALUES (@id, @userId, @userName, @subject, @description, @status, @createdAt, @priority, @aiSummary)`);
            return { status: 201, jsonBody: { success: true } };
        }
        else if (method === "patch") {
            if (!id) {
                return { status: 400, body: "ID requerido" };
            }
            // Fix: Body is a stream in v4; use await req.json() to parse it.
            const body = await req.json() as any;
            const { status, startedAt, completedAt } = body;
            await pool.request()
                .input('id', sql.VarChar, id)
                .input('status', sql.VarChar, status)
                .input('startedAt', sql.BigInt, startedAt || null)
                .input('completedAt', sql.BigInt, completedAt || null)
                .query(`UPDATE requests SET 
                        status = @status, 
                        startedAt = COALESCE(@startedAt, startedAt), 
                        completedAt = COALESCE(@completedAt, completedAt) 
                        WHERE id = @id`);
            return { status: 200, jsonBody: { success: true } };
        }
        
        return { status: 405, body: "Method Not Allowed" };
    } catch (err) {
        // Fix: Use context.error for logging in v4 InvocationContext.
        context.error("SQL Error:", err);
        return { 
            status: 500, 
            body: `Error: ${err instanceof Error ? err.message : 'Unknown'}` 
        };
    } finally {
        if (pool) await pool.close();
    }
}
