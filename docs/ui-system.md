# T09: sistema visual y componentes

La ruta `/diseno` ofrece una galería de revisión de los componentes de T09. No consulta Supabase, no necesita Docker ni credenciales y no escribe en almacenamiento del navegador. Guardar simula una espera de 700 ms; limpiar solo borra el ejemplo de React. La raíz contiene el catálogo desde T10, los perfiles públicos funcionan desde T11, el acceso privado desde T12 y el editor manual de regalos desde T13. La edición visual de perfil sigue en T18.

## Previsualizar y comprobar

Desde la raíz del repositorio, con Node 24+:

```powershell
npm ci
npm run preview:local
```

Abrir `http://127.0.0.1:5173/diseno`; Ctrl+C detiene el servidor. Si el puerto está ocupado, detener el proceso propio o elegir otro puerto con `-- --port 5175`. No hace falta iniciar Supabase para esta galería.

```powershell
npm test
npm run build
npm run test:ui
```

Las pruebas UI usan Microsoft Edge instalado, en modo headless. Playwright levanta la previsualización en `127.0.0.1:4173` con una API temporal en el puerto 4174 y detiene sus procesos al terminar. Ambos puertos deben estar libres; no se reutiliza un servidor que pudiera conectarse al destino remoto del usuario. Para usar Chrome instalado en PowerShell:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run test:ui
Remove-Item Env:PLAYWRIGHT_CHANNEL
```

Las capturas de escritorio, tableta, móvil y diálogo quedan en `artifacts/ui/`; fallos y trazas en `test-results/`. Ambas carpetas están excluidas de Git.

## Archivos y contratos

| Archivo | Responsabilidad |
| --- | --- |
| `src/styles/tokens.css` | Tailwind v4, paleta del plan, fuentes locales, espaciado, radios, foco y movimiento reducido. |
| `src/styles/components.css` | Estilos compartidos, estados y tamaños de controles. |
| `src/styles/preview.css` | Composición adaptable exclusiva de la galería. |
| `src/components/ui/Button.tsx` | Botones primary/secondary/quiet/danger y enlace con aspecto de botón. |
| `src/components/ui/Fields.tsx` | Campo de texto, textarea, select y checkbox nativos. |
| `src/components/ui/Feedback.tsx` | Badge, aviso inline, resumen de errores, vacío y carga. |
| `src/components/ui/ConfirmationDialog.tsx` | Confirmación modal corta; no es un editor de formularios. |
| `src/components/ui/ToastNotifications.tsx` | Provider y hook de notificaciones con anuncio accesible y cierre explícito. |
| `src/components/illustrations/ChristmasGifts.tsx` | SVG decorativo original, sin peticiones ni imágenes externas. |
| `src/pages/DesignPreview.tsx` | Ejemplos locales interactivos para revisar los contratos. |

Se conservan los cinco colores del plan. Texto secundario y borde de controles tienen tonos específicos para alcanzar contraste; dorado se reserva a decoración y fondos con texto oscuro. Las fuentes sans y serif son del sistema. Contenido con ancho máximo de 1.120 px; controles con objetivos de al menos 44 px, foco visible y errores con texto/icono, además del color. Las transiciones de interacción duran 180 ms y se desactivan con movimiento reducido.

Los campos generan ID estable si no se proporciona uno, enlazan label, ayuda y error mediante `aria-describedby` y marcan `aria-invalid`. Dar un `id` explícito cuando un resumen de errores deba enfocar el campo. `Button` usa `type="button"` por defecto; declarar `type="submit"` para guardar. Durante `loading` se deshabilita y expone `aria-busy`. Para enlaces se usa `LinkButton` con un `href` real.

```tsx
<TextField id="gift-title" label="Tu idea de regalo" required
  value={title} onChange={(event) => setTitle(event.target.value)} error={errors.title} />
<Button type="submit" loading={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
```

`ConfirmationDialog` recibe `open`, `onOpenChange`, `title`, `description`, `onConfirm` y `confirmLabel`. El padre determina la acción y su autorización. Abre con `showModal()`, comienza en Cancelar, retiene Tab/Shift+Tab, cierra con Escape o el fondo y devuelve foco al disparador. `busy` bloquea cierres y acciones repetidas mientras se confirma. Los endpoints y permisos existentes siguen siendo la autoridad; ningún componente otorga permisos.

`ToastProvider` envuelve la aplicación; `useToast()` recibe `{ title, description?, tone? }`. Hay regiones vivas estables para mensajes informativos y errores, sin mover foco al aparecer. Se muestran hasta tres notificaciones, sin caducidad automática. Al cerrar se devuelve foco al control de origen si aún está disponible, o al contenido principal. Los avisos inline usan `live` solo cuando deben anunciar un cambio; evitar duplicar anuncios del mismo mensaje.

## Validación y límites

`tests/ui/design-preview.spec.ts` ejecuta ocho escenarios en tres tamaños: 1280×900, 768×1024 y 390×844. Comprueba ausencia de llamadas externas, teclado, errores y foco, doble envío, confirmación/cancelación, notificaciones, estados y movimiento reducido. También prueba reflujo a 320 px, texto raíz al 200 % y axe con reglas WCAG A/AA sobre la página, errores y diálogo.

`tests/unit/color-contrast.test.ts` calcula contraste usando los valores reales del CSS: al menos 4,5:1 en combinaciones de texto probadas y 3:1 en límites/foco de controles. Las capturas permiten revisar composición y desbordamientos; no se han establecido snapshots visuales rígidos.

Las comprobaciones automatizadas no certifican accesibilidad completa. Falta la prueba con lector de pantalla real y otros motores de navegador, prevista en T21. Esta iteración no modifica migraciones, Edge Functions, cuentas, enlaces privados ni recursos remotos.
