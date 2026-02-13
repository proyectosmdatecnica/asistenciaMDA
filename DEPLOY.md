
# Guía de despliegue — VS Code → GitHub → Azure

Este documento describe cómo confirmar que el código se publica desde Visual Studio Code a GitHub y cómo desplegarlo desde GitHub a Azure (Static Web App + Functions). Incluye un ejemplo de workflow de GitHub Actions y notas sobre variables y secretos.

---

## 1) Confirmar push desde VS Code a GitHub

- Abre el proyecto en VS Code.
- Si no hay repo local: `Git: Initialize Repository` o desde terminal:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<tu-org>/<tu-repo>.git
git push -u origin main
```

- Si ya tienes repo, usa el panel `Source Control` de VS Code o los comandos `git add/commit/push`. Confirma en GitHub que los commits aparecen en la rama esperada (`main` o `master`).

Tips: la extensión _GitHub_ o _GitLens_ facilitan el flujo desde VS Code.

---

## 2) Configurar despliegue en GitHub → Azure Static Web Apps (recomendado)

Este proyecto está estructurado como SPA (`/` build) con `api/` (Azure Functions). La forma más sencilla es usar Azure Static Web Apps, que incluye hosting estático y funciones en un único recurso.

1. Desde el portal de Azure crea un recurso **Static Web App** y conéctalo a tu repositorio GitHub; Azure puede crear automáticamente el workflow en `.github/workflows/`.
2. Si prefieres crear el workflow manualmente, añade un archivo como el siguiente (ajusta `app_location`, `api_location`, `output_location` si tu build difiere):

`.github/workflows/azure-static-web-apps.yml`

```yaml
name: Azure Static Web Apps CI/CD

on:
	push:
		branches: [ main ]

jobs:
	build_and_deploy:
		runs-on: ubuntu-latest
		steps:
			- uses: actions/checkout@v4
			- name: Build and deploy
				uses: Azure/static-web-apps-deploy@v1
				with:
					azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }} # token from Azure when creating the app
					repo_token: ${{ secrets.GITHUB_TOKEN }}
					action: "upload"
					app_location: "." # raíz del proyecto (donde está package.json)
					api_location: "api" # carpeta con Azure Functions
					output_location: "dist" # o el directorio de salida de Vite (ajustar si es diferente)
```

3. Azure generará un token (o lo puedes obtener al crear la Static Web App) y lo guardarás en el repo como `AZURE_STATIC_WEB_APPS_API_TOKEN` en **Settings → Secrets**.

4. El workflow compilará la app (Vite) y desplegará los archivos estáticos y la carpeta `api` como Functions.

---

## 3) Variables de entorno y secretos en Azure

- En el portal de Azure (Static Web App) ve a **Configuration** y añade las variables necesarias, por ejemplo:
	- `SqlConnectionString` — string de conexión a la base de datos.
	- `API_KEY` (o `GEMINI_API_KEY`) — key para Google GenAI (unifica el nombre con el usado por `api/index.ts`).

- Para Functions (si gestionas Functions por separado) ve a tu App Function -> Configuration y añade las mismas variables.

Nota: no subas archivos `.env` al repo; usa Secrets en GitHub y Configuration en Azure.

---

## 4) Alternativa: Deploy usando la extensión de Azure en VS Code

1. Instala la extensión **Azure Static Web Apps** o **Azure App Service / Azure Functions**.
2. Inicia sesión con `Azure: Sign In` desde VS Code.
3. Desde el explorador de Azure en VS Code encontrarás tu Static Web App y puedes hacer `Deploy` sobre la rama. Esto normalmente crea o actualiza el workflow en GitHub.

---

## 5) Verificación post-despliegue

- En GitHub Actions: verifica que la build y el deploy pasen en `Actions` → workflow.
- En Azure: abre la URL asignada (ej: `https://<app>.azurestaticapps.net`) y comprueba que la UI carga.
- Verifica que el endpoint `/.auth/me` (si aplicara) y `/api/requests` funcionan y no devuelven errores 500.

---

## 6) Notas específicas del proyecto

- Para ejecutar localmente la API (Azure Functions) hay tasks en el workspace (usa los scripts bajo `api/`):

```bash
cd api
npm install
npm run watch   # inicia build en watch
func start      # si tienes Azure Functions Core Tools instalado
```

- Para el frontend:

```bash
npm install
npm run dev
```

- Asegúrate de que las variables `SqlConnectionString` y `API_KEY` están configuradas en el entorno que uses para pruebas y en Azure.

---

## 7) Comprobaciones rápidas (checklist)
- [ ] El repositorio está en GitHub y los commits están en la rama configurada por el workflow.
- [ ] El secret `AZURE_STATIC_WEB_APPS_API_TOKEN` existe en GitHub.
- [ ] En Azure, `Configuration` contiene `SqlConnectionString` y `API_KEY`/`GEMINI_API_KEY`.
- [ ] Las rutas `contentUrl` en `manifest.json` usan `https://` y están incluidas en `validDomains`.

---

Si querés, puedo generar el archivo de workflow completo en tu repo (ajustando `output_location` si tu build difiere) y añadir una nota para unificación de variable de entorno `API_KEY` vs `GEMINI_API_KEY`.

*** Fin de guía ***
