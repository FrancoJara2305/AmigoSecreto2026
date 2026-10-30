# Validación de la preparación Supabase

Iteración del 26 de octubre de 2026. Todas las comprobaciones se realizaron sobre archivos locales, procesos locales o PostgreSQL efímero en memoria. No se vinculó ni consultó la instancia alojada.

Actualización tras instalar Docker: el usuario aportó un lint local sin errores. Se corrigieron las pruebas de DELETE de Storage para admitir el rechazo 42501 del trigger oficial, sin desactivar el trigger ni usar `storage.allow_delete_query`. Se reprodujo ese comportamiento en el fixture embebido. Se ejecutó nuevamente el contrato en el contenedor local: **90 comprobaciones correctas y ROLLBACK final**, además de los 7 tests Node y el chequeo de tipos. Las migraciones no requirieron cambios.

| Comprobación | Resultado |
| --- | --- |
| Supabase CLI | Instalada como devDependency, versión 2.122.0; `init` local completado. |
| `npm run typecheck` | Correcto. Incluye contrato de filas de las consultas públicas; no solo sintaxis del cliente. |
| `npm test` | 7 tests Node y 90 aserciones SQL correctas, además del chequeo TypeScript. |
| Migraciones sobre base vacía | Las tres se aplican en orden en PostgreSQL embebido; sin participantes ni tokens iniciales. |
| Integridad y permisos | Checks, UNIQUE/FK, cascadas, versiones, límites de JSON, roles anon/authenticated/service_role, RLS y restricciones de Storage comprobados. |
| Funciones preparatorias | Importación/upload siguen bloqueadas. wishlist-api incorpora después las operaciones verificadas de T07; ver sección correspondiente. |
| `npm run build` | Build React/Vite correcto. Pantalla preparatoria sin solicitudes a Supabase. |
| Secretos en Git | `.env`, `.env.local` y el archivo Edge local están ignorados y no están versionados. Ejemplos contienen marcadores. |
| `git diff --check` | Sin errores de whitespace en cambios de archivos ya versionados. |
| `supabase db lint --local ...` | El usuario compartió la ejecución con resultado `No schema errors found`. |
| `npm run test:db:local` | Correcto en el contenedor Supabase local después de corregir la prueba de DELETE de Storage; finaliza con ROLLBACK. |

## Alcance de las pruebas de SQL

PGlite ejecuta PostgreSQL real compilado a WebAssembly; la versión reportada en esta ejecución fue **18.6**. El contrato también se ejecutó correctamente en Supabase local, configurado para PostgreSQL **17**. La versión alojada aún debe confirmarse antes de cualquier aplicación remota. El fixture `tests/fixtures/supabase-platform.sql` modela roles, grants, el rechazo de DELETE directo y las columnas mínimas de Storage necesarias para estas migraciones. Las políticas se ejecutan bajo `SET LOCAL ROLE`; se prueban también con grants/políticas deliberadamente permisivos dentro de una transacción que se revierte.

El fixture no es el esquema completo mantenido por Supabase. El contrato SQL ya pasó con los permisos y triggers de la pila local oficial; aún falta validar el comportamiento HTTP de Storage/PostgREST antes de aprobar producción. Las pruebas de DELETE de Storage comprueban denegación por permisos/trigger o cero filas afectadas por RLS; no atribuyen al RLS una denegación que produce el trigger global. Las filas de Storage usadas por los tests son metadatos de prueba con ROLLBACK; no se crean archivos reales.

En la preparación inicial no se habían probado concurrencia, Deno, bootstrap ni revocación. T07 completa esas comprobaciones de acceso, como se registra abajo. Subida binaria, CRUD e importación SSRF siguen pendientes.

## Próxima revisión manual

1. Revisar las tres migraciones y sus grants, incluida la revocación por defecto de EXECUTE para futuras funciones del propietario de migración.
2. Iniciar Docker y ejecutar las comprobaciones locales de la [guía](supabase-integration.md).
3. Comprobar lectura pública, denegación de escritura y Storage a través de las APIs locales.
4. Solo tras aprobar: realizar `login`/`link`, inspeccionar historial remoto y revisar `db push --linked --dry-run`. No aplicar cambios reales en esta iteración.

