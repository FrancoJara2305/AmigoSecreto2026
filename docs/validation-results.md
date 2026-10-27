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
