# T15: cuotas atómicas y mantenimiento

Iteración del **28 de octubre de 2026, America/Lima**. Implementación y validación únicamente locales. Las marcas de tiempo de las migraciones se generaron con la CLI en UTC. No se vinculó, consultó ni modificó la instancia remota y no se desplegaron funciones.

## Políticas activas

Se mantienen los límites iniciales de T07/T08 y el límite de ráfaga de T14. T15 añade la cuota horaria de imágenes propuesta en el plan, límites de entrada y mantenimiento compartido. Se cuentan intentos, incluidos los que terminan rechazados. Las ventanas son fijas y se alinean con UTC; no son ventanas móviles y pueden permitir una ráfaga a ambos lados de un cambio de ventana.

| Operación | Global/minuto | Por token/minuto | Por token/hora |
| --- | --- | --- | --- |
| Validación y ciclo de enlaces | 120 | 30 | — |
| Edición de perfil/regalos | 240 | 60 | — |
| Reserva de subida | 120 | 6 | **10** |
| Importación, operación autorizada T16 | 60 | 5 | 30 |

T16 invoca estas cuotas dentro de una operación autorizada antes de conectar con una tienda. La configuración predeterminada sin transporte falla cerrada; la selección de sugerencias en la interfaz sigue en T17. Ver [importación de productos](product-import.md).

Los POST que llegan a `wishlist-api` y `media-upload` comparten además un límite de entrada de **600/minuto**, anterior a la lectura del cuerpo. Si hay una identidad de red verificada, se aplican 120 POST/minuto por esa identidad. Veinte respuestas 401/403 por minuto bloquean temporalmente esa red. Sin identidad verificable, se ignoran las cabeceras IP y se aplica la barrera global de 120 fallos/minuto. Una cuota de imágenes no revoca el enlace ni impide editar otros datos.

OPTIONS y orígenes rechazados por CORS no ejecutan cuotas ni lógica de negocio. Los límites anteriores no se aplican a las lecturas públicas directas del catálogo o a las imágenes públicas de Storage.

## Estado compartido y autorización

`private.rate_limits` incorpora `scope` y `window_seconds`. La clave única distingue hash, operación, ámbito, duración e inicio de ventana. El estado anterior se conserva: las claves cero globales se clasifican como globales y los demás contadores existentes como contadores de token por minuto.

`private.consume_quota` usa INSERT/ON CONFLICT y el bloqueo de fila de PostgreSQL. No hay contadores en memoria, Redis ni dependencia de un isolate concreto. Los contadores se saturan en límite + 1, incluso si una fila anterior contiene el entero máximo. Después de una espera por bloqueo se vuelve a comprobar la ventana vigente. El orden de bloqueo es global → token/minuto → token/hora → autorización. Rechazar por cuota global evita crear filas nuevas por cada hash inventado.

Las tres RPC existentes conservan sus firmas. La cuota de negocio se consume dentro de su transacción y fuera del bloque que captura errores de autorización, de modo que los intentos fallidos cuentan. Se conserva la validación de credenciales, pertenencia, revocación, expiración y versiones de T07/T08/T14. La nueva barrera HTTP es una protección adicional y no sustituye esa autorización.

Una denegación devuelve 429, `Retry-After` con segundos restantes y respuesta `no-store`. Cuando coinciden las ventanas de minuto y hora se devuelve la espera más larga. El navegador admite esperas de hasta 3600 segundos, conserva el borrador y bloquea el selector de archivos durante la espera. No vuelve a subir automáticamente al terminarla; exige una nueva selección. Los demás campos y el guardado sin otra imagen siguen disponibles.

Todos los helpers y RPC nuevas son SECURITY INVOKER, tienen `search_path` fijo y EXECUTE restringido a `service_role`. `anon` y `authenticated` no pueden elegir identidades, consumir directamente las RPC privilegiadas ni limpiar contadores. El esquema privado continúa con RLS. Los logs de aplicación contienen únicamente id generado de solicitud, endpoint, estado y duración; no incluyen tokens, hashes, IP, cuerpos ni URLs recibidas.

## Identidad de red: desactivada hasta verificar el proveedor

El ejemplo utiliza:

```dotenv
RATE_LIMIT_IP_SOURCE=off
RATE_LIMIT_HMAC_SECRET=REPLACE_WITH_RANDOM_SERVER_SECRET
```

Con `off`, el secreto de ejemplo no se usa y **ninguna** de `X-Forwarded-For`, `X-Real-IP` o `CF-Connecting-IP` se considera identidad fiable, aunque un cliente las envíe. Las cuotas globales y por token siguen operativas. Se probó por HTTP que cambiar esas cabeceras no evita la cuota.

El módulo admite `verified-cloudflare` para una futura instalación cuyo propietario haya comprobado que el proveedor elimina/sobrescribe `CF-Connecting-IP` en **todas** las rutas de entrada, incluidos dominios propios y rutas alternativas. El nombre del modo es una afirmación explícita de esa verificación, no una detección automática ni una garantía ofrecida por esta implementación. **No se habilitó ese modo ni se hicieron sondeos de producción en esta iteración.**

En ese modo se exige un secreto aleatorio de 32 bytes en base64url canónico, idéntico en ambas funciones y exclusivamente de servidor. Se normalizan IPv4, IPv6 y direcciones IPv4 mapeadas; HMAC-SHA-256 con separación de dominio produce la clave almacenada. Las IP no se guardan. Cabeceras duplicadas, listas, puertos o valores inválidos caen al límite global, sin intentar otra cabecera. Un modo desconocido o secreto mal configurado falla cerrado con 503. Rotar el secreto cambiará las claves de red hasta que venzan sus ventanas; no cambia los hashes de tokens ni evita el límite global.