Ningún script de pruebas acepta credenciales o URL de base remota. No se ejecutaron `db reset`, `db push` ni despliegues. No se generaron enlaces privados ni se insertaron las 11 personas ficticias.

## Iteración posterior: T06

Se cargaron **11 participantes ficticios y 18 regalos únicamente en Supabase local** mediante el ejecutor de seed. La afirmación anterior de ausencia de demo corresponde a la preparación inicial. Las migraciones siguen sin insertar participantes ni credenciales y no se aplicó nada a producción.

Pasaron seis pruebas nuevas del seed en PostgreSQL embebido: cobertura de listas/tipos/campos opcionales, ejecución repetida preservando cambios, rechazo sin marcador local, rechazo de datos ajenos, rechazo de identidad conflictiva y ejecución del contrato después del seed sin alterar la demo. El contrato SQL también pasó en Docker después de cargar los datos: 90 comprobaciones y ROLLBACK final.

## T07: ciclo de tokens y backend de acceso

- Nueva migración creada con la CLI y aplicada únicamente mediante `migration up --local`. Las migraciones anteriores no se modificaron.
- **127 aserciones SQL** correctas en PostgreSQL embebido y Supabase local: permisos del puente RPC, bootstrap, ámbitos, expiración, reemplazo, revocación, rotación, recuperación y cuotas que contabilizan errores. Todos los fixtures SQL terminan con ROLLBACK.
- **16 tests Node** de configuración/handlers/tokens y **6 tests de seed**, además de TypeScript. Build de Vite correcto; no se incorporaron secretos ni módulos de servidor al cliente.
- Concurrencia real: una sesión mantiene el bloqueo de `require_access`, otra intenta revocar; se observa la espera en `pg_stat_activity`, se libera la primera y la validación posterior devuelve 401. Identidad temporal limpiada.
- HTTP real: wishlist-api servida por Edge Runtime 1.77.8 (Deno 2.1.4); se verificaron acceso personal válido, scope incorrecto, denegación de emitir enlaces como participante, token ausente, acción bootstrap inexistente, origen no permitido y revocación posterior. Sin tokens en el output de pruebas.
- Lint local sin errores y asesores de seguridad locales: `No issues found`.

El bootstrap persistente del usuario no se ejecutó ni se imprimió un enlace permanente en herramientas. Se ofrece `npm run organizer:bootstrap` para ejecutarlo manualmente en su terminal. No se conectó con la instancia remota. La UI de acceso corresponde a T12; las mutaciones de datos corresponden a T08.

## T08: mutaciones protegidas

- Dos migraciones nuevas aplicadas solo al contenedor local; no se modificaron migraciones previas. La segunda alinea la volatilidad del normalizador con los constructores JSON y elimina las advertencias de lint.
- **170 comprobaciones SQL** correctas: permisos, pertenencia, perfiles, posiciones, precio exacto, tipo/detalles, fuentes de imagen, media registrada, versiones, eliminación/recreación, expiración/revocación y cuotas.
- **26 tests Node** y **6 tests de seed**; TypeScript y build Vite correctos. No se añadieron dependencias.
- Prueba de concurrencia real: dos ediciones con la misma versión dejan una sola actualización; dos altas en una posición crean una sola fila; revocar espera a una escritura ya autorizada y bloquea las siguientes.
- HTTP real de Edge/Deno: perfil y ciclo de crear/editar/limpiar/recrear regalo, comprobación independiente de persistencia en PostgreSQL, 401/403/409/422 y errores por campo. La regresión HTTP de T07 también pasó.
- Lint local con `--fail-on warning`: sin problemas. Asesores de seguridad locales: `No issues found`.

Los tests SQL terminan con ROLLBACK y las identidades temporales de HTTP/concurrencia se limpian al finalizar. No se alteraron las listas de demo, el enlace del organizador ni la instancia remota. Las pantallas y confirmaciones visuales de edición siguen pendientes de T13/T18.

