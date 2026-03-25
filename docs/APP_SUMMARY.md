# Resumen completo — AsistenciaMDA

## 1. Propósito
AsistenciaMDA es una aplicación para gestionar solicitudes/tickets internos y notificar a los agentes de TI vía Microsoft Teams. Entrega notificaciones nativas (Activity Feed) y, como fallback, mensajes a un canal de Teams mediante Incoming Webhook.

## 2. Arquitectura general
- Frontend: SPA en Vite (React + TypeScript). Archivos principales: `App.tsx`, `index.tsx`, `components/*`.
- Backend: Azure Functions (Node/TypeScript) dentro de la carpeta `api/` — un único archivo principal `api/index.ts` con handlers HTTP.
- Persistencia: Azure SQL (tablas `requests`, `authorized_agents`, `notifications_log`).
- Integraciones externas:
  - Microsoft Graph para Activity Feed (app-only token).
  - Teams Incoming Webhook para fallback.
  - (Opcional) Google GenAI para resumen/etiquetado de tickets.

## 3. Componentes y responsabilidades
- Frontend
  - `App.tsx`, `index.tsx`: inicialización y routing.
  - `components/AgentDashboard.tsx`, `UserRequestView.tsx`, `Layout.tsx`, `HelpModal.tsx`: vistas principales para agentes y usuarios.
  - `services/dataService.ts`: llamadas a la API backend.
  - `services/geminiService.ts`: wrapper opcional para llamadas a Google GenAI.

- Backend (`api/index.ts`)
  - `requestsHandler` — GET/POST/PATCH para administrar tickets; al crear/poner en `waiting` dispara notificaciones.
  - `agentsHandler`, `agentsApproveHandler`, `agentsRejectHandler`, `agentsSettingsHandler` — CRUD y flujo de aprobación de agentes autorizados.
  - `sendActivityNotificationHandler` — endpoint genérico para enviar notificaciones (intenta Graph, sino webhook).
  - `notificationsLogsHandler` — expone los últimos logs de notificación.
  - Helpers internos:
    - `getGraphAppToken(context)`: obtiene token app-only (client credentials) y lo cachea.
    - `resolveInstalledAppTopic(token, targetUserId, teamsAppId, context)`: obtiene `installedApps/{installationId}` para topic.value correcto.
    - `sendTeamsIncomingWebhook(webhookUrl, title, text, context)`: publica MessageCard en un canal vía webhook.

## 4. Esquema de la base de datos (resumen)
- `requests` (campos relevantes): `id`, `userId`, `userName`, `subject`, `description`, `status`, `createdAt`, `priority`, `startedAt`, `completedAt`, `pausedAt`, `pausedAccum`, `agentId`, `agentName`, `aiSummary`, `category`.
- `authorized_agents`: `email` (PK), `addedAt`, `status` (pending/active), `requestedAt`, `approver`, `approvedAt`, `notifyReminders` (BIT).
- `notifications_log`: `id` (PK), `createdAt`, `targetEmail`, `statusCode`, `responseText`, `errorMessage`, `payload`.

## 5. Endpoints HTTP
- `GET /api/requests` — listar tickets
- `POST /api/requests` — crear ticket (dispara notificación a agentes + webhook)
- `PATCH /api/requests/{id}` — actualizar estado (pausar/resumir/completar); si pasa a `waiting` dispara notificación
- `GET/POST/DELETE /api/agents` — administrar agentes autorizados
- `POST /api/agents/approve` — aprobar agente (flow)
- `POST /api/notifications/send` — enviar notificación manual con body: `userAadId|userPrincipalName`, `incomingWebhook` opcional
- `GET /api/notifications/logs` — revisar logs de notificaciones

## 6. Variables de entorno necesarias
- `GRAPH_TENANT_ID` — Tenant AAD
- `GRAPH_CLIENT_ID` — App Registration (clientId)
- `GRAPH_CLIENT_SECRET` — App Registration secret
- `TEAMS_APP_ID` — Teams app `externalId` del paquete (manifest) (opcional si se usa webhook)
- `TEAMS_INCOMING_WEBHOOK` — URL del Incoming Webhook para canal (fallback)
- `SqlConnectionString` — cadena de conexión a la base de datos
- `API_KEY` — (opcional) Google GenAI key

## 7. Permisos y AAD
- Crear App Registration en AAD y dar permiso de aplicación `TeamsActivity.Send` (admin consent obligatorio).
- `webApplicationInfo.id` se usa en `manifest.json` para mapping con la app registration.

## 8. Flujo de notificaciones
1. Backend intenta enviar `sendActivityNotification` usando token app-only.
2. `resolveInstalledAppTopic` determina `installedApps/{installationId}` para topic.value.
3. Si Graph responde OK → Activity Feed llega al usuario.
4. Si Graph falla (permiso, error, token), se guarda el fallo en `notifications_log` y se hace POST al `TEAMS_INCOMING_WEBHOOK` para publicar en el canal.

## 9. Despliegue y tareas útiles
- Scripts y tareas (en workspace): `npm run build` (functions), `npm run watch`, `host start` (Azure Functions local func host)
- Para producción: desplegar a Azure Static Web Apps + Functions; configurar Application Settings con las env vars arriba.

## 10. Pruebas y verificación
- Probar webhook directo con `curl` para comprobar recepción en canal.
- Probar `POST /api/notifications/send` con `incomingWebhook` en body.
- Crear ticket con `POST /api/requests` y verificar que canal y/o usuarios reciban notificación.
- Revisar `GET /api/notifications/logs` para errores de Graph.

## 11. Operación y diagnóstico
- Revisar Logs de la Function App (Log Stream) para errores en tiempo real.
- `notifications_log` guarda fallos de Graph y payloads para auditoría.
- Errores comunes:
  - Token inválido/`Signing key is invalid` → regenerar token app-only.
  - `The value of the topic must match the graph resource path.` → topic.value inválido; usar `installedApps/{id}`.

## 12. Acciones recomendadas / roadmap
- Soporte UI para configurar webhook por equipo/canal.
- Métricas/alerts sobre fallos de entrega (errores en `notifications_log`).
- Mejoras en plantillas de tarjeta (Adaptive Cards) para mensajes más útiles.
- Automatizar instalación del Teams app si no está presente (si se requiere Activity Feed para todos los usuarios).

## 13. Archivos clave del repo
- `api/index.ts` — lógica principal del backend y notificaciones
- `App.tsx`, `index.tsx` — entrada frontend
- `components/*` — vistas y UI
- `services/dataService.ts` — integración frontend-backend
- `manifest.json` — Teams package / webApplicationInfo
- `docs/NOTIFICATIONS.md`, `docs/APP_SUMMARY.md` — documentación

---
Generado: 