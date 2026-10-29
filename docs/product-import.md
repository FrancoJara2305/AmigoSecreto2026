# T16: transporte seguro y parser de productos

Implementado y validado **solo en local**. No se consultó la instancia alojada, no se vincularon proyectos ni se desplegaron funciones. La vista previa con selección de campos y su integración con el editor siguen en **T17**. T16 devuelve sugerencias y nunca guarda regalos.

## Decisión de transporte: parte pendiente de T01

Se ejecutó un user worker de **supabase-edge-runtime 1.77.8 / Deno 2.1.4**, con 256 MB y límite duro de CPU de 2000 ms, dentro de un contenedor desechable con `--network none`. La prueba utiliza una CA y un servidor TLS sintéticos, generados en `artifacts/`, sin modificar el almacén de certificados del sistema. No tiene una ruta dentro de las funciones del proyecto ni acepta destinos del usuario.

Resultados reproducibles:

- Las primitivas TCP existen; no se afirma que todo acceso de bajo nivel esté prohibido.
- `node:https` lanzó **`Not implemented: ClientRequest.options.lookup`**, sin invocar el resolver proporcionado.
- `fetch` con URL de IP y `Host` del dominio rechazó el certificado DNS correcto para el dominio porque estaba comprobando el nombre **127.0.0.1** de la URL. Cambiar `Host` no fija el nombre TLS.
- No se demostró un cliente HTTP de Edge que fijara la conexión y preservara la comprobación del hostname con esas APIs. Se evita construir un parser HTTP/TLS propio sobre TCP.

Se activa por ello la alternativa condicional que ya contemplaba la sección 9.4 del plan: **una única función Node en Vercel para descargar**, conservando autorización, cuotas y parsing en Supabase. La decisión también quedó registrada en `implementation_plan.md`. La prueba de red pendiente de T01 queda resuelta mediante este transporte alternativo demostrado en Node local; no es una prueba de un despliegue en Vercel ni de tiendas en vivo.

El comando siguiente reproduce el sondeo y guarda el resultado en `artifacts/edge-network-probe.json`:

```powershell
npm.cmd run probe:edge:network
```