## T09: componentes y previsualización

- TypeScript y build de Vite correctos. Tailwind y Lucide según el plan, más Playwright/axe solo en desarrollo.
- **27 tests unitarios**, incluida medición de contraste de colores reales del CSS; **170 comprobaciones SQL en memoria** y **seis tests de seed** correctos.
- **24 pruebas UI** en Edge headless: ocho escenarios en escritorio, tableta y móvil; teclado, validación, foco y cancelación/restauración del diálogo, guardado simulado, notificaciones y estados.
- Axe sin violaciones detectadas de las reglas WCAG A/AA seleccionadas en página inicial, errores y diálogo. Reflujo a 320 px, texto al 200 % y movimiento reducido comprobados.
- Revisión visual de capturas de las tres resoluciones y confirmación móvil. Se corrigió el centrado nativo del diálogo afectado por el reset de CSS y se añadió una aserción de posición.

La galería no hace solicitudes a Supabase, no persiste datos y no reemplaza las pantallas previstas para T10/T13. En T09 no se ejecutaron pruebas contra bases remotas ni se modificó la base local. Pruebas con lector de pantalla real y otros motores de navegador quedan para T21; el análisis automático no acredita conformidad WCAG completa.

## T10: catálogo y grupo de once participantes

- **30 tests unitarios** correctos: consultas públicas, conteos cero, errores, paths de avatar y reglas anteriores. **170 comprobaciones SQL en memoria** y **11 tests de seed/roster** correctos.
- El roster contiene los once nombres y comienza sin regalos, mensajes ni preferencias inventadas. Se comprobó conversión de demo intacta, repetición preservando cambios, rechazo de demo editada, marcador local obligatorio y rechazo de participantes ajenos. Se verificó lectura bajo `anon` y denegación de UPDATE directo.
- **51 pruebas UI** en Edge headless: 27 del catálogo y 24 de regresión T09, en escritorio/tableta/móvil. Se probaron distribución 3/2/1, dos GET sin consultas por tarjeta, conteo y nombres provenientes de datos, reintento, vacío, anclas con foco, Enter, tacto con un toque, retorno/recarga, fotos rotas y fallback.
- Axe sin violaciones A/AA detectadas en el catálogo; reflujo a 320 px, texto al 200 %, nombre largo, movimiento reducido y revisión visual de las tres resoluciones. Tras ajustar la visibilidad permanente de avatares en pantallas pequeñas se repitió la batería del catálogo.
- Previsualización real servida en loopback: HTTP 200, once filas con los nombres solicitados; escritura POST devuelve 405 y origen externo devuelve 403. Los GET usan SQL fijo contra PostgreSQL temporal. No hay endpoint de edición nuevo.
- TypeScript y build Vite correctos. Galería T09 diferida en un chunk separado; bundle inicial dentro del objetivo de 200 KB gzip del plan. Esto no sustituye mediciones de LCP/CLS.

Docker no tenía un daemon accesible durante T10. **No se aplicó `participants:local` a Supabase local ni se comprobó el conteo con PostgREST real en esta ejecución**; se probaron SQL/PostgreSQL embebido, el SDK real con transporte controlado y el navegador contra la API temporal. El paso manual está en [catálogo](catalogue.md). No se consultó ni modificó la instancia remota, no se cambió `.env.local`, no se añadieron migraciones, cuentas Auth o enlaces privados. El perfil completo y los casos de slug inválido siguen en T11; la administración editable, en T20.

## T11: perfiles públicos

