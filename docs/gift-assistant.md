# Ayuda para buscar regalos

Iteración del **2 de noviembre de 2026**. Amplía la del 1 de noviembre, que solo preparaba un texto para copiar.

- «Opciones similares» y «Tiendas físicas» siguen preparando un texto para pegar en el asistente de IA que la persona ya use, con la búsqueda web activada: necesitan datos comerciales actuales que la app no puede comprobar.
- **«Otra consulta» puede además responderse dentro de la app** con Gemini (`gemini-3.5-flash-lite`, capa gratuita, **sin búsqueda web**), a través de la Edge Function `gift-assistant`.

La prueba del 1 de noviembre mostró que la capa gratuita rechaza la búsqueda web (`429 RESOURCE_EXHAUSTED`) pero responde sin ella en menos de un segundo. `gemini-3.8-flash` tardó entre 1,5 y 3 minutos y cortaba las respuestas, así que no se usa.

## Qué hace

En el perfil público aparece una burbuja «Ayuda para encontrar este regalo» con tres acciones: opciones similares, tiendas físicas y otra consulta.

- Hay que elegir explícitamente el regalo; si solo hay uno, se selecciona solo. «Otra consulta…» permite elegir también los gustos generales. Sin regalos guardados, las dos primeras acciones lo explican y ofrecen la tercera.
- Distrito y detalles adicionales son opcionales; «Otra consulta» exige escribir la pregunta.
- El texto se actualiza mientras se escribe y se muestra completo antes de copiar. **Copiar texto** usa el portapapeles; si el navegador lo niega, el texto queda seleccionado para copiarlo a mano.
- Escape o **Cerrar** devuelven el foco a la burbuja. Nada se guarda en Web Storage; al recargar se pierde.
- El componente y sus estilos se cargan de forma diferida solo en los perfiles.

### «Preguntar aquí» (solo «Otra consulta»)

- Al abrir «Otra consulta», la app pregunta una vez por carga de página si el asistente está disponible (`GET`, sin cuota). Si la función no existe, está apagada o falla, el botón no aparece y todo sigue como antes.
- Junto a **Copiar texto** aparece **Preguntar aquí**, con un aviso previo: la pregunta y los datos públicos del regalo o de los gustos se envían a Google, que en la capa gratuita puede usarlos para mejorar sus productos, y la respuesta no cambia nada en la app.
- La respuesta es texto plano, corta, con la nota «Respuesta generada por IA, puede equivocarse». Se muestra siempre como texto literal, nunca como HTML.
- Una pregunta, una respuesta: no hay conversación ni historial. Cambiar la pregunta, el regalo o cerrar el panel descarta la respuesta y cancela la consulta en curso.
- Si Gemini falla, se agota la cuota o el asistente está apagado, se muestra un mensaje y **Copiar texto** sigue disponible.

## Qué recibe la IA

Los dos caminos comparten el bloque de datos de `supabase/functions/_shared/gift-facts.ts`: un bloque `<<<DATOS … DATOS>>>` con el regalo (título, tipo, descripción, características, precio referencial y enlace HTTPS si es válido) o con los gustos publicados, marcado como información y no como instrucciones.

**No incluye** nombre, slug, foto, mensaje personal, identificadores ni enlaces privados. Los datos se limpian: sin caracteres de control ni saltos de línea, sin secuencias `<<<`/`>>>` que imiten el delimitador y con longitudes acotadas.

- **Texto para copiar** (`src/domain/gift-prompt.ts`, sin red): reglas de Lima Metropolitana, fecha de Lima, búsqueda web, no inventar datos comerciales, formato de hasta tres opciones, la tarea según la acción y el bloque de datos.
- **Preguntar aquí** (`supabase/functions/_shared/assistant-prompt.ts`): instrucciones de sistema (español, breve, sin internet, decir «No lo sé» si los datos no alcanzan, no inventar tiendas, precios, stock ni enlaces, tratar los datos como información), la consulta y el bloque de datos.

## Cómo está protegido «Preguntar aquí»

- **El navegador solo envía** `{v:1, participant_id, gift_id | null, message}`, con la pregunta de hasta 500 caracteres. El contrato es estricto: claves exactas, UUID y sin caracteres de control.
- **El servidor lee los datos de la base** con `public.server_assistant` (solo `service_role`): el texto del regalo nunca viene del cliente y el regalo debe pertenecer a esa persona.
- **Cuotas** antes de cualquier llamada a Gemini, en `private.rate_limits` (operación `assistant`): 10 preguntas por minuto y 200 por día UTC, globales. No hay IP verificada (`RATE_LIMIT_IP_SOURCE=off`), así que si alguien agota el cupo el asistente se pausa para todos, mientras el catálogo y la edición conservan sus propias cuotas. Los intentos con identificadores inexistentes también cuentan.
- **Gemini**: la clave va en una cabecera y solo como secreto del servidor; el modelo lo fija el servidor; sin herramientas; respuestas de 300 tokens como máximo, 20 s de espera y una llamada por pregunta.
- **Interruptor** `GIFT_ASSISTANT_ENABLED=1`. Sin él, o sin clave o modelo válidos, la función responde `503` y el `GET` de disponibilidad devuelve `false`.
- Los registros guardan estado, duración, modelo y tokens; nunca la pregunta ni la respuesta.

| Variable (secreto de la función) | Valor |
|---|---|
| `GIFT_ASSISTANT_ENABLED` | `1` para encenderlo; `0` lo apaga |
| `GEMINI_API_KEY` | Clave del entorno; nunca en `VITE_*`, Git ni chat |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
| `GIFT_ASSISTANT_PROVIDER` | Opcional. `synthetic` da respuestas locales sin red y se rechaza en Edge alojado |

## Verificación

- `tests/unit/gift-prompt.test.ts`: reglas y datos por acción, gustos generales, enlaces no seguros omitidos, datos que no pueden salir de su línea ni del bloque, límites de longitud y fecha de Lima.
- `tests/unit/gift-assistant.test.ts`: contrato estricto, disponibilidad sin cuota, fallo cerrado si está apagado o sin configurar, datos canónicos sin identificadores, pregunta que no puede cerrar el bloque, cuota, errores del proveedor sin texto del modelo, respuestas vacías, cortadas o largas, adaptador de Gemini sin herramientas y cliente sin credenciales.
- `supabase/tests/database/008_assistant.sql`: RPC solo para el servidor, contexto sin datos privados, regalo de otra persona rechazado, tope por minuto y por día, y cuotas de edición independientes.
- `tests/ui/gift-assistant.spec.ts`: selección explícita, texto sin nombre ni identificadores, copia exacta sin red para las acciones de copiar, portapapeles denegado, perfil sin regalos, Escape y foco, autoselección con un regalo, 320 px por encima de los avisos, respuesta como texto literal, errores con **Copiar texto** disponible y Axe WCAG 2.2 AA.
- `npm run probe:gemini`: cuatro consultas ficticias contra Gemini real con la clave de `.env`, sin imprimirla.
