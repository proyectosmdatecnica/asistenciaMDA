
import { HttpRequest, InvocationContext, HttpResponseInit } from "@azure/functions";
import * as sql from "mssql";

const sqlConfig = process.env.SqlConnectionString;

// Se actualiza el trigger para utilizar el modelo de programación v4 de Azure Functions
const httpTrigger = async function (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (!sqlConfig) {
        return { status: 500, body: "Error: SqlConnectionString no configurada en Azure" };
    }

    let pool;
    try {
        pool = await sql.connect(sqlConfig);
        const method = request.method.toLowerCase();
        
        // En v4, los parámetros de ruta están en request.params y la query es un objeto URLSearchParams
        // Se corrige el error de acceso a .id en URLSearchParams usando .get('id')
        const id = request.params.id || request.query.get('id');

        if (method === "get") {
            const result = await pool.request().query("SELECT * FROM requests ORDER BY createdAt DESC");
            return { 
                status: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(result.recordset)
            };
        } 
        