- **35 tests unitarios** correctos: nuevas reglas de posiciones, precios, detalles, imágenes, URL pública y consulta por slug, además de la regresión anterior. **170 comprobaciones SQL en memoria** y **11 tests de datos** correctos.
- **75 pruebas UI** correctas en Edge headless: 24 del perfil y 51 de catálogo/galería. Se probaron 0/1/2/3 regalos, hueco intermedio, precio cero y USD, datos opcionales, sistema de calzado, gustos separados, recarga y retorno, slug inválido/inexistente, fallo con reintento, imágenes rotas y URLs de tienda inseguras.
- La copia devuelve exclusivamente el perfil público sin parámetros/fragmentos. Se comprobó el fallback manual ante denegación del portapapeles. Una respuesta demorada al salir de Melyza no reemplaza el perfil posterior de Karina.
- Axe sin violaciones A/AA detectadas en perfiles vacíos y completos. Capturas de escritorio/tableta/móvil revisadas; reflujo a 320 px y texto al 200 %, incluidos nombres largos, preferencias sin espacios y etiquetas de detalles sin recorte.
- TypeScript y build correctos. El perfil se carga bajo demanda: chunk propio de 10,57 KB minificados (4,08 KB gzip); entrada principal de 146,61 KB gzip, sin advertencia de tamaño de chunk. Sin paquetes nuevos.

Los perfiles normales de previsualización conservan las listas vacías elegidas por el usuario. Los regalos usados en las pruebas son fixtures aislados, sin inserción en sus datos. La lectura por slug de la API temporal usa SQL fijo con parámetros y no permite escrituras. No se modificaron migraciones, RLS, Edge Functions, `.env.local`, cuentas ni enlaces privados.

La validación se realizó con PostgreSQL embebido, SDK público real con transporte controlado y navegador sobre loopback. No se consultó la base remota ni se ejecutó esta prueba contra PostgREST/Docker real. El ensayo con Supabase local y los lectores de pantalla/otros motores siguen pendientes; el análisis automático no certifica conformidad WCAG completa.

## T12: acceso privado y permisos en memoria

- **42 tests unitarios** correctos, incluidos captura/limpieza antes del uso del token, transporte por encabezado, respuesta acotada, errores genéricos, deduplicación, ámbito personal, descarte de respuestas antiguas, cierre, expiración, rol incorrecto y espera de 429.
- **170 comprobaciones SQL en memoria** y **11 tests de datos** correctos. No hay cambios de esquema ni seed en T12.
- Regresión completa de **108 pruebas UI** correcta. Tras los ajustes finales se ejecutaron **36 pruebas propias de T12**, incluidas tres nuevas de carga/reintento del destino protegido. La suite actual reúne **111 casos UI**: 75 de T09–T11 y 36 de T12, en escritorio/tableta/móvil.
- URL limpia antes del POST privado; token únicamente en `X-Edit-Token`, sin body, query, Authorization, DOM, historial serializado ni almacenamiento. Recarga y segunda pestaña no heredan acceso. Copia de perfil público sin credencial.
- Aislamiento de participantes, entrada de organizador, rol incorrecto, URL privada sin credencial y posición inválida denegados. Revalidación con UUID de destino; revocación simulada al recuperar foco retira controles. Cancelar o reemplazar una petición pendiente no restaura permisos.
- Un 429 respetó el segundo indicado en `Retry-After` después de exponer esa cabecera CORS en el handler. La prueba unitaria comprueba la cabecera real del handler; el navegador usa respuestas controladas con el mismo contrato.
- Tres comprobaciones adicionales de fragmento dentro de la SPA confirman reemplazo de credencial en una ruta de acceso y descarte/limpieza en una ruta pública, sin transferir permisos a Karina.
- Axe sin violaciones A/AA detectadas en vista privada y acceso no disponible; capturas revisadas, reflujo a 320 px, texto al 200 % y foco restaurado al cerrar. TypeScript y build correctos, sin paquetes nuevos ni advertencia de tamaño de chunk.

Los tests usan credenciales ficticias aisladas y API pública temporal de lectura. **El nuevo flujo de navegador no se probó contra Edge/Docker real en esta ejecución.** No se creó un enlace permanente del usuario, no se cambió `.env.local`, no se consultó la instancia remota ni se ejecutó despliegue. La única adaptación de servidor es exponer `Retry-After` por CORS; la autorización T07/T08 sigue igual. El panel y los formularios continúan en T13/T18/T20.

## T13: editor manual de regalos

