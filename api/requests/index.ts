
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as sql from "mssql";

const config = process.env.SqlConnectionString;

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    try {
        const pool = await sql.connect(config);
        const method = req.method.toLowerCase();

        if (method === "get") {
            const result = await pool.request().query("SELECT * FROM requests ORDER BY createdAt DESC");
            context.res = { body: result.recordset };
        } 
        else if (method === "post") {
            const r = req.body;
            await pool.request()
                .input('id', sql.VarChar, r.id)
                .input('userId', sql.VarChar, r.userId)
                .input('userName', sql.VarChar, r.userName)
                .input('subject', sql.VarChar, r.subject)
                .input('description', sql.Text, r.description)
                .input('status', sql.VarChar, r.status)
                .input('createdAt', sql.BigInt, r.createdAt)
                .input('priority', sql.VarChar, r.priority)
                .input('aiSummary', sql.Text, r.aiSummary)
                .query(`INSERT INTO requests (id, userId, userName, subject, description, status, createdAt, priority, aiSummary) 
                        VALUES (@id, @userId, @userName, @subject, @description, @status, @createdAt, @priority, @aiSummary)`);
            context.res = { status: 201 };
        }
        else if (method === "patch") {
            const id = context.bindingData.id;
            const { status, startedAt, completedAt } = req.body;
            await pool.request()
                .input('id', sql.VarChar, id)
                .input('status', sql.VarChar, status)
                .input('startedAt', sql.BigInt, startedAt)
                .input('completedAt', sql.BigInt, completedAt)
                .query(`UPDATE requests SET status = @status, startedAt = ISNULL(@startedAt, startedAt), completedAt = ISNULL(@completedAt, completedAt) 
                        WHERE id = @id`);
            context.res = { status: 200 };
        }
    } catch (err) {
        context.log.error(err);
        context.res = { status: 500, body: "Error de base de datos" };
    }
};

export default httpTrigger;
