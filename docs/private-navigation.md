# T12: enlaces privados y navegación protegida

Los enlaces de T07 ya se abren en React. Un enlace personal usa `/acceso#token=…`; el del organizador, `/organizador/acceso#token=…`. El origen debe corresponder al frontend conectado al mismo Supabase local donde se generó la credencial.

## Qué hace la aplicación

1. Antes de renderizar React o cargar datos/imágenes remotos, extrae el fragmento y reemplaza la URL por la ruta limpia. Limpia también enlaces malformados; no admite credenciales en query string, parámetros duplicados ni tokens en otras rutas.
2. Mantiene el token en una clausura de memoria de la pestaña. No lo publica en props, contexto, estado React, DOM, cookies, `history.state`, `localStorage` o `sessionStorage`.
3. Envía `POST /functions/v1/wishlist-api` con `{ action: 'validate_access' }`, clave pública en `apikey` y credencial en `X-Edit-Token`. No usa Supabase Auth ni Authorization bearer. La petición omite cookies, no permite redirecciones, usa `no-store`, no envía Referer y tiene límite de 10 segundos.
4. Valida la forma de la respuesta y el rol esperado por la ruta. El participante entra a su perfil; el organizador a `/organizador`. La navegación reemplaza la entrada de acceso en el historial.
5. Los controles solo aparecen para el UUID autorizado o un organizador validado. Entrar a un destino privado vuelve a comprobar la credencial en servidor, indicando el UUID de destino cuando corresponde. Alterar el slug, posición o URL no crea permisos.

El contexto solo ofrece estado y operaciones de validación/cierre, sin un getter del token. El futuro transporte de mutaciones deberá permanecer dentro de esta sesión; el backend T08 seguirá autorizando cada escritura en su propia transacción. Los permisos visuales no sustituyen esa comprobación.

## Estado y cierre

«Cerrar acceso de edición» elimina la credencial de esta pestaña y restaura el foco al perfil público. No revoca el enlace original ni borra datos; la revocación pertenece a la administración. Al recargar, abrir otra pestaña o regresar desde una página conservada en BFCache se necesita reabrir el enlace original.

Se revalida al recuperar foco o visibilidad, sin polling. La expiración retira los permisos localmente; el servidor es la autoridad sobre vencimiento y revocación. Un 401/403 retira la credencial. Red, timeout o 5xx dejan la interfaz en lectura y permiten reintento explícito. Un 429 deshabilita temporalmente el reintento siguiendo `Retry-After` (hasta 60 s). El handler existente expone esa única cabecera por CORS para que el navegador la pueda leer.

Los estados de enlace ausente, inválido, vencido, revocado o rol incorrecto comparten un mensaje general y retorno al catálogo. No existe un campo para probar tokens manualmente. Cancelar mientras se valida o abrir otro enlace impide que una respuesta anterior vuelva a conceder permisos.

## Alcance de esta iteración

| Ruta | Resultado actual |
| --- | --- |
| `/acceso` | Verificación y entrada al perfil personal. |
| `/organizador/acceso` | Verificación de organizador y entrada al destino protegido. |
| `/participante/:slug` | Perfil público; franja y enlaces de edición si el acceso en memoria lo permite. |
| `/participante/:slug/editar` | Control de acceso y pantalla preparatoria; formulario de perfil en T18. |
| `/participante/:slug/regalo/:position/editar` | Desde T13: editor manual protegido de una posición 1–3, con UUID/versión. |
| `/organizador` | Entrada protegida; panel completo y gestión de enlaces en T20. |

T12 no adelantó operaciones de administración, importación, subida ni edición. T13 conecta ahora [el editor manual](gift-editor.md) a las mutaciones existentes, sin endpoints nuevos ni claves privilegiadas en frontend. Los once participantes conservan sus listas vacías hasta una edición explícita autorizada.

## Probar sin credenciales

```powershell
npm run preview:local
```

En `http://127.0.0.1:5173/` puedes recorrer catálogo y perfiles. `/acceso` o `/organizador` sin credencial muestran acceso no disponible. Esta API temporal es solo de lectura y no simula credenciales válidas; un enlace real debe probarse contra la pila local de Supabase, no contra la base temporal.