- **48 tests unitarios** correctos: borradores separados por tipo, identidad/versión, precisión de precio, fuente exclusiva de imagen, normalización del contrato, recibos válidos y sin campos inesperados, denegaciones, errores, ausencia de reintentos, duplicados y respuestas tardías después de cerrar el acceso.
- **170 comprobaciones SQL en memoria** y **11 tests de datos** correctos. Sin nuevas migraciones, permisos o cambios en las reglas de T08.
- **150 pruebas UI** correctas en Edge headless: 39 del editor y 111 de regresión T09–T12 en escritorio/tableta/móvil. Se verificaron crear/editar/limpiar una posición, UUID/versión exactos, título/tipo como mínimo, precio cero/USD, decimales inválidos sin petición, errores de campos en desplegables, borradores ropa/objeto, calzado, imagen URL, guardado duplicado y acceso revocado.
- Un 409 conservó el texto y bloqueó el reenvío hasta consultar/aceptar la versión actual. Una respuesta de creación perdida después de confirmar en el transporte de prueba no produjo otra alta; revisar y cargar mostró lo ya guardado. El 429 esperó `Retry-After` y exigió un nuevo clic.
- Cancelar una limpieza no envió petición; confirmar eliminó solo la posición elegida. Salir/Cancelar y Atrás con cambios pidieron confirmación, manteniendo los datos si se cancela. Revalidar al recuperar foco no desmontó el editor ni perdió el borrador.
- Axe sin violaciones A/AA detectadas en el formulario. Reflujo a 320 px, texto al 200 %, movimiento reducido y capturas de las tres resoluciones revisados. Tras incorporar la imagen guardada a la comparación se repitieron nueve escenarios de revisión/accesibilidad y tres capturas desde el inicio de página.
- TypeScript, build y `git diff --check` correctos. Vite avisa de una entrada minificada mayor de 500 KB; entrada y módulo compartido inicial suman aproximadamente **170,46 KB gzip**, dentro del objetivo JS de 200 KB del plan. El editor se carga en su propio chunk. No son mediciones de LCP/CLS y no se aumentó el umbral de aviso para ocultarlo.

Docker no tenía un daemon accesible. La prueba del formulario usó transporte estatal aislado, credenciales ficticias y PostgreSQL temporal para lecturas; **no se comprobó este recorrido completo contra Edge/Docker real**. Los fixtures de deseos no se insertaron en los once participantes. No se modificaron `.env.local`, credenciales, cuentas Auth, datos reales, funciones desplegadas ni la base remota. Las instrucciones de ensayo local están en [editor de regalos](gift-editor.md); subir archivos e importar tiendas siguen en T14/T16/T17.

## T14: carga, asociación y limpieza (2026-10-27)

- **58 pruebas unitarias**, **201 aserciones SQL** tanto en PostgreSQL embebido como en Supabase local, y **11 pruebas de datos** correctas.
- Ensayo real de `media-upload` en Edge Runtime 1.77.8/Deno 2.1.4, Storage y PostgreSQL 17: autorización y acceso cruzado, MIME falso, JPEG/PNG/WebP de 16 MP, PNG RGBA16, salida WebP de 1200 px, avatar sin ampliación, lectura pública y asociación autorizada.
- **Recorrido real de navegador** con Vite aislado en 5175: enlace efímero local, subir PNG sin guardar el regalo, guardar y reemplazar por JPEG; se comprobó la ruta/versión/estado en SQL. Archivo anterior conservado hasta confirmar. Sin transportes simulados en este ensayo. Navegador, Vite, participante y objetos de prueba retirados al terminar.
- Limpieza real por Storage API de objetos propios de la prueba; referencia vigente protegida, confirmación rechazada antes del borrado, reintento y huérfano tras eliminar al participante. Dos conexiones reales probaron ambos órdenes entre asociación y reclamación. Reservas revocadas durante la subida no se pueden completar.
- Lint SQL local sin errores/advertencias y asesores locales sin incidencias de nivel warn/error. TypeScript y build correctos. Vite conserva el aviso de chunk mayor de 500 KB; no se cambió su umbral. El WASM solo se incluye en la función, no en el frontend.
- Nuevos escenarios UI: archivo pendiente hasta guardar, preview, fallo sin reemplazar la imagen anterior, archivo falso sin solicitud, guardado bloqueado durante subida, descarte/cancelación y revocación. Axe WCAG A/AA y reflujo a 320 px. Capturas en `artifacts/ui/media-*.png`.
- **162 pruebas UI correctas en la ejecución final completa**, sin reintentos automáticos. Una primera ejecución encontró consultas duplicadas por recarga; una segunda se interrumpió para investigar otra pérdida del acceso tras recarga de desarrollo. Las trazas mostraron reconexiones de Vite. Se aislaron las cachés de los servidores de ensayo y se incluyeron las dependencias de rutas diferidas en la optimización inicial; después pasaron el recorrido real y los 162 casos completos. Se conservó la regla de borrar credenciales al recargar.