La [documentación de seguridad de Supabase](https://supabase.com/docs/guides/api/securing-your-api) muestra cómo consultar cabeceras, pero esa lectura no demuestra por sí sola la confianza de cada ruta desplegada. La [documentación de Cloudflare](https://developers.cloudflare.com/fundamentals/reference/http-headers/) describe particularidades de cabeceras y Workers. Por ello se conserva aquí el fallback global expresamente previsto en el plan, sin asumir un contrato de proxy no verificado ni añadir infraestructura nueva.

## Limpieza acotada

La entrada a una nueva ventana global, y cada veinticinco intentos globales admitidos, retira hasta **100** ventanas vencidas mediante el índice de expiración y `FOR UPDATE SKIP LOCKED`. No espera por las filas que utiliza otra transacción y no borra ventanas activas. Los intentos ya rechazados por el límite global no disparan repetidamente ese mantenimiento.

La RPC de mantenimiento permite lotes entre 1 y 5000, con simulación por defecto. El comando preparado fija un máximo de **1000**, Docker local y PostgreSQL dentro del contenedor conocido; no admite URL, proyecto remoto ni credenciales como argumentos:

```powershell
npm.cmd run cleanup:rates:local
# Tras revisar la simulación, elimina únicamente ventanas vencidas LOCALES:
npm.cmd run cleanup:rates:local -- --apply
```

Un lote lleno puede requerir repetir el comando. Las pruebas SQL hacen rollback y verifican simulación, tamaño de lote, conservación de ventanas horarias y eliminación automática. La prueba con dos conexiones comprueba además que el mantenimiento omite las filas bloqueadas. No se ha configurado cron ni un endpoint público de limpieza. La limpieza de archivos de T14 es una operación distinta y conserva su propio comando.

## Archivos de T15

| Archivos | Cambio |
| --- | --- |
| `supabase/migrations/20261029035631_atomic_rate_limits.sql` | Ámbitos/duraciones, helpers compartidos, límites de entrada y limpieza, adaptación explícita de las RPC existentes. |
| `supabase/migrations/20261029040501_quota_retry_and_saturation.sql` | Saturación segura y espera más larga al coincidir cuotas de minuto/hora. |
| `supabase/functions/_shared/rate-limit.ts`, `server-rpc.ts` | Barrera HTTP, normalización/HMAC, respuesta segura, logs mínimos y transporte de RPC de servidor. |
| `wishlist-api/index.ts`, `media-upload/index.ts`, `_shared/access-handler.ts`, `_shared/media-handler.ts`, `.env.example` dentro de `supabase/functions/` | Integración obligatoria de la barrera y propagación de la espera. |
| `src/domain/retry-after.ts`, servicios de acceso/mutaciones/subida, `useGiftEditor.ts`, `GiftImageField.tsx`, `GiftEditor.tsx` | Esperas de hasta una hora y reintento explícito sin perder el borrador. |
| `supabase/tests/database/005_rate_limits.sql`, ajuste de `002_access.sql` | Contrato de cuotas, permisos, expiración y nueva clave compuesta. |
| `tests/unit/rate-limit.test.ts`, `tests/ui/media-upload.spec.ts`, fixture del editor | HMAC, cabeceras falsas, fallos cerrados, espera horaria y habilitación tras cooldown. |
| `scripts/test-rate-limits-http.mjs`, `test-rate-limits-concurrency.mjs`, `cleanup-rate-limits-local.mjs` | Dos procesos HTTP, dos conexiones PostgreSQL y mantenimiento local. |
| `package.json`, README y documentación de avance/validación | Comandos y resultados. No se añadieron dependencias. |

## Reproducir las comprobaciones

Las dos migraciones ya se aplicaron exclusivamente al contenedor local. En otro entorno local revisado:

```powershell
npm.cmd run supabase -- migration up --local
npm.cmd test
npm.cmd run test:db:local
npm.cmd run supabase -- db lint --local --schema public,private --level warning --fail-on warning
npm.cmd run supabase -- db advisors --local --type all --level warn --fail-on warn
```

Mantén las funciones locales en otra terminal:

```powershell
npm.cmd run functions:local
```

```powershell
npm.cmd run test:rates:http
npm.cmd run test:rates:concurrency
npm.cmd run test:media:http
npm.cmd run test:media:ui:local
npm.cmd run test:ui
npm.cmd run build
```

Los ejecutores HTTP y de concurrencia solo aceptan el destino local, generan identidades de prueba efímeras y retiran sus archivos/participantes al terminar. No insertan regalos ni cambian los once participantes existentes. Las pruebas de red usan el modo seguro `off`; la extracción HMAC de un proveedor verificado se prueba como módulo aislado, sin afirmar que se haya validado la red de la instancia alojada.

Resultado de esta iteración: **66 pruebas unitarias, 234 aserciones SQL en memoria y Docker, 11 pruebas de datos y 168 pruebas UI completas**. Pasaron las carreras de minuto/hora, dos procesos HTTP por la última carga horaria y los flujos de acceso, edición, imágenes y formulario real. Lint/asesores locales no reportaron incidencias. La compilación pasó y conserva el aviso de tamaño de chunk de T13/T14. La simulación de mantenimiento terminó sin candidatos; el comando general `--apply` no se ejecutó.

Referencias primarias: [ON CONFLICT de PostgreSQL 17](https://www.postgresql.org/docs/17/sql-insert.html), [SKIP LOCKED](https://www.postgresql.org/docs/17/sql-select.html) y [cuotas en Edge Functions](https://supabase.com/docs/guides/functions/examples/rate-limiting). El plan usa PostgreSQL ya disponible y no requiere el servicio Redis que aparece en ese ejemplo general de Supabase.
