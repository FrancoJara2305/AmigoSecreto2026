# T22: integración y revisión de seguridad

Revisión local del 30 de octubre de 2026 (America/Lima). No autoriza operaciones remotas ni sustituye una revisión del entorno desplegado. T21 conserva pendiente su prueba con lector de pantalla real.

## Repetir la revisión

Desde la raíz, en CMD o PowerShell, con Node 24 y dependencias instaladas:

```cmd
npm.cmd test
npm.cmd run build
npm.cmd run test:security
npm.cmd run test:security:ui -- --workers=2
npm.cmd run test:security:local
npm.cmd run test:admin:ui:local
npm.cmd audit
```

Los dos últimos ensayos con Supabase requieren Docker Desktop activo y se ejecutan **secuencialmente**, pues comparten la misma pila desechable. `test:security:ui` usa una previsualización temporal en 4183/4184 y transporte interceptado; no reutiliza ni detiene una previsualización existente en 4173/4174. El ensayo real del panel usa 5179. Ninguno necesita un enlace privado del usuario.

`test:security:local` prepara **AmigoSecretoAdminTest** en `artifacts/admin-local`, API 54421, DB 54422 e inspector 8094. Parte de una base vacía, ejecuta las migraciones al arrancar y crea exclusivamente identidades sintéticas. Rechaza argumentos/destinos arbitrarios y una pila de prueba existente. No admite `db-url`, proyecto enlazado, `reset`, `push`, `--all` o credenciales remotas. Retira de su entorno los identificadores/credenciales remotos de la CLI y excluye `.env*` al copiar funciones.

El proxy de importación de prueba escucha temporalmente en 54802 para que Docker Desktop alcance Windows; exige firma HMAC y reclamación SQL de un solo uso. La tienda es un servidor TLS sintético en loopback con CA efímera, sin tiendas en vivo. El conector que mapea la IP sintética al servidor local vive solamente en el test; no desactiva la validación DNS/TLS del transporte de producción.

En `finally`, el ejecutor detiene sus funciones, elimina únicamente los contenedores/volúmenes de **AmigoSecretoAdminTest**, cierra sus servidores y borra su archivo temporal de variables. Los certificados y artefactos sintéticos quedan bajo `artifacts/`, ignorado por Git. Si el proceso se interrumpe por fuerza o Docker se cae, revisa esa pila antes de repetir: el ejecutor rechaza su reutilización accidental. No uses `stop --all` ni limpiezas generales de Docker.

## Qué comprueba cada capa

| Capa | Evidencia y alcance |
| --- | --- |
| Tipos, dominio, transporte y parser | `npm.cmd test`: 118 pruebas unitarias, 303 aserciones PGlite y 11 pruebas de datos. Incluye protocolos/IPs prohibidos, DNS mixto, rebinding, TLS/Host/SNI, redirecciones, bytes comprimidos/descomprimidos, timeout y JSON profundo. |
| Código entregable y build | `scripts/check-security.mjs`: archivos versionados y nuevos no ignorados, assets compilados, JWT privilegiados, claves secretas, PEM y enlaces privados literales; entornos ignorados, Auth desactivado, esquema expuesto y ausencia de sumideros HTML/almacenamiento en `src`. Una variable pública privilegiada sintética hace fallar el build sin revelar su valor. |
| Navegador con transporte controlado | `tests/ui/security.spec.ts`: seis casos en escritorio/tableta/móvil. HTML hostil se muestra literalmente, URL JavaScript no crea enlace, token ausente de URL de red/body/Referer/lecturas públicas/consola/DOM/history/almacenamiento después de guardar. |
| PostgreSQL real | Las siete suites SQL existentes corren dentro de transacciones revertidas: 303 aserciones. Además se enumeran RLS y EXECUTE de todas las tablas/RPC de la aplicación; `private` no es utilizable por `anon`/`authenticated`. Lint local de `public,private` con fallo ante advertencias. |
| PostgREST público | Lectura de las tres tablas públicas sin secretos; INSERT/PATCH/DELETE denegados; tablas privadas inaccesibles. Una huella de las filas confirma que los ataques no escribieron. Los tests SQL también ejercitan `authenticated`, sin crear cuentas Auth. |
| Tres Edge Functions reales | Origen ajeno, GET, query, JSON inválido/excesivo y falta de capacidad rechazados; la clave pública no concede edición. UUID/regalo ajeno y administración con token personal rechazados. Revocación comprobada en edición, subida e importación. |
| Storage real | PNG normalizado a WebP, MIME falso/SVG rechazados, subida ajena y asociación de archivo ajeno rechazadas, referencia vigente no reclamable por limpieza. POST/PUT/DELETE públicos no alteran el archivo: comparación binaria antes/después y recibo de borrado vacío. |
| Concurrencia real | Dos guardados HTTP con versión 1: un 200 y un 409; dos cargas en el último cupo: un 201 y un 429 con espera, sin evasión mediante IP reenviada. Dos solicitudes firmadas del mismo nonce: un 200 y un 409, una sola conexión a la tienda. Siete carreras administrativas con dos conexiones y espera de locks, incluidas expiración, emisión, rotación y baja frente a subida. |
| Importación completa | Edge → Node → TLS → callback Edge → SQL → parser. Sin credenciales del navegador reenviadas a proxy/tienda; replay, DNS mixto, redirección a DNS privado, bomba gzip y 403/captcha no guardan regalos. |
| Organizador en navegador real | `test:admin:ui:local`: alta/lista vacía, avatar pendiente/asociado, renombre con slug estable, regalo, orden, emisión/revocación con otra pestaña abierta, evento/fecha, baja con cascadas/cola y rotación en memoria. Recarga retira el acceso. |
| Secretos en logs | Captura de stdout/stderr de los workers Edge comparada con las capacidades, sus hashes, credencial privilegiada local y HMAC generados por el ensayo. No se imprime el material examinado. No cubre logs de un proveedor remoto. |
| Dependencias | `npm.cmd audit --json`: cero avisos conocidos en esta ejecución, incluidas dependencias de desarrollo. Es una consulta del estado del registro, no una garantía contra vulnerabilidades desconocidas. |