Se aplicaron solamente las dos migraciones nuevas al contenedor local, sin reset ni seed. La simulación de limpieza general no encontró candidatos; no se ejecutó su modo de borrado general. HTTP y concurrencia limpiaron únicamente sus datos efímeros. Sin cambios en `.env.local`, cuentas Auth, los once participantes reales, proyectos vinculados o producción. Detalles y límites de medición: [T14](media-upload.md).

## T15: cuotas atómicas (2026-10-28, America/Lima)

- **66 pruebas unitarias**, **234 aserciones SQL** en PostgreSQL embebido y en Supabase local, **11 pruebas de datos** y **168 casos UI** completos, sin reintentos automáticos.
- Estado compartido y ámbitos/ventanas separados, cuota exacta, saturación del contador máximo, límites por minuto/hora y espera mayor cuando coinciden. Intentos rechazados cuentan; denegaciones globales no crean filas por cada token inventado.
- Dos procesos Node independientes contra Edge/Deno real compitieron por la última carga de la hora. Solo uno obtuvo 201; el otro recibió 429/Retry-After y no creó otra reserva. Cambiar `X-Forwarded-For`, `X-Real-IP` y `CF-Connecting-IP` no evitó la cuota en modo local. OPTIONS no se bloqueó y la credencial mantuvo permiso de acceso.
- Dos conexiones PostgreSQL demostraron espera por el mismo contador y una sola última admisión en ventanas de minuto/hora. Otra carrera comprobó que la limpieza con SKIP LOCKED termina sin esperar ni retirar las filas bloqueadas. La simulación y el borrado SQL de prueba comprobaron tamaño de lote, preservación de ventanas activas y mantenimiento automático.
- En navegador, un 429 con espera de 2400 segundos mostró cuarenta minutos y desactivó solamente la selección de otro archivo. El texto se conservó y pudo guardarse el regalo sin imagen. Al vencer una espera corta se habilitó el reintento, sin enviar una segunda subida automáticamente.
- Pasaron HTTP y concurrencia de acceso, mutaciones e imágenes ya existentes, además de la subida/reemplazo del formulario real contra Edge/Storage/PostgreSQL locales. Se retiraron los participantes y objetos efímeros de esas pruebas.
- TypeScript, compilación, lint y asesores SQL locales correctos. Se conserva el aviso previo de chunk de Vite mayor de 500 KB, sin subir el umbral. No se añadieron paquetes, infraestructura ni cuentas Auth.

Se aplicaron exclusivamente `20261029035631_atomic_rate_limits.sql` y `20261029040501_quota_retry_and_saturation.sql` al contenedor local. Sus marcas de tiempo de la CLI son UTC. La simulación final de mantenimiento encontró cero candidatos. El comando general en modo `--apply` no se ejecutó; la limpieza se probó en SQL y concurrencia sobre ventanas vencidas, sin datos de participantes. No hubo reset, seed, vinculación, despliegue ni operación sobre la instancia remota. La IP como identidad continúa desactivada hasta verificar el contrato del proveedor; este fallback está previsto en el plan. Ver [T15](rate-limits.md).

## T16: transporte seguro y parser (2026-10-29, America/Lima)