Requiere Docker y OpenSSL. En Windows se usa el OpenSSL incluido en Git; en Linux se busca `openssl` en PATH. Los certificados son exclusivamente de prueba, no se versionan y no se instalan como confianza global. Referencias: [Deno HttpClient](https://docs.deno.com/api/deno/fetch/), [límites de Supabase Edge](https://supabase.com/docs/guides/functions/limits) y [HTTPS de Node](https://nodejs.org/api/https.html).

## Frontera entre Supabase y Node

`product-metadata` se sirve en local con `verify_jwt=false`, como los otros endpoints de capacidades privadas. Un POST de importación exige `X-Edit-Token` y únicamente `{ participant_id, url }`. Tiene CORS exacto, cuerpo máximo de 4096 bytes, cuota persistente de entrada de T15 y respuestas `no-store`. Una configuración ausente o de ejemplo falla cerrada con 503; no se sustituye el transporte por un `fetch` sin fijación.

1. La Edge Function valida formato y URL, genera un nonce aleatorio de 256 bits y solicita `server_prepare_import`.
2. PostgreSQL consume las cuotas de importación de T15 y comprueba token, propietario, revocación y expiración. Registra solamente hashes de nonce/URL, participante, token interno y vencimiento corto.
3. Edge envía a Node una solicitud HMAC con URL canónica, nonce y vencimiento de unos treinta segundos. **No envía token personal, participante, cookies, Authorization ni clave de Supabase.**
4. Antes de resolver DNS, Node solicita consumir la reserva mediante un callback HMAC a la misma Edge Function. El dominio de firma del callback es distinto al de la solicitud original. `server_claim_import` comprueba otra vez acceso y vencimiento, bloquea la reserva y permite **una sola** descarga, entre distintas instancias.
5. Node descarga bytes HTML acotados y firma el resultado. Edge comprueba firma y nonce, decodifica y extrae campos. Antes de entregar un resultado válido, vuelve a comprobar el enlace para descartar respuestas tardías tras revocación.

`private.import_requests` tiene RLS, claves foráneas e índices para vencimiento/propietario/token. Las RPC son SECURITY INVOKER, con `search_path` fijo y EXECUTE solo para `service_role`. `anon` y `authenticated` no pueden crear ni consumir reservas directamente. El callback acepta únicamente una prueba HMAC válida y vigente; una clave pública o un token personal no lo autorizan. Las reservas vencidas se retiran en lotes de hasta cien al preparar nuevas solicitudes. No se usa un caché en memoria para impedir replay.

El secreto `FETCH_PROXY_HMAC_SECRET` debe ser aleatorio, de 32 bytes codificados en base64url, idéntico en ambos servidores y distinto del secreto de red de T15. El runtime Node solo necesita ese secreto y la URL fija del callback. El cliente React no necesita ninguno. Una respuesta alterada, vencida, con nonce incorrecto o sin firma se convierte en una salida manual, sin entregar HTML al navegador.

## Protección SSRF y límites

El transporte de producción no ofrece opciones de solicitud para desactivar estas comprobaciones. Sus dependencias de sistema se pueden sustituir en tests controlados; el adaptador de despliegue usa las implementaciones reales.

- HTTPS, puerto 443, URL de hasta 2048 caracteres, sin userinfo, IP literal, hostname local o protocolo alternativo. Se comprueba también la forma canónica de direcciones numéricas, octales y hexadecimales que normaliza WHATWG URL.
- Resolución A y AAAA antes de cada salto. Se rechaza si no hay resultados, hay demasiados o **alguna** dirección no es global. Incluye IPv4 mapeada en IPv6, redes privadas, CGNAT, link-local, metadatos de nube, multicast, documentación, rangos reservados y de transición. Se añaden explícitamente la IPv6 6bone retirada y la dirección virtual de Azure. La política es conservadora con rangos especiales; no es una promesa de admitir todo bloque que algún proveedor pudiera enrutar.
- `https.request` usa un resolver que devuelve exclusivamente la IP ya comprobada y una familia fija. SNI, Host y validación del certificado mantienen el hostname original. Se comprueba además la dirección remota. No se comparte un agente ni se hace una segunda resolución DNS al abrir la conexión.
- Redirecciones manuales: máximo tres, con la misma validación y resolución completas en cada destino. No se copian cookies ni cabeceras del solicitante a las tiendas.
- Un único plazo de **8 segundos** abarca DNS y descarga de todos los saltos. Se cancela el resolver y las conexiones al vencerlo; no se reinicia el plazo en cada redirección. La ida al callback tiene su propio límite breve y la solicitud al transporte está acotada.
- Solo HTML/XHTML. Cabeceras y bytes comprimidos están limitados; se leen hasta **1 MiB descomprimido**, abortando el stream al superarlo. Se admiten gzip, Brotli y deflate individuales. No se confía únicamente en Content-Length ni se ejecutan scripts.

Una respuesta 403, captcha, contenido dinámico sin datos, timeout, formato no compatible, DNS prohibido o exceso de límites devuelve una alternativa manual. No se utilizan navegadores de scraping, evasión antibot ni descargas automáticas de imágenes. Las imágenes relativas sugeridas se resuelven contra la URL final comprobada; no se obedece `<base>` para cambiarlas a otro origen local.

Las pruebas TLS reales usaron sockets a un servidor de loopback con un certificado DNS: verificaron Host/SNI, rechazo de otro hostname, ausencia de cabeceras privadas, expansión gzip, respuesta por chunks y aborto. La política de IP se prueba por separado con contadores que demuestran cero conexiones ante DNS mixto o destinos prohibidos. En el ensayo completo se sustituye exclusivamente el conector de test para llegar a esa tienda sintética; el adaptador desplegable no contiene esa sustitución.

Referencias: [prevención SSRF de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), [registro IPv4 de IANA](https://www.iana.org/assignments/iana-ipv4-special-registry/) y [ipaddr.js](https://github.com/whitequark/ipaddr.js).

## Parser y contrato de sugerencias

Se usa `htmlparser2` **12.0.0**, exclusivamente de servidor; la clasificación de direcciones usa `ipaddr.js` **2.5.0** en Node. Ambas versiones y sus integridades están fijadas en package-lock. No se incorporan esos parsers al bundle del navegador.

La prioridad de extracción es JSON-LD Product/Offer → Open Graph y etiquetas de precio → metadatos estándar/título. Se admiten arrays y `@graph`, sin seguir `@context` remoto. Se normalizan entidades, espacios y longitudes a texto. JSON-LD tiene un presupuesto conjunto de 128 KiB, dieciséis scripts, profundidad y número de nodos limitados; las páginas también tienen un límite de etiquetas.

AggregateOffer, varias ofertas/variantes o varios productos **no generan un precio exacto inventado**. Un precio con separadores ambiguos se omite. No se convierte moneda ni se completa PEN cuando falta moneda. Marca/modelo/color/material son sugerencias genéricas; nunca se infieren talla, ajuste ni preferencias personales.

Una respuesta correcta tiene esta forma orientativa:

```json
{
  "status": "partial",
  "metadata": {
    "fields": {"title": "Una taza", "reference_price": "29.90", "currency": "USD"},
    "sources": {"title": "json-ld", "reference_price": "json-ld", "currency": "json-ld"},
    "warnings": ["PARTIAL_METADATA"],
    "final_url": "https://shop.example.com/product"
  }
}
```

`status: manual` incluye un motivo controlado y un mensaje para seguir a mano. No incluye la página HTML, credenciales ni detalles internos del proveedor. Las denegaciones de acceso conservan 401/403; las cuotas devuelven 429 y Retry-After. Ninguna de estas respuestas crea o actualiza un regalo. La aplicación selectiva al borrador será T17.

## Ejecutar y revisar en local

La migración `20261029043751_protected_product_import.sql` ya se aplicó únicamente al contenedor local, sin reset ni seed. Para reproducir sobre otro entorno local revisado:

```powershell
npm.cmd install
npm.cmd run supabase -- migration up --local
npm.cmd test
npm.cmd run test:db:local
npm.cmd run test:import:concurrency
npm.cmd run probe:edge:network
npm.cmd run test:import:local
npm.cmd run build
```

`test:import:local` requiere las funciones locales previamente cerradas. Inicia su propio runtime con configuración y secreto efímeros, un transporte Node protegido y una tienda TLS sintética. Rechaza reemplazar un servidor de funciones ya abierto. Comprueba pertenencia, campos/fuentes, moneda, replay, DNS mixto sin conexión, 403/captcha y cuota antes del transporte. Al terminar detiene el runtime que inició, cierra sus servidores, elimina el archivo de entorno efímero y retira solo sus participantes. No cambia `.env.local` del usuario ni los once participantes existentes. La prueba de concurrencia demuestra un único consumo y rechazo si el nonce vence mientras espera un bloqueo.

Para mantener el backend local ejecutándose con una configuración propia, crea archivos **no versionados** a partir de `supabase/functions/.env.example` y `server/product-fetch/.env.example`, si todavía no existen. Genera una clave local en tu terminal y colócala únicamente en ambos archivos de servidor:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

En `server/product-fetch/.env.local` usa `FETCH_PROXY_CALLBACK_URL=http://127.0.0.1:54321/functions/v1/product-metadata`. En `supabase/functions/.env.local` configura `FETCH_PROXY_URL=http://host.docker.internal:54801/fetch-product`, el mismo secreto y `APP_LOCAL_FETCH_PROXY=1`. Este permiso HTTP se admite solamente en el ensayo local, sin `DENO_DEPLOYMENT_ID`; no debe usarse como configuración alojada.

En terminales separadas:

```powershell
npm.cmd run fetch-proxy:local
```

```powershell
npm.cmd run supabase -- functions serve --env-file supabase/functions/.env.local
```

El proxy de desarrollo escucha temporalmente en el puerto 54801 para que Docker Desktop pueda llegar al host Windows; exige HMAC y reserva de un solo uso antes de cualquier descarga. Ctrl+C lo cierra. `functions:local` sigue usando el ejemplo sin transporte configurado, para fallar cerrado por defecto. La UI actual conserva su edición manual y no muestra todavía la selección de importación de T17.

## Archivos de esta iteración

Validación final: **84 pruebas unitarias, 246 aserciones SQL en memoria y Docker, 11 pruebas de datos y 168 casos UI existentes**, además del sondeo Edge, TLS real sintético, recorrido completo y concurrencia. TypeScript, build, lint y asesores locales correctos; permanece el aviso previo de tamaño de chunk Vite. Ver [resultados y límites](validation-results.md#t16-transporte-seguro-y-parser-2026-10-29-americalima).

| Archivos | Cambio |
| --- | --- |
| `server/product-fetch/ip-policy.ts`, `transport.ts`, `proxy.ts`, `.env.example` | Clasificación de red, HTTPS fijado, streaming acotado y protocolo firmado del transporte Node. |
| `api/fetch-product.ts` | Único adaptador Node/Vercel condicional, usando la [API Web Standard de Vercel](https://vercel.com/docs/functions/runtimes/node-js). No está desplegado. |
| `supabase/functions/_shared/product-url.ts`, `product-parser.ts`, `fetch-protocol.ts`, `product-handler.ts` | Validación, parser, firmas, límites y coordinación autorizada. |
| `product-metadata/index.ts`, su `deno.json`, `_shared/server-rpc.ts`, `_shared/rate-limit.ts`, `functions/deno.json`, `functions/.env.example`, `supabase/config.toml` | Integración local con cuotas y configuración que falla cerrada. |
| `supabase/migrations/20261029043751_protected_product_import.sql`, `supabase/tests/database/006_product_import.sql` | Reservas privadas, RPC de preparación/consumo, permisos y pruebas. |
| `tests/unit/product-parser.test.ts`, `product-transport.test.ts`, `product-handler.test.ts` | Fixtures, SSRF, TLS real, protocolo, fallos y parser. |
| `tests/fixtures/products/`, `tests/fixtures/edge-network-probe/`, `tests/support/tls-fixture.mjs`, `web-server.mjs` | HTML sintético, sondeo aislado y soporte local de pruebas. |
| `scripts/probe-edge-network.mjs`, `test-product-import-local.mjs`, `test-import-concurrency.mjs`, `serve-product-fetch-local.mjs` | Ejecución y comprobaciones reproducibles. |
| `package.json`, `package-lock.json`, `tsconfig.json`, plan, README y documentación de avance/validación | Versiones, comandos, comprobación de tipos del servidor y decisión técnica. |

No se declara compatible ninguna tienda anticipadamente. La revisión de dominios concretos, la configuración alojada y cualquier despliegue siguen requiriendo sus pasos posteriores y aprobación antes de operar sobre recursos remotos.
