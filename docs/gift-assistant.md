# Ayuda para buscar regalos: texto para tu asistente de IA

Iteración del **1 de noviembre de 2026**. Sustituye la integración con Gemini del [plan del asistente](gemini-assistant-implementation-plan.md). La prueba G01 mostró que la capa gratuita de la clave usada rechazaba las llamadas por cuota (`429 RESOURCE_EXHAUSTED`) desde la primera solicitud, así que se eligió la opción sin proveedor.

**La aplicación no llama a ninguna IA.** Prepara un texto con los datos públicos del perfil; la persona lo copia y lo pega en el asistente que ya use (Claude, ChatGPT, Gemini u otro) con la búsqueda web activada. No hay claves, cuotas, Edge Function, migración ni cambio de CSP.

## Qué hace

En el perfil público aparece una burbuja «Ayuda para encontrar este regalo» con tres acciones: opciones similares, tiendas físicas y otra consulta.

- Hay que elegir explícitamente el regalo; si solo hay uno, se selecciona solo. «Otra consulta…» permite elegir también los gustos generales. Sin regalos guardados, las dos primeras acciones lo explican y ofrecen la tercera.
- Distrito y detalles adicionales son opcionales; «Otra consulta» exige escribir la pregunta.
- El texto se actualiza mientras se escribe y se muestra completo antes de copiar. **Copiar texto** usa el portapapeles; si el navegador lo niega, el texto queda seleccionado para copiarlo a mano.
- Escape o **Cerrar** devuelven el foco a la burbuja. Nada se guarda en Web Storage; al recargar se pierde.
- El componente y sus estilos se cargan de forma diferida solo en los perfiles.

## Qué incluye el texto

`src/domain/gift-prompt.ts` (función pura, sin red) arma:

1. Reglas: Lima Metropolitana (y el distrito si se indicó), fecha de consulta en hora de Lima, buscar en la web, no inventar tiendas, precios, stock ni enlaces, hasta tres opciones con un formato fijo.
2. La tarea según la acción y la consulta.
3. Un bloque `<<<DATOS … DATOS>>>` con el regalo (título, tipo, descripción, características, precio referencial y enlace HTTPS si es válido) o con los gustos publicados, marcado como información y no como instrucciones.

**No incluye** nombre, slug, foto, mensaje personal, identificadores ni enlaces privados. Los datos se limpian: sin caracteres de control ni saltos de línea, sin secuencias `<<<`/`>>>` que imiten el delimitador y con longitudes acotadas.

## Por qué es solo informativo

La respuesta queda en el asistente externo. Ese asistente no recibe credenciales ni acceso a la aplicación, y nada de lo que responda vuelve a esta página, se guarda o modifica datos.

## Verificación

- `tests/unit/gift-prompt.test.ts`: reglas y datos por acción, gustos generales, enlaces no seguros omitidos, datos que no pueden salir de su línea ni del bloque, límites de longitud y fecha de Lima.
- `tests/ui/gift-assistant.spec.ts`: selección explícita, texto sin nombre ni identificadores, copia exacta sin ninguna solicitud de red adicional ni almacenamiento, portapapeles denegado, perfil sin regalos, Escape y foco, autoselección con un regalo, 320 px por encima de los avisos y Axe WCAG 2.2 AA.

## Trabajo de Gemini retirado

La Edge Function `gift-assistant`, la migración de cuotas, el marco de sugerencias de Google y la prueba `probe:gemini` se retiraron del repositorio sin haberse desplegado. La migración también se revirtió en el Supabase local de Docker. Hay una copia en `artifacts/assistant-gemini-backup/` (ignorada por Git), por si se retoma.