- **84 pruebas unitarias**, **246 aserciones SQL** tanto en PostgreSQL embebido como en Supabase local, **11 pruebas de datos** y regresión completa de **168 casos UI** correctas. La UI de importación se implementará en T17; esta suite comprueba las pantallas existentes.
- Sondeo aislado de Edge Runtime 1.77.8/Deno 2.1.4, sin red externa: `node:https` no implementa `ClientRequest.options.lookup`; fetch fijado a IP comprueba el certificado contra esa IP aunque Host sea el dominio. Las primitivas TCP existen. Esta evidencia justifica la alternativa Node prevista en el plan, sin afirmar que se verificó un despliegue alojado.
- Transporte Node con TLS real sintético: Host/SNI del dominio, CA explícita de test, rechazo de otro hostname y ausencia de credenciales privadas en la tienda. Bloqueo de IP privadas/especiales/mapeadas y DNS mixto antes de conectar; redirecciones comprobadas en cada salto, cuarta redirección rechazada, pin conservado frente a rebinding, gzip expandido y respuesta por chunks acotados, contenido incompatible y aborto de operaciones detenidas.
- Parser con fixtures de Product/Offer, arrays/@graph, Open Graph, entidades y enlaces relativos; preferencia de fuentes y longitudes; precios ambiguos, AggregateOffer, múltiples ofertas/productos y moneda ausente sin inventar PEN. Scripts malformados/profundos/grandes y captcha/datos dinámicos conducen a resultados parciales o edición manual. No se siguen contextos remotos ni se ejecuta JavaScript.
- Recorrido completo con Edge/Deno real, Node protegido, tienda TLS sintética y PostgreSQL local: autorización del propietario, campos/fuentes y USD conservado; participante ajeno denegado antes del transporte, replay rechazado, DNS mixto sin conexión, 403/captcha como alternativa manual y 429 antes de descargar. Ningún regalo se creó o modificó. El conector de la tienda se sustituye solo en el test; el adaptador desplegable usa el transporte real.
- Dos conexiones SQL comprobaron consumo único del nonce y rechazo de uno vencido después de esperar un bloqueo. RPC y tabla privadas sin permisos de clientes, URL vinculada al nonce, TTL máximo y revocación comprobados en SQL. HMAC separado por propósito, firma de respuesta, clave ausente/incorrecta y respuesta tardía tras revocación cubiertos por pruebas unitarias.
- TypeScript, build, lint SQL y asesores locales correctos. Continúa la advertencia previa de Vite por chunk mayor de 500 KB, sin modificar su umbral; no se añaden parsers al JavaScript del navegador. `htmlparser2` 12.0.0 e `ipaddr.js` 2.5.0 fijados en el lockfile.

El runner completo espera explícitamente a que el worker responda sin credencial con 401 antes de iniciar los casos; las primeras ejecuciones encontraron 503 transitorios del arranque y se corrigió esa condición de preparación. No se reintentan solicitudes de importación. La prueba retira sus participantes, secreto/archivo de entorno efímeros, proxy y runtime; no reemplaza un servidor de funciones ya abierto. La comprobación final no encontró esos servidores de ensayo activos.

Se aplicó solo `20261029043751_protected_product_import.sql` al contenedor local, sin reset ni seed. Sin cambios en `.env.local` del usuario, sus once participantes, cuentas Auth, proyecto vinculado o instancia remota. No se desplegó el adaptador Node ni se promete compatibilidad con tiendas en vivo. Decisión técnica, archivos, configuración y comandos manuales: [T16](product-import.md).

## T17: vista previa y aplicación selectiva (2026-10-29, America/Lima)

