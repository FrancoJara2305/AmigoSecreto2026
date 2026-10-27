# Avance del plan

Trabajo autorizado por iteraciones. Todo el trabajo aplicado hasta ahora se limita al entorno local; la instancia remota sigue pendiente de revisión y aprobación.

| Tarea | Estado real |
| --- | --- |
| T00 | Plan revisado y continuación autorizada por el usuario para las iteraciones locales. |
| T01 | Pendiente: prueba de transporte SSRF y procesamiento binario en Edge. No bloquea el seed. |
| T02 | Parcial: React, TypeScript y Vite preparados; Tailwind y rutas todavía pendientes. |
| T03 | Parcial: tipos y configuración pública; faltan validadores de formularios de regalos. |
| T04 | Completa: esquema, relaciones, restricciones e índices probados localmente. |
| T05 | Grants, RLS y bucket completos; RPC de acceso de T07 lista. Las RPC de edición llegarán en T08. |
| **T06** | **Completa:** seed reproducible de 11 personas y 18 regalos, aplicado y probado en Supabase local. |
| **T07** | **Completa en local:** tokens, bootstrap, validación, pertenencia, emisión, revocación, rotación y recuperación, con pruebas SQL/HTTP/concurrencia. |
| T08 | Siguiente bloque: mutaciones transaccionales de perfil y regalos con control de versión. |
| T09–T25 | Pendientes. El catálogo y diseño visual corresponden a T09–T11. Cuotas mínimas de acceso adelantadas de T15; T15 no está completa. |

## T06: resultado verificable

- `supabase/seed.sql` y `npm run seed:local`, sin nuevas dependencias ni migraciones.
- UUIDs estables, carga transaccional y sin sobrescrituras. Seed automático desactivado en CLI.
- Dos listas vacías, tres con una opción, tres con dos y tres completas. Los números indican opciones, no prioridad.
- Prendas, objetos y calzado; PEN por defecto y un precio USD de ejemplo; imágenes/enlaces opcionales sin dependencias de tiendas externas.
- Sin usuarios Auth, enlaces privados, hashes de tokens, cambios del evento ni subidas a Storage.
- Seis pruebas automatizadas: cobertura, repetibilidad preservando ediciones, bloqueo sin marcador local, rechazo de participantes ajenos, rechazo de identidades conflictivas y contrato SQL después de cargar demo.
- Aplicación en el contenedor local: `INSERT 0 11`, `INSERT 0 18`, COMMIT. Después pasó el contrato completo de 90 comprobaciones con ROLLBACK.

La pantalla React sigue siendo preparatoria. Estos datos se consultarán desde la interfaz cuando se implementen las tareas visuales; se pueden revisar ahora en Studio local.

## T07: resultado verificable

Ver [guía de enlaces privados](private-access.md). Una nueva migración añade helpers privados y una RPC exclusivamente para el backend. Tokens canónicos de 256 bits, hashes SHA-256, scopes por participante y revocación/expiración verificadas en servidor. Bootstrap/recuperación solo desde el contenedor local, sin exponer un endpoint de mantenimiento.

127 aserciones SQL pasan en PostgreSQL embebido y Supabase local. Conexiones separadas verificaron bloqueo/revocación, y Edge/Deno real validó acceso, pertenencia, denegaciones y revocación por HTTP. Lint y asesores locales sin problemas reportados. No se generó un enlace permanente del usuario en la conversación ni se tocaron recursos remotos.
