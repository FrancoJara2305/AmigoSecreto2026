# Pendientes para el 2 de noviembre de 2026

Punto de partida para retomar el trabajo. Todo lo de abajo está aprobado; nada está en producción.

## Estado al cierre del 1 de noviembre

| Cambio | Commit | Staging | Producción |
|---|---|---|---|
| Encuadre de foto, zona de subida, botones y pantalla de carga con check ([detalle](photo-editing-polish.md)) | `6d87bdf` (local, sin push) | Publicado (`dpl_78KLnw1trX7mSmDCnkr5BDZVAeo2`) | No |
| Fotos a tarjeta completa en el catálogo ([detalle](catalogue-visual-polish.md#tarjetas-con-foto)) | `2e69503` (local, sin push) | Publicado (`dpl_DSsB81iAhrCN4SJV3AnTyqjq5yND`) | No |
| «Otra consulta» respondida por Gemini dentro de la app ([detalle](gift-assistant.md)) | `8a0d6e4` (local, sin push) | Publicado y **encendido**; probado con llamadas reales y en navegador | No |

**Actualización del 2 de noviembre:**
- **Paso 1:** completo hasta staging, con la regresión en 385 de 385. Falta la prueba en el celular.
- **Paso 2:** verificado en local (391 UI, 144 unitarias, 318 SQL y prueba real 4 de 4 en unos 2 s).
- **En staging (`eknnkmndfxgyjsdgkwkh`):**
  - la migración `20261102120000` está aplicada (15 de 15 coinciden);
  - la función `gift-assistant` está desplegada y responde `{"available":false}`;
  - el frontend está publicado.
- **Secretos:** cargados y prueba real en staging correcta (ver [validation-results.md](validation-results.md)).
- **Falta:**
  - probar en el celular las tarjetas y el asistente;
  - **rotar la clave de Gemini**, que se compartió en el chat;
  - producción, solo con autorización explícita: migración, secretos, función y push.

**Cuidado:** hacer push a `main` publica automáticamente en **producción**. Staging se publica solo por CLI con su propia configuración (ver el paso 1).

## 1. Tarjetas con foto: cerrar y publicar en staging

Archivos sin commit: `src/components/participants/ParticipantCard.tsx`, `src/styles/catalogue.css`, `tests/ui/photo-crop.spec.ts` y `docs/catalogue-visual-polish.md`.

1. Correr la regresión completa con `npm run test:ui`. Solo se probaron los archivos del catálogo y de fotos (49 correctas, 2 omitidas en táctiles). Tarda unos 13 minutos.
2. Hacer el commit, **sin push**.
3. Publicar en staging con la misma orden que el commit `6d87bdf`:
   ```
   node <vercel vc.js> deploy --prod --json --project prj_5efvOrvzHx8WtpOy6YbRRLufpTwp --scope franco-9ec3 --local-config artifacts/deployment/staging/vercel.json --yes
   ```
   La CLI está en la caché de npx: `C:/Users/Franco/AppData/Local/npm-cache/_npx/67eb4586ca667318/node_modules/vercel/dist/vc.js`. `--prod` apunta al proyecto **de staging**, no a producción.
4. Probarlo en el celular, en https://amigo-secreto2026-staging.vercel.app:
   - la foto de «Prueba Staging A» debe ocupar toda la tarjeta al pasar por el centro de la pantalla;
   - un toque debe abrir el perfil.

## 2. «Otra consulta» con Gemini

### Lo que se decidió

- **Solo «Otra consulta»** responde dentro de la app. «Opciones similares» y «Tiendas físicas» siguen preparando el texto para copiar, porque necesitan búsqueda web.
- **Sin búsqueda web.** La prueba del 1 de noviembre mostró que la capa gratuita la rechaza (`429 RESOURCE_EXHAUSTED`), pero responde sin ella.
- **Modelo:** `gemini-3.5-flash-lite`. Respondió en menos de 1 s y con buena calidad. `gemini-3.8-flash` tardó entre 1,5 y 3 minutos, cortó las respuestas y a veces devolvió 503. Hay que cambiar `GEMINI_MODEL` en `.env` y dejar el 3.8 fuera o como respaldo.
- **Capa gratuita**, sin facturación. Google puede usar las preguntas para mejorar sus productos, y eso debe decirse en el aviso.
- La clave está en `.env`, que Git ignora. Nunca se imprime ni se copia a otro archivo.

### Qué ve la persona

En el panel de «Otra consulta» (regalo elegido o gustos generales):

- un botón **Preguntar aquí** junto al actual **Copiar texto**;
- una respuesta corta en texto plano, con el aviso «Respuesta generada por IA, puede equivocarse»;
- un aviso previo de que la pregunta y los datos públicos del regalo se envían a Google, y de que la respuesta no cambia nada en la app;
- si Gemini falla, se agota la cuota o el asistente está apagado, un mensaje y el botón **Copiar texto**, como hoy;
- nada se guarda: al cerrar el panel se pierde.

### Cómo se construye

1. **Edge Function `gift-assistant`** (Supabase), con la clave solo como secreto del servidor.
   - El navegador envía `participant_id`, `gift_id` o «gustos generales» y la pregunta, de hasta 500 caracteres.
   - **El servidor lee los datos públicos de la base**: el texto del regalo nunca lo envía el cliente.
2. **Prompt.** Responder en español con los datos del bloque delimitado, decir «no lo sé» si no alcanzan, no inventar tiendas, precios, stock ni enlaces, y tratar los datos como información y no como instrucciones. Reutilizar la limpieza de [gift-prompt.ts](../src/domain/gift-prompt.ts).
3. **Límites.**
   - Un tope diario global, por ejemplo 200 preguntas, más un tope por minuto.
   - Respuestas de unos 300 tokens.
   - Tiempo de espera de 20 s.
   - Interruptor `GIFT_ASSISTANT_ENABLED`.
   - No hay IP verificada (`RATE_LIMIT_IP_SOURCE=off`), así que el límite efectivo es global: si alguien lo agota, el asistente se apaga y el resto de la app sigue funcionando.
4. **Migración de cuotas.**
   - Nueva operación `assistant` y ventana de 86400 s en `private.rate_limits` y en `consume_quota`.
   - Una función propia `server_assistant_quota`.
   - Las pruebas SQL correspondientes.
5. **Interfaz.**
   - Ampliar [GiftAssistant.tsx](../src/components/assistant/GiftAssistant.tsx) con la respuesta, el estado de carga y los errores.
   - Usar el servicio cliente con cancelación, límite de tamaño y `Retry-After`, como en `gift-mutations.ts`.
   - Mostrar el texto de la respuesta siempre como texto literal, nunca como HTML.

### Material reutilizable

El trabajo anterior está en `artifacts/assistant-gemini-backup/` (fuera de Git): `tracked-changes.patch` y `untracked-files.tar`. Extraer **solo** lo que sirva:

- `supabase/functions/gift-assistant/index.ts`, `_shared/assistant-handler.ts`, `_shared/assistant-provider.ts` y `_shared/assistant-contract.ts`: quitar el grounding, el modelo de respaldo con búsqueda y los sobres firmados si no hay historial.
- `supabase/migrations/20261101150000_gift_assistant_quota.sql` y `supabase/tests/database/008_assistant.sql`: renombrar la migración con una fecha nueva.
- `tests/unit/gift-assistant.test.ts`: los casos de proveedor simulado y de errores.
- `scripts/probe-gemini.mjs`: la prueba sin búsqueda usada el 1 de noviembre estaba en la carpeta temporal de la sesión; conviene recrearla aquí.

**No** reutilizar `public/search-suggestions.*` ni `SearchSuggestions.tsx`, ni el cambio de CSP del iframe: sin búsqueda no hacen falta.

Los archivos que el trabajo anterior también tocó y hay que ajustar de nuevo:

- `supabase/config.toml` (función con `verify_jwt=false`);
- `supabase/functions/.env.example` y `scripts/check-docs.mjs` (recuento de variables);
- `scripts/check-security.mjs` (lista de funciones y patrón de clave `AIza`);
- `server/deployment-config.ts`, `tests/unit/deployment-config.test.ts` y `_shared/server-rpc.ts`.

### Orden de trabajo

1. Implementar en local con un proveedor simulado.
2. Correr las verificaciones: `npm run typecheck`, `npm run test:unit`, `npm run test:db`, `npm run test:security`, `npm run check:docs`, `npm run build` y `npm run test:ui`.
3. Hacer una prueba real con la clave en local y datos ficticios: algunas preguntas, sin superar la cuota.
4. **Staging** (pedir confirmación antes):
   - aplicar la migración en el proyecto `eknnkmndfxgyjsdgkwkh`;
   - cargar los secretos de la función (`GEMINI_API_KEY`, `GEMINI_MODEL`, `GIFT_ASSISTANT_ENABLED`) con `supabase secrets set` y sin mostrarlos;
   - desplegar la función y publicar el frontend.
5. Probarlo en staging y documentar el resultado en [validation-results.md](validation-results.md) y [gift-assistant.md](gift-assistant.md).
6. Producción solo con autorización explícita: migración, secretos, función y push.

## Otros pendientes menores

- La línea del README que apunta al «Plan del asistente Gemini» es una edición tuya. Actualizarla cuando el asistente esté listo.
- Los scripts locales `scripts/test-profile-ui-local.mjs` y `tests/support/organizer-ui-local.mjs` ya incluyen el paso «Usar esta foto», pero no se han corrido.
