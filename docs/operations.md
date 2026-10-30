# Operación local y aceptación

Esta guía usa Windows/CMD o PowerShell y la pila **local**. Para iniciar desde cero sigue [README](../README.md); para variables y transporte consulta [entornos](environment.md). El esquema remoto permanece sin consultar/modificar.

## Arranque y cierre

1. Docker Desktop activo, WSL2 y motor Linux listos. Comprueba `docker version`; conocer `wsl --version` por sí solo no confirma que el daemon esté activo.
2. `npm.cmd run supabase -- start` y `npm.cmd run supabase -- migration up --local`. No usar reset. El seed automático está desactivado.
3. Frontend y Edge en terminales distintas; un tercer proceso para el proxy si habilitaste importación. Usa exactamente el origen configurado, por ejemplo `http://localhost:5173`.
4. Abre el enlace privado conservado. No regeneres accesos en cada arranque. La URL se limpia; el token vive solo en memoria. Recargar/cerrar requiere abrir de nuevo ese enlace.
5. Ctrl+C detiene cada proceso que iniciaste. Para pausar la pila principal usa `npm.cmd run supabase -- stop` desde la raíz; **no** `--no-backup` o `--all`. No borres volúmenes. El stop normal no sustituye el respaldo exportado de [recuperación](backup-recovery.md).

| Servicio | Puerto/origen local |
| --- | --- |
| Frontend persistente / preview predeterminado | 5173; no ejecutarlos juntos en ese puerto |
| API temporal de preview | Puerto del preview + 1; solo lectura en memoria |
| Supabase API / DB / Studio | 54321 / 54322 / 54323 |
| Proxy firmado Node | 54801 |
| UI habitual / seguridad / regresión alternativa | 4173–4174 / 4183–4184 / 4185–4186 |
| Medición de producción | 4193–4194 |
| Pila desechable AdminTest / inspector / UI real | 54421–54422 / 8094 / 5179 |

Si un puerto está ocupado, conserva el proceso existente y usa una pareja libre; actualizar el puerto del frontend también exige revisar APP_BASE_URL, CORS y VITE_APP_URL. Los ejecutores aislados rechazan puertos/proyectos ya ocupados.

## Participantes y enlaces

En un local nuevo, `participants:local` prepara los once nombres con listas vacías; revisa sus [reglas de preservación](catalogue.md). El panel ya permite altas, cambios, fotos, orden y bajas. No cargar la demo `seed:local` sobre el grupo existente. No se necesita sorteo ni cuentas Auth.

El primer organizador se crea una sola vez con `organizer:bootstrap`. `--recover` es una operación explícita que revoca su enlace anterior; solo procede si lo perdiste o la rotación quedó incierta. Emitir un enlace personal reemplaza el anterior; revocar corta escrituras incluso desde una pestaña abierta. La recuperación de un backup exige invalidar también los enlaces personales restaurados, como explica [el procedimiento](backup-recovery.md). Nunca pegar enlaces privados, logs completos de requests o variables en tickets públicos.

## Mantenimiento

Después de tener un respaldo reciente y revisado, consultar sin aplicar:

```cmd
npm.cmd run cleanup:local
npm.cmd run cleanup:rates:local
```

Los ejecutores están fijados a la pila principal **local**, no a un proyecto enlazado. El primero lista hasta 100 candidatos de medios; el segundo hasta 1000 ventanas vencidas. Si corresponde aplicar deliberadamente en ese local:

```cmd
npm.cmd run cleanup:local -- --apply
npm.cmd run cleanup:rates:local -- --apply
```

La limpieza de archivos reclama la ruta en SQL, comprueba referencias, borra mediante Storage API y confirma con recibo; no hacer DELETE manual de storage.objects o archivos del volumen. Fallos se reintentan; los tombstones impiden volver a asociar una ruta reclamada. Las cuotas no eliminan listas o enlaces. La limpieza también se prueba en la pila sintética con `test:recovery:local`; no se ejecutó `--apply` en tus datos durante T24. Un mantenimiento alojado necesita su procedimiento/revisión de T25, no cambiar estos scripts para apuntarlos fuera.

## Pruebas y aceptación

`npm.cmd test` comprueba tipos, dominio, SQL en memoria y datos. `test:security:local`, `test:admin:ui:local` y `test:recovery:local` son los ensayos Docker recomendados para no tocar la pila principal. Comparten AdminTest y se ejecutan secuencialmente. Los ejecutores antiguos `test:*:http`, concurrencia, medios/perfil/importación locales usan la pila principal con fixtures efímeros: solo en desarrollo controlado y con sus requisitos, nunca producción. `test:db:local` revierte sus transacciones pero tampoco se debe correr sobre datos alojados de uso real.

