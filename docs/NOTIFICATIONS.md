# Notificaciones - AsistenciaMDA

Resumen breve
- Sistema de notificaciones para la app AsistenciaMDA.
- Entrega principal: Activity Feed de Teams (Graph) con fallback a Incoming Webhook cuando Graph no está disponible.

Requerimientos
- Azure Static Web App + Azure Functions (Node/TypeScript).
- App Registration en AAD con permiso de aplicación: `TeamsActivity.Send` (admin consent).
- Base de datos (Azure SQL) con tablas: `requests`, `authorized_agents`, `notifications_log`.
- Teams package (manifest) publicado y `TEAMS_APP_ID` (manifest externalId).

Funcionalidades implementadas
- Envío de Activity Feed a usuarios vía Microsoft Graph (`sendActivityNotification`) usando token app-only (client credentials).
- Resolución automática de `installedApps/{installationId}` para cada usuario (mejora para topic.value correcto).
- Fallback a `Incoming Webhook` de Teams: `sendTeamsIncomingWebhook(...)` para publicar tarjetas MessageCard en un canal.
- Registro de errores/resultado en tabla `notifications_log` (persistencia de fallos Graph y payloads).
- Notificaciones automáticas:
  - Al crear ticket (`POST /api/requests`) se notifica a agentes y al canal (webhook).
  - Al transicionar ticket a `waiting` se notifica a agentes y al canal (webhook).
- Endpoints expuestos (Azure Functions):
  - `POST /api/requests` — crear ticket (dispara notificaciones).
  - `POST /api/notifications/send` — enviar notificación manual (acepta `incomingWebhook` en body).
  - `GET /api/notifications/logs` — ver últimas entradas de `notifications_log`.
  - `GET|POST /api/agents` — administrar agentes autorizados.

Variables de configuración (env)
- `GRAPH_TENANT_ID` — tenant AAD.
- `GRAPH_CLIENT_ID` — App Registration clientId.
- `GRAPH_CLIENT_SECRET` — App Registration client secret.
- `TEAMS_APP_ID` — Teams app manifest `externalId` (opcional para Graph delivery).
- `TEAMS_INCOMING_WEBHOOK` — Incoming Webhook URL para canal (fallback / notificaciones al canal).
- `SqlConnectionString` — cadena de conexión a la base de datos.
- `API_KEY` — (opcional) Google GenAI key usada para resumir/etiquetar tickets.

Cómo probar (rápido)
1. Probar webhook directo (verifica que el canal recibe):
```bash
curl -X POST "<WEBHOOK_URL>" -H "Content-Type: application/json" -d '{
  "@type":"MessageCard","@context":"http://schema.org/extensions",
  "summary":"Prueba Notificación",
  "themeColor":"0076D7",
  "title":"Prueba: Nuevo ticket T-TEST123",
  "text":"Usuario: prueba\nID: T-TEST123\nResumen: Mensaje de prueba"
}'
```

2. Probar endpoint de la app (usa fallback webhook):
```bash
curl -X POST "https://<APP_URL>/api/notifications/send" \
  -H "Content-Type: application/json" \
  -d '{
    "userPrincipalName":"mbozzone@intecsoft.com.ar",
    "incomingWebhook":"<WEBHOOK_URL>",
    "previewText": { "content": "Prueba webhook desde AsistenciaMDA" }
  }'
```

3. Probar flujo completo (crear ticket -> notificación automática):
```bash
curl -X POST "https://<APP_URL>/api/requests" -H "Content-Type: application/json" -d '{
  "userId":"juan.perez@ejemplo.com",
  "userName":"Juan Perez",
  "subject":"Prueba webhook automática",
  "description":"Prueba generada para validar canal",
  "priority":"low"
}'
```

4. Consultar logs de notificaciones:
```bash
curl "https://<APP_URL>/api/notifications/logs?limit=50"
```

Notas de diseño y consideraciones
- Graph Activity Feed requiere topic.value que coincida exactamente con un resource path de Graph (por eso resolvemos `installedApps/{id}`).
- El envío app-only necesita token con `roles` que incluyan `TeamsActivity.Send` (permiso de aplicación, admin consent).
- Cuando Graph falla por permisos o errores, el sistema registra el fallo en `notifications_log` y cae al webhook para asegurar entrega.
- Para pruebas con Graph Explorer no usar el mismo usuario como remitente y destinatario (delegated token fallará con "recipient cannot be the same as the sender").

Troubleshooting rápido
- Error `Signing key is invalid`: token inválido (posible id_token, token expirado, o para otro tenant). Regenerar token app-only.
- Error `The value of the topic must match the graph resource path.`: topic.value incorrecto; usar `installedApps/{installationId}` o `teamsApps/{teamsAppId}` según corresponda.
- Si las notificaciones no llegan al canal: probar webhook directo y revisar Application Settings para `TEAMS_INCOMING_WEBHOOK`.

Contacto y próximos pasos
- Para mejorar: agregar webhook por equipo/canal configurable desde UI, centralizar plantillas de tarjetas y métricas de entrega en `notifications_log`.

---
Generado: ${new Date().toISOString()}