Las pruebas automatizadas usan credenciales ficticias aisladas y respuestas de acceso controladas, sin cuentas ni enlaces permanentes:

```powershell
npm test
npm run test:ui
npm run build
```

## Probar con Supabase local

1. Inicia Docker Desktop y Supabase local. Revisa que `.env.local` apunte a `http://127.0.0.1:54321` y tenga únicamente la clave pública de **esa pila local**. Conserva cualquier configuración existente hasta revisarla; no uses el destino remoto para esta validación.
2. Aplica las migraciones pendientes mediante el comando local documentado en [integración](supabase-integration.md). Si el grupo todavía no está cargado, sigue [participants:local](catalogue.md), que protege cambios propios.
3. En una terminal inicia `npm run functions:local` y mantenla abierta. El ejemplo Edge permite los orígenes `http://localhost:5173` y `http://127.0.0.1:5173`.
4. En otra terminal inicia `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`.
5. Abre el enlace local original del organizador. Si aún no existe, el comando `npm run organizer:bootstrap` lo genera una sola vez en tu terminal. **No lo ejecutes para reemplazar uno existente.** Recuperación y sus efectos se explican en [T07](private-access.md).

El panel T20 aún no emite enlaces personales visualmente; el contrato de emisión ya existe en `wishlist-api` y exige un organizador válido. No se añadió un endpoint auxiliar para omitir ese permiso. Para pruebas de backend aisladas siguen disponibles `test:access:http` y `test:access:concurrency` de T07.

La prueba manual debe confirmar URL limpia, cierre, pérdida de acceso al recargar y retorno al catálogo. No hace falta desplegar funciones ni aplicar cambios a producción para esta revisión.

## Archivos y validación

| Archivos | Responsabilidad |
| --- | --- |
| `src/app/private-access-bootstrap.ts`, `src/domain/private-access.ts` | Captura, limpieza, formato y contrato del contexto autorizado. |
| `src/services/access-validation.ts`, `src/services/private-session.ts` | Transporte restringido, memoria, cancelación, permisos y expiración. |
| `src/app/PrivateAccessProvider.tsx` | Contexto de metadatos y revalidación al reanudar. |
| `src/pages/PrivateAccessPage.tsx`, `PrivateDestinationPage.tsx` | Entrada y rutas privadas protegidas. |
| `src/components/access/`, `src/styles/private-access.css` | Estados, franja privada, cierre y accesibilidad. |
| `src/app/App.tsx`, `src/main.tsx`, perfil y cuadrícula | Integración con rutas y acciones condicionales. |
| `supabase/functions/_shared/access-handler.ts` | Exposición CORS de `Retry-After`; sin cambios de autorización. |
| `tests/unit/private-session.test.ts`, `tests/ui/private-access.spec.ts` | Captura, transporte, aislamiento, carreras, reintentos, rutas y accesibilidad. |

Se comprueban encabezados sin token en URL/cuerpo, ausencia de persistencia, aislamiento entre participantes/pestañas, organizador, rol incorrecto, cierre durante una solicitud, reemplazo de fragmento dentro de la SPA, expiración, revocación simulada al reanudar, 429 y copia pública limpia. Las capturas usan únicamente credenciales ficticias; artefactos y trazas están ignorados por Git. Axe y zoom/reflujo no sustituyen la revisión con lector de pantalla prevista en T21.

T12 se probó con transporte de acceso controlado y PostgreSQL temporal para lecturas públicas. **No se ensayó el nuevo recorrido completo contra Edge/Docker real ni se consultó la instancia remota.** Las comprobaciones reales del backend registradas en T07/T08 siguen siendo las de esas iteraciones.

Referencia técnica: [cabeceras de autorización de Edge Functions](https://supabase.com/docs/guides/functions/auth-headers). La clave pública identifica el proyecto; la credencial personalizada y el servidor determinan los permisos.

## Actualización T18

La ruta `/participante/:slug/editar` ya contiene el formulario autorizado de foto, mensaje y preferencias. Conserva el borrador durante revalidaciones y retira el permiso de guardar tras una denegación. Su recorrido básico con enlace efímero, servidor real local, Storage y SQL se comprobó en T18; recargar no hereda acceso. Ver [perfil editable](profile-editor.md). La administración visual sigue en T20.