Para UI hace falta Edge. Firefox/WebKit y el zoom nativo se preparan según [accesibilidad](accessibility-review.md). Las pruebas crean un servidor temporal y bloquean salidas externas; no reutilizan un dev server que podría cargar .env.local. Si 4173/4174 están ocupados, en PowerShell:

```powershell
$env:APP_UI_ISOLATED='1'
npm.cmd run test:ui -- --workers=2
npm.cmd run test:a11y -- --workers=2
Remove-Item Env:APP_UI_ISOLATED
```

Para aceptación manual con datos controlados y dos navegadores/contextos:

1. Visita pública: once tarjetas editables desde administración, perfil directo/recarga/404, tres posiciones, moneda y campos opcionales, fotos rotas y preferencias.
2. Acceso personal: URL limpia, edición solo propia, guardar/recargar/reabrir enlace, cancelar limpieza y confirmar una sola posición. Probar dos versiones y conservar borrador ante 409 o fallo de red.
3. Foto e importación: archivo pendiente hasta guardar, reemplazo fallido conserva anterior, sugerencias parciales/cancelación y solo selección explícita al borrador. Confirmar una tienda real accesible y otra incompatible en staging autorizado; no evadir bloqueos.
4. Organizador: alta vacía, renombre con slug estable, orden, evento/fecha, enlaces una sola vez y baja confirmada. Abrir una pestaña personal, revocar desde otra y comprobar que guardar es rechazado.
5. Teclado, zoom 200 %, móvil 320 px, diálogo/Escape/foco, movimiento reducido y lector de pantalla **real**. El lanzador `review:a11y:local` usa datos ficticios; la lista pendiente está en su guía. ARIA/axe no sustituyen la lectura hablada.
6. Registrar fecha, entorno, versiones y resultado sin tokens. Tras T25 se repetirá un smoke test controlado, sin pruebas destructivas sobre listas reales.

## Diagnóstico

| Síntoma | Acción |
| --- | --- |
| Ensayo falla en startup | Iniciar Docker Desktop y esperar al motor; comprobar puertos y que no quedó AdminTest de una interrupción. No borrar volúmenes generales. |
| Enlace no disponible tras recarga | Abrir otra vez el enlace privado; verificar origen/puerto, Edge y que no fue revocado/expiró. No probar claves privilegiadas en frontend. |
| Guardado 409 | Consultar versión actual, comparar y decidir conservar borrador o cargar datos; no reenviar ciegamente. |
| Respuesta perdida de alta/rotación | Reconciliar por UUID/estado; para organizador sin relevo conservado usar recuperación explícita. |
| 429 | Esperar Retry-After y un nuevo clic; no falsificar IP ni vaciar cuotas para usuarios. |
| Importación 503/manual | Revisar los dos archivos de servidor, secreto compartido/callback/transporte; edición manual sigue disponible. |
| Error de configuración pública | Revisar solo URL y clave publishable/anon del entorno. Reiniciar Vite; no imprimir variables completas. |

Si Docker cae durante un ensayo, su finally puede no retirar la pila. Revisa exclusivamente AmigoSecretoAdminTest y su workdir `artifacts/admin-local`; no usar stop --all, prune o reset de la principal. Un responsable puede revisar la retirada puntual de esa pila antes de repetir. No hay tareas programadas, emails o endpoints públicos de mantenimiento añadidos.

## Archivos de T24

| Archivos | Cambio |
| --- | --- |
| README, integración Supabase, README de funciones y guías de acceso/navegación/regalos | Estado operativo actual y eliminación de instrucciones obsoletas. |
| environment.md, operations.md, backup-recovery.md, deployment-review.md | Variables, arranque/aceptación, exportación/restauración y secuencia de despliegue/rollback aún no ejecutada. |
| Las tres .env.example y .gitignore | Comentarios/orígenes locales coherentes, marcadores y exclusión de respaldos. No cambian archivos reales de entorno. |
| scripts/check-docs.mjs y package.json | Verificador de documentación y comando check:docs. |
| scripts/test-admin-local.mjs, tests/support/recovery-local.mjs y package.json | Modo de ensayo --recovery, DB/Storage, corrupción, permisos, invalidación de enlaces y mantenimiento en pila desechable. |
| scripts/organizer-local.mjs | Texto de éxito actualizado: el panel ya está implementado. Su lógica y destino permanecen locales. |
| Avance, matriz A37 y validación | Resultados y límites de T24; T21/T25 pendientes identificados. |
