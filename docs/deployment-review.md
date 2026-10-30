# Preparación de despliegue y rollback

T24 preparó esta guía y **T25 ha preparado el paquete local, sin despliegue**. No se ha consultado, vinculado o modificado la base de AmigoSecreto2026 alojada, ni creado un proyecto staging, ni cargado secretos o publicado frontend/funciones. El usuario reservó AmigoSecreto2026 para producción y pidió staging separado; Vercel confirmado: `franco-9ec3/amigo-secreto2026`. Requiere revisión y aprobación del destino y del conjunto concreto de cambios antes de operar sobre la base remota. Ver [paquete, comandos y evidencia local](deployment-package.md).

## Paquete para aprobar

| Punto | Evidencia necesaria antes de operar |
| --- | --- |
| Código | Revisión del diff final, versión/commit, lockfile y migraciones incluidas. Hay cambios previos sin commit; no asumir que HEAD contiene todo lo probado. |
| Destinos | Project Ref, región/major PostgreSQL y dominio de **staging separado**; después los de producción. El project_id local no identifica el alojado. |
| Migraciones | Comparar historial local/remoto, lista exacta pendiente y revisión de datos existentes. No incluir seed/demo, reset o migraciones adicionales por omisión. |
| Recuperación | Respaldo completo DB + Storage, manifiesto y restauración probada en destino aislado; ventana de mantenimiento y responsable. |
| Acceso | Sin cuentas Auth convencionales, RPC de servidor no ejecutables por clientes, bucket público solo lectura, enlaces privados, credenciales solo en servidor. |
| Aceptación | T22/T23 locales correctos; lector real T21 pendiente, tienda real y rutas/CSP/CORS/transporte alojado por comprobar. |

## Secuencia propuesta para T25

1. Aprobar el staging concreto. Usar credencial de gestión con alcance mínimo para CLI; no solicitar ni pegar secretos en el chat. Revisar ayudas de la CLI instalada antes de cada comando. La guía [de integración](supabase-integration.md) describe vinculación y vista previa de migraciones; incluso un dry-run puede leer el remoto y requiere aprobación.
2. Preparar y comprobar respaldo; comparar historial. Aplicar backend en orden incremental: esquema/permisos/bucket y funciones de esa versión. Verificar Auth/signup/realtime deshabilitados según el plan y APIs expuestas solo para la lectura prevista. No copiar la configuración local completa mediante config push.
3. Configurar los tres handlers con su autorización propia y los secretos/orígenes exactos del staging. Desplegar el adaptador Node de descarga aprobado, callback HTTPS e igual HMAC en ambos servidores. Sin APP_LOCAL_FETCH_PROXY, callbacks localhost o service_role en Vercel frontend/Node descargador. Ver [matriz de variables](environment.md).
4. Frontend Vite: Node 24 compatible, instalación desde lockfile, build `npm run build`, salida `dist`. En el entorno de build solo las variables públicas del staging. El generador local prepara el fallback SPA para perfiles/editores profundos, preservando assets y `/api/fetch-product`; la simulación local pasó, falta comprobar el router alojado y que el callback del importador no recibe index.html. Referencia: [Vite en Vercel](https://vercel.com/docs/frameworks/frontend/vite).
5. Revisar en staging las cabeceras/CSP del paquete local: Referrer-Policy no-referrer, nosniff, sin framing, base/object restringidos, scripts propios, conexiones al Supabase del entorno e imágenes HTTPS/blob según los formularios. Comprobar estilos/diálogos, que no filtre capacidades en URLs/logs, y que no se amplíen orígenes para ocultar fallos. La política propuesta pasó en Edge/Firefox/WebKit locales; el rewrite y las cabeceras concretos siguen pendientes de ensayo alojado. No hay vercel.json publicado ni certificación de infraestructura en esta fase.
6. Bootstrap inicial mediante canal administrativo seguro del **destino aprobado**; las utilidades actuales de bootstrap/limpieza son solo locales y no apuntan al remoto. No crear credenciales por defecto o endpoints de bootstrap. Conservar el enlace una vez y emitir dos accesos personales de prueba.
7. Aceptación en staging: perfil profundo/recarga/Atrás, dos participantes y organizador, escritura pública/ajena rechazada, revocación con pestaña abierta, conflictos, fotos, importación accesible/incompatible, cuotas, lector/móvil y métricas con red/infraestructura reales. Revisar logs de infraestructura sin tokens y TLS/DNS del proxy desplegado, no solo mocks.
8. Presentar resultados, incidencias y plan de promoción/rollback para aprobación de producción. Repetir verificación de destinos, respaldo y dry-run; aplicar backend compatible antes de frontend. Incorporar las personas del grupo sin regalos inventados, mediante flujo revisado; no ejecutar el seed ficticio. Smoke test controlado final sin borrar listas reales.

No se ha verificado plan/precio, retención de backups, dominio, cabecera IP del proveedor o límites alojados. Mantener el modo global de cuotas hasta verificar todos los ingresos y ausencia de bypass; no habilitar verified-cloudflare solo por reconocer una cabecera.

## Rollback e incidencias

Si falla un frontend nuevo, detener la promoción y volver al despliegue inmutable previamente comprobado del mismo entorno. Revisar que sus variables compiladas y contrato de API sigan siendo válidos; un rollback restaura el build anterior, no toma automáticamente variables recién cambiadas. Validar perfil profundo y acceso privado después. Referencia: [Instant Rollback de Vercel](https://vercel.com/docs/instant-rollback).

Un rollback de frontend **no revierte datos, migraciones, Edge o el adaptador Node**. Mantener compatibilidad backend→frontend; para backend defectuoso preferir una corrección incremental revisada. No borrar una migración aplicada o ejecutar SQL inverso improvisado. Si hubo corrupción/pérdida, mantener escritura cerrada y seguir [respaldo y recuperación](backup-recovery.md), con nueva aprobación por destino y las credenciales restauradas invalidadas antes de reabrir.

Registrar versión de código/funciones/secretos (identificador, nunca valor), historial, comprobaciones y responsable. No enviar notificaciones o credenciales a participantes automáticamente; la distribución de enlaces queda a cargo del organizador. Esta guía no ejecuta ni autoriza por sí sola acciones remotas.