- **92 pruebas unitarias** correctas: contrato del cliente acotado, cabecera privada, errores sin detalles internos ni reintentos, respuesta grande o detenida, propiedad/rol, duplicados, cierre/reemplazo y respuesta antigua. Selección inicial sin reemplazar datos existentes, imagen subida, tipo activo, detalles personales, USD/PEN, moneda ausente con confirmación y precio cero.
- **207 casos UI correctos en la ejecución final completa**, incluidos **39 nuevos de T17** en escritorio/tableta/móvil. Se comprobaron consulta solo al pulsar, fuentes, selección por campo, aplicación sin persistencia, guardar después de editar, cancelación, cambio durante/después de la consulta, alternativa manual, 429 de cuarenta minutos, vencimiento sin reintento, moneda ausente, ropa/calzado, denegación, cierre y descarte tardío. Comando final: `npm.cmd run test:ui -- --workers=2`, sin reintentos automáticos, 207/207 en 3,4 minutos.
- Axe sin violaciones detectadas de las reglas WCAG A/AA seleccionadas en la vista previa. Teclado/Enter/Espacio y foco inicial comprobados; HTML malicioso de fixture mostrado como texto, sin etiquetas ejecutables. Reflujo de 320 px con texto al 200 % comprobado en las tres resoluciones. Capturas en `artifacts/ui/import-*.png`; la validación automática no sustituye lectores de pantalla u otros motores de T21.
- **Recorrido real de navegador→Edge/Deno→Node→TLS→parser→SQL**: consultar y aplicar dejaron cero regalos en PostgreSQL; solo Guardar creó la opción con título revisado, importe 29.90, USD y URL originales. El ensayo no intercepta las API de autorización/importación/guardado; únicamente la tienda utiliza un conector TLS sintético de test. Se conservaron las comprobaciones T16 de pertenencia, replay, DNS mixto sin conexión, 403/captcha y cuotas antes del transporte.
- TypeScript y build correctos, sin paquetes nuevos. Bundle principal 165,22 KB gzip más módulo compartido inicial 8,17 KB gzip: **173,39 KB gzip**, dentro del objetivo JS de 200 KB. Se conserva el aviso previo por chunk minificado mayor de 500 KB, sin subir su umbral. La búsqueda del bundle no encontró el transporte Node, el secreto HMAC ni `htmlparser2`. No se midieron LCP/CLS en esta iteración.

La comprobación de reflujo encontró inicialmente desbordamiento en título/panel de sugerencias y cabecera con texto ampliado; se corrigieron el tamaño mínimo de la cuadrícula, el ajuste del título/botones y el salto de línea de la cabecera. Después pasaron las tres resoluciones. Una primera regresión completa pasó 206/207; la traza del caso del organizador restante mostró varias navegaciones completas y reconexiones de Vite, que borraron correctamente la credencial. Se separó la caché del servidor automatizado y se desactivaron watcher/HMR exclusivamente en los ensayos; el caso pasó tres veces seguidas. La recarga manual conserva su regla de borrar permisos y el desarrollo normal mantiene HMR.

La siguiente regresión encontró una carrera independiente en el selector de imágenes tras 429: solo activar la espera desde un efecto permitía una habilitación transitoria al terminar la subida; una selección en ese instante se rechazaba internamente y no mostraba preview. Se publica ahora el bloqueo junto con el error, antes de liberar el formulario. La prueba espera el mensaje de cuota y usa una ventana de dos segundos para distinguir la espera real de la subida pendiente. Pasaron dos repeticiones en cada resolución (seis casos) y la regresión final completa, comprobando el reintento explícito sin nuevas solicitudes automáticas.

El primer ensayo real encontró Docker apagado; se inició la pila local con volúmenes existentes, sin reset ni seed. El runner espera además a que `wishlist-api` responda 401 sin credencial antes de abrir el enlace efímero; se evita confundir el arranque del worker con una denegación. No se reintentan importaciones. La limpieza retira los archivos de entorno temporales incluso si Docker no permite verificar SQL.

No hay cambios de SQL, RLS o contratos de las Edge Functions ni nuevas migraciones. Los datos efímeros de cada ensayo se retiraron; se verificó cero participantes con sus prefijos reservados y ningún runtime/proxy/Vite del ensayo real activo. Se conserva la pila base local. No se tocaron `.env.local` del usuario, el roster, enlaces permanentes, cuentas Auth o la instancia remota. La compatibilidad con tiendas en vivo y Vercel alojado no se declara probada. Archivos y comandos: [guía T17](product-import-ui.md).
