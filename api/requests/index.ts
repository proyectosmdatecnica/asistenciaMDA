
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as sql from "mssql";

const sqlConfigString = process.env.SqlConnectionString;

/**
 * HTTP Trigger handler for support requests. 
 * Migrated to Azure Functions v4 to resolve type mismatch errors (AzureFunction and Context not exported).
 */
export async function requestsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('HTTP trigger function processed a request.');

    if (!sqlConfigString) {
        return { 
            status: 500, 
            body: "Error: La variable SqlConnectionString no está configurada en Azure." 
        };
    }

    let pool;
    try {
        // Fix: Use the connection string directly as mssql.connect expects a string or a structured config object.
        // The previous structured object was missing required properties like 'server'.
        pool = await sql.connect(sqlConfigString);
        const method = req.method.toLowerCase();
        // In v4, route parameters are accessed via req.params instead of context.bindingData
        const id = req.params.id;

        if (method === "get") {
            const result = await pool.request().query("SELECT * FROM requests ORDER BY createdAt DESC");
            return {
                status: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(result.recordset)
            };
        } 
        else if (method === "post") {
            // Fix: req.body in v4 is a ReadableStream. Use req.json() to parse it to avoid "Property does not exist" errors.
            const r: any = await req.json();
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
            return { status: 201, body: JSON.stringify({ success: true }) };
        }
        else if (method === "patch") {
            if (!id) {
                return { status: 400, body: "ID de ticket faltante en la ruta." };
            }
            // Fix: req.body in v4 is a ReadableStream. Use req.json() to parse it.
            const body: any = await req.json();
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
            return { status: 200, body: JSON.stringify({ success: true }) };
        }
        
        return { status: 405, body: "Method Not Allowed" };
    } catch (err: any) {
        // Fix: In v4 InvocationContext, use context.error instead of context.log.error
        context.error("Error detallado:", err);
        return { 
            status: 500, 
            body: `Error de Base de Datos: ${err.message}. Verifica que la tabla 'requests' exista y los permisos de red.` 
        };
    } finally {
        if (pool) await pool.close();
    }
}

// Explicitly register the function with the Azure Functions v4 app object
app.http('requests', {
    methods: ['GET', 'POST', 'PATCH'],
    authLevel: 'anonymous',
    route: 'requests/{id?}',
    handler: requestsHandler
});