La búsqueda estática es una detección de patrones, no prueba de ausencia absoluta de secretos. Solo exceptúa el valor literal ficticio preexistente de `tests/unit/public-config.test.ts`, usado para demostrar rechazo de una clave. No ignora todos los tests ni examina/imprime el contenido de `.env.local`. El build permite únicamente claves públicas mediante la validación existente; no se añadieron dependencias o claves.

## Diferencias observadas y límites

El Kong generado por Supabase CLI 2.122.0 incluye un plugin CORS que responde `OPTIONS` con `Access-Control-Allow-Origin: *` antes de Edge y puede añadir cabeceras a respuestas. Por eso el ensayo HTTP comprueba el **403 efectivo** del origen ajeno, y los tests de handlers comprueban sus cabeceras exactas. No se cambió el gateway ni se relajó la autorización de las funciones. CORS y la API key no reemplazan la capacidad privada. Se deberá verificar nuevamente el gateway/CORS en staging antes de T25. Referencias: [CORS en Edge](https://supabase.com/docs/guides/functions/cors), [seguridad de productos Supabase](https://supabase.com/docs/guides/security/product-security) y [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Storage puede responder HTTP 200 con `[]` a DELETE cuando RLS filtra todos los objetos. El test exige un recibo vacío y comprueba que los bytes originales siguen disponibles; no toma un 200 como prueba de eliminación. Las cuotas se consumen antes de autorizar operaciones: para observar específicamente un 401 tras revocación se limpian únicamente las cuotas de esa credencial ficticia, después de probar separadamente el rechazo por cuota.

Los primeros ensayos identificaron expectativas equivocadas del propio test sobre esas respuestas, el código de una redirección a IP literal y una cuota deliberadamente agotada. Se ajustaron los casos para probar el contrato real, manteniendo la comprobación de que no hubo escritura, eliminación ni conexión prohibida. No fue necesario modificar código de aplicación, SQL, RLS o endpoints en T22.

## Matriz de aceptación del plan

“Local” describe evidencia determinista de las suites citadas y de los bloques previos; no equivale a aprobación de producción. La regresión UI completa de T21 fue 330/330; T22 añade seis casos dirigidos (la suite completa actual registra 336). No se atribuye una nueva ejecución completa a T22.

| Criterio | Estado/evidencia |
| --- | --- |
| A01 Bienvenida | Local: `catalogue.spec.ts`. |
| A02 Participantes dinámicos | Local: datos/SQL y alta/baja del organizador real. |
| A03 Cuadrícula | Local: catálogo y T21, anchos 1280/768/390, reflujo 320. |
| A04 Hover/tacto/teclado | Local: catálogo y matriz T21. |
| A05 Rutas | Local: perfil directo/recarga/404/retorno en `profile.spec.ts`; hosting pendiente de T25. |
| A06 Tres posiciones | Local: SQL/perfiles con listas vacías/parciales/completas. |
| A07 Integridad SQL | Local: suites SQL, conflictos concurrentes y unicidad por posición. |
| A08 Crear/editar | Local: HTTP/SQL y UI real del organizador; persistencia independiente del navegador. |
| A09 Limpiar opción | Local: `gift-editor.spec.ts` y mutaciones SQL. |
| A10 Tipos/calzado | Local: validadores y editor/perfil. |
| A11 Opcionales | Local: dominio/SQL/editor sin precio/foto/enlace inventados. |
| A12 Precio/moneda | Local: validadores/parser/SQL y UI PEN/USD/cero. |
| A13 Enlaces comerciales | Local: validadores y UI, incluidos nuevos payloads hostiles. |
| A14 Importación completa | Local: TLS sintético/Edge/SQL y vista previa selectiva T17. |
| A15 Importación parcial | Local: parser y `product-import.spec.ts`. |
| A16 Tienda incompatible | Local: timeout/403/captcha/dinámico controlados. Tiendas en vivo pendientes de comprobación manual en entorno autorizado. |
| A17 SSRF | Local: transporte instrumentado, DNS mixto/rebinding/IP fija/TLS y ensayo Edge→Node. |
| A18 Límites de importación | Local: bytes/compresión/profundidad/redirecciones/timeout y bomba gzip real en T22. |
| A19 Frecuencia | Local: SQL compartido y peticiones HTTP concurrentes; 429/Retry-After. Identidad IP de proveedor sigue sin habilitarse. |
| A20 Imágenes | Local: tres códecs y límites en unitarias; Edge/Storage en ensayos de medios y T22. |
| A21 Referencias/limpieza | Local: SQL, bytes preservados, limpieza protegida y carreras administrativas. |
| A22 Fallbacks | Local: perfil/catálogo, imágenes rotas y reflujo T21. |
| A23 Preferencias | Local: perfil T18 y organizador real. |
| A24 Escrituras públicas | Local: SQL con ambos roles, PostgREST, tres funciones y Storage real. |
| A25 Aislamiento | Local: UUID/regalo/archivo ajenos rechazados por servidor, con huellas sin cambios. |
| A26 Secreto privado | Local: build/código, lecturas/respuestas públicas, UI/Referer y logs Edge de ensayo. Logs/headers alojados pendientes de T25. |
| A27 Revocación | Local: tres endpoints y navegador personal abierto durante revocación del organizador. |
| A28 Recuperación | Local: bootstrap/recuperación SQL, reemisión y rotación; sin endpoint de bootstrap público ni contraseña por defecto. |
| A29 Administración | Local: backend/concurrencia y navegador real del panel. |
| A30 Evento | Local: SQL/HTTP/panel, fecha literal y presupuesto rechazado. |
| A31 Conflictos/red | Local: dos conexiones/HTTP, UI conserva borradores y reconcilia respuestas perdidas. |
| A32 Estados | Local: catálogo/perfil/acceso/editores/organizador y error/reintento. |
| A33 Accesibilidad | Parcial: teclado/contraste/zoom/ARIA y motores de T21; lector de pantalla real pendiente. |
| A34 Movimiento/diseño | Local: matriz T21, móvil, reducido, fallbacks y nombres largos. |
| A35 Rendimiento | Comprobado posteriormente en T23: [LCP/CLS, build y solicitudes con condiciones registradas](performance-review.md). No son métricas de producción. |
| A36 Despliegue reproducible | Migraciones desde base vacía verificadas localmente. Rutas profundas/Vercel y entorno alojado pendientes de T25. |
| A37 Restauración/mantenimiento | Comprobado posteriormente en T24: [exportación/restauración de DB y binarios, permisos, invalidación de enlaces y mantenimiento](backup-recovery.md). Solo pila sintética; restauración alojada pendiente de T25. |
| A38 Exclusiones | Revisión de rutas/contratos/esquema: sin sorteo, asignación, reserva, notificaciones, cuentas ni presupuesto configurable. |

No se ha comprobado CSP, TLS/dominio final, cabeceras/logs del proveedor, transporte desplegado o límites reales de infraestructura. Esas verificaciones se harán en el bloque de despliegue con aprobación independiente. La revisión local no encontró un fallo crítico de permisos o exposición de secretos en las superficies ensayadas; no se declara terminado el MVP ni conformidad WCAG completa.

## Archivos de esta iteración

| Archivos | Cambio |
| --- | --- |
| `scripts/check-security.mjs` | Nuevo escaneo de entregables/build y prueba negativa de configuración pública. |
| `scripts/test-admin-local.mjs` | Modo `--security`, fixture de transporte, lint, registro de capacidades sintéticas para revisar logs y eliminación del archivo temporal de variables. |
| `tests/support/security-integration.mjs` | Nuevo ensayo de ataques HTTP/PostgREST/Storage/importación, SQL y concurrencia. |
| `tests/ui/security.spec.ts`, `playwright.security.config.ts` | Casos de contenido hostil y fugas con puertos independientes. |
| `tests/ui/fixtures/gift-editor.ts` | Destinos de prueba 4183/4184 opcionales para esos casos; el resto conserva 4173/4174. |
| `package.json`, `tsconfig.json` | Comandos de revisión e inclusión de la configuración TypeScript. |
| `README.md`, `docs/implementation-progress.md`, `docs/validation-results.md`, este informe | Estado, resultados, limitaciones y reproducción. |

La huella agregada de participantes, regalos, evento y credenciales de la instancia local principal se comparó antes/después: idéntica. Al cierre, PostgreSQL principal Healthy, cero contenedores/volúmenes de la pila desechable y archivo temporal de variables eliminado. Docker Desktop queda activo; no se detiene un servicio del usuario al terminar los tests.
