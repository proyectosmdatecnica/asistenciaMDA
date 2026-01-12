
# Guía de Despliegue: Evitar Errores en Teams

Si recibes el mensaje "Se produjo un error" al subir el archivo a Teams, sigue esta lista de verificación técnica:

## 1. El Archivo ZIP (Crítico)
Teams es muy estricto con el contenido del archivo `.zip`. Asegúrate de que:
- **No haya carpetas:** Al abrir el ZIP, los archivos `manifest.json`, `color.png` y `outline.png` deben estar en la RAÍZ. Si están dentro de una carpeta llamada "src" o "app", Teams fallará.
- **Nombres exactos:** Los archivos deben llamarse exactamente como en el manifiesto (minúsculas incluidas).

## 2. Validación de URLs
- La `contentUrl` en el `manifest.json` DEBE empezar por `https://`.
- El dominio de esa URL (ej: `black-pond-084e07c0f.1.azurestaticapps.net`) DEBE estar incluido en la lista de `validDomains`.

## 3. Requisitos de los Iconos
- `color.png`: Debe ser de **192x192** píxeles.
- `outline.png`: Debe ser de **32x32** píxeles y ser transparente (solo blanco/negro con canal alfa).
*Si no tienes estos archivos o tienen otro tamaño, Teams puede dar un error genérico.*

## 4. Permisos de Administrador
Si el archivo es correcto pero sigue fallando:
1. Ve al **Centro de Administración de Teams**.
2. Verifica que las **Apps Personalizadas** estén permitidas en las directivas de configuración.

## 5. Probar con App Studio / Developer Portal
Te recomiendo subir el manifiesto al **Developer Portal** de Teams (dentro de Teams busca la app "Developer Portal"). Ahí podrás importar tu manifiesto y la herramienta te dirá exactamente en qué línea está el error si lo hubiera.
