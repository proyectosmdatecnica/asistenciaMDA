
import { HttpRequest, InvocationContext, HttpResponseInit } from "@azure/functions";
import * as sql from "mssql";

const sqlConfig = process.env.SqlConnectionString;

// Fix: Swapped parameters to match Azure Functions v4 signature (req, context)
// Fix: Use InvocationContext and HttpResponseInit instead of Context and void
const httpTrigger = async function (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Procesando solicitud de soporte...');

    if (!sqlConfig) {
        return {
            status: 500,
            body: "Error de configuración: SqlConnectionString no encontrada en las variables de entorno de Azure."
        };
    }

    let pool;
    try {
        pool = await sql.connect(sqlConfig);
        const method = req.method.toLowerCase();
        
        // Fix: In v4, route parameters are accessed via req.params instead of context.bindingData
        const id = req.params.id;

        if (method === "get") {
            const result = await pool.request().query("SELECT * FROM requests ORDER BY createdAt DESC");
            return {
                status: 200,
                headers: { "Content-Type": "application/json" },
                jsonBody: result.recordset
            };
        } 
        else if (method === "post") {
            // Fix: req.body is a ReadableStream in v4; use await req.json() to parse the payload
            const r = await req.json() as any;
            if (!r || !r.id) {
                return { status: 400, body: "Cuerpo de solicitud inválido" };
            }
            
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
                return { status: 400, body: "ID de ticket requerido para actualización" };
            }
            // Fix: req.body is a ReadableStream in v4; use await req.json() to parse the payload
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
        else {
            return { status: 405, body: "Método no permitido" };
        }
    } catch (err) {
        // Fix: Use context.error instead of context.log.error in v4
        context.error("Error en la base de datos:", err);
        return { 
            status: 500, 
            body: `Error interno: ${err instanceof Error ? err.message : 'Error desconocido'}` 
        };
    } finally {
        if (pool) {
            await pool.close();
        }
    }
};

export default httpTrigger;
