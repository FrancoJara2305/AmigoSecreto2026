import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUpRight, Check, Gift, Heart, Leaf, RotateCcw, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { Button, LinkButton } from '../components/ui/Button';
import { Checkbox, SelectField, TextAreaField, TextField } from '../components/ui/Fields';
import { Badge, EmptyState, ErrorSummary, LoadingState, Notice } from '../components/ui/Feedback';
import { ConfirmationDialog } from '../components/ui/ConfirmationDialog';
import { useToast } from '../components/ui/ToastNotifications';
import { ChristmasGifts } from '../components/illustrations/ChristmasGifts';
import { normalizePrice } from '../domain/mutation-validation';

function Palette() {
  const colors = [
    { name: 'Verde bosque', value: '#173E32', token: 'forest' },
    { name: 'Rojo navideño', value: '#A82E3C', token: 'christmas' },
    { name: 'Dorado cálido', value: '#E3BB70', token: 'gold' },
    { name: 'Papel crema', value: '#F6E9D5', token: 'cream' },
    { name: 'Marfil', value: '#FFFAF2', token: 'ivory' },
  ];
  return <ul className="palette" aria-label="Paleta de colores">{colors.map((color) => <li key={color.token}>
    <div className="palette__sample" style={{ backgroundColor: `var(--color-${color.token})` }} aria-hidden="true" />
    <strong>{color.name}</strong><span>{color.value}</span>
  </li>)}</ul>;
}

function GiftFormExample() {
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [type, setType] = useState('object');
  const [notes, setNotes] = useState('');
  const [flexible, setFlexible] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useToast();
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const next: Record<string, string> = {};
    if (!title.trim()) next['example-title'] = 'Añade una idea de regalo para continuar.';
    try { normalizePrice(price); } catch { next['example-price'] = 'Usa un precio positivo con hasta dos decimales.'; }
    setErrors(next); setSaved(false);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => document.getElementById(Object.keys(next)[0])?.focus());
      return;
    }
    setSaving(true);
    timer.current = setTimeout(() => {
      setSaving(false); setSaved(true);
      notify({ title: '¡Una idea llena de ilusión!', description: 'La prueba está lista. No se publicó ningún dato.' });
    }, 700);
  }
  function clear() {
    setTitle(''); setPrice(''); setType('object'); setNotes(''); setFlexible(false);
    setErrors({}); setSaved(false); setConfirm(false);
    notify({ title: 'Empezamos de nuevo', description: 'Tu ejemplo quedó limpio.', tone: 'info' });
  }
  return <section className="form-example" aria-labelledby="form-title">
    <div className="form-example__heading"><span className="tiny-label">UN DESEO, MUCHAS POSIBILIDADES</span><Badge tone="gold">Ejemplo interactivo</Badge></div>
    <h3 id="form-title">Todo empieza con una idea.</h3>
    <p className="form-example__intro">Una pista sencilla puede convertirse en el regalo perfecto.</p>
    <form noValidate onSubmit={submit}>
      <ErrorSummary errors={Object.entries(errors).map(([id, message]) => ({ id, message }))} />
      <div className="form-fields">
        <TextField id="example-title" label="Tu idea de regalo" required placeholder="Ese libro que tienes en mente…" maxLength={120}
          value={title} onChange={(event) => { setTitle(event.target.value); setSaved(false); }} error={errors['example-title']} disabled={saving} />
        <div className="form-pair">
          <SelectField label="Tipo de regalo" value={type} onChange={(event) => setType(event.target.value)} disabled={saving}>
            <option value="object">Objeto</option><option value="clothing">Prenda de vestir</option>
          </SelectField>
          <TextField id="example-price" label="Precio referencial" hint="Opcional · soles (S/)" inputMode="decimal" placeholder="Por ejemplo, 59,90" value={price}
            onChange={(event) => setPrice(event.target.value)} error={errors['example-price']} disabled={saving} />
        </div>
        <TextAreaField label="Ese pequeño detalle" hint="Opcional. Un color, una talla o algo que te encante." placeholder="Me gustan los tonos neutros y las cosas hechas con cariño…"
          value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} disabled={saving} />
        <Checkbox label="Estoy abierto a opciones parecidas." checked={flexible} onChange={(event) => setFlexible(event.target.checked)} disabled={saving} />
      </div>
      {saved && <Notice tone="success" title="Tu ejemplo está listo" live>Así se verá una confirmación. No se guardaron datos en tu lista.</Notice>}
      <div className="form-example__actions">
        <Button type="submit" loading={saving} icon={<Check />}>{saving ? 'Guardando…' : 'Probar guardado'}</Button>
        <Button variant="quiet" icon={<Trash2 />} disabled={saving} onClick={() => setConfirm(true)}>Limpiar ejemplo</Button>
      </div>
      <p className="privacy-note"><ShieldCheck aria-hidden="true" />Este ejemplo se queda en tu navegador.</p>
    </form>
    <ConfirmationDialog open={confirm} onOpenChange={setConfirm} title="¿Limpiamos esta idea?"
      description={`Se borrará únicamente ${title.trim() ? `«${title.trim()}»` : 'este ejemplo'} de la vista previa. Tu lista de deseos no se modifica.`}
      confirmLabel="Sí, limpiar idea" onConfirm={clear} />
  </section>;
}

function StatesExample() {
  const [state, setState] = useState<'empty' | 'loading' | 'error'>('empty');
  const notify = useToast();
  return <aside className="states-example" aria-labelledby="states-title">
    <div className="states-example__intro"><span className="tiny-label">CADA PASO TIENE SU MOMENTO</span><h3 id="states-title">Siempre, una pista clara.</h3>
      <p>Incluso cuando la sorpresa todavía se está preparando.</p></div>
    <div className="state-switch" role="group" aria-label="Probar estados de la interfaz">
      <button type="button" aria-pressed={state === 'empty'} onClick={() => setState('empty')}>En espera</button>
      <button type="button" aria-pressed={state === 'loading'} onClick={() => setState('loading')}>Preparando</button>
      <button type="button" aria-pressed={state === 'error'} onClick={() => setState('error')}>Sin conexión</button>
    </div>
    <div className="state-preview">
      {state === 'empty' && <EmptyState title="La sorpresa está por llegar" description="Pronto habrá una idea especial en este espacio. Lo bonito también se hace esperar." />}
      {state === 'loading' && <LoadingState />}
      {state === 'error' && <div className="state-error"><Notice title="Nos falta una pequeña conexión" tone="error" live>Tu idea sigue aquí. Puedes volver a intentarlo cuando estés listo.</Notice>
        <Button variant="secondary" icon={<RotateCcw />} onClick={() => { setState('empty'); notify({ title: 'Todo en su sitio', description: 'Volvimos al estado de espera.', tone: 'info' }); }}>Volver a intentar</Button></div>}
    </div>
    <div className="states-example__note"><Heart aria-hidden="true" /><p>Pequeños mensajes que acompañan,<br />sin quitarle magia al momento.</p></div>
    <div className="notification-example"><div><span className="tiny-label">UN MENSAJE A TIEMPO</span><p>También celebramos los pequeños pasos.</p></div>
      <Button variant="secondary" icon={<Sparkles />} onClick={() => notify({ title: 'Un pequeño paso, mucha ilusión', description: 'Así te acompañaremos con cada detalle.' })}>Ver notificación</Button>
    </div>
  </aside>;
}

export function DesignPreview() {
  return <div id="inicio" className="design-preview">
    <a tabIndex={0} className="skip-link" href="#contenido">Saltar al contenido</a>
    <header className="site-header page-width">
      <a tabIndex={0} className="brand" href="#inicio"><span className="brand__icon"><Gift aria-hidden="true" /></span><span>amigo secreto<span className="brand__year">NAVIDAD 2026</span></span></a>
      <nav aria-label="Navegación de la vista previa"><a tabIndex={0} href="#esencia">La esencia</a><a tabIndex={0} href="#detalles">Los detalles</a></nav>
      <span className="preview-label"><span aria-hidden="true" />Vista previa</span>
    </header>
    <main id="contenido" tabIndex={-1}>
      <section className="preview-hero page-width" aria-labelledby="hero-title">
        <div className="preview-hero__copy"><p className="eyebrow"><span aria-hidden="true">✦</span> UNA NAVIDAD PARA COMPARTIR</p>
          <h1 id="hero-title">La ilusión vive<br /><em>en los detalles.</em></h1>
          <p className="preview-hero__description">Unas pistas, tres deseos y muchas ganas de sorprender. Así empieza nuestro Amigo Secreto.</p>
          <div className="preview-hero__actions"><LinkButton href="#detalles" icon={<ArrowDown />}>Explorar los detalles</LinkButton><a tabIndex={0} className="text-link" href="#esencia">Un primer vistazo<ArrowUpRight aria-hidden="true" /></a></div>
          <p className="hero-footnote"><span className="hero-footnote__line" aria-hidden="true" />Un regalo puede ser pequeño. La ilusión, enorme.</p>
        </div>
        <div className="preview-hero__art"><ChristmasGifts /><div className="art-caption"><span aria-hidden="true">✧</span> ENVUELTO CON CARIÑO</div></div>
      </section>
      <div className="ornament-divider page-width" aria-hidden="true"><span /><Sparkles /><span /></div>
      <section id="esencia" className="essence-section page-width" aria-labelledby="essence-title">
        <div className="section-heading"><div><p className="eyebrow"><span>01</span> LA ESENCIA</p><h2 id="essence-title">Una Navidad que se siente cercana.</h2></div>
          <p>Papel cálido, verde bosque y un toque de dorado.<br className="desktop-break" /> Una pequeña tradición, con mucha personalidad.</p></div>
        <Palette />
      </section>
      <section id="detalles" className="details-section" aria-labelledby="details-title"><div className="page-width">
        <div className="section-heading"><div><p className="eyebrow"><span>02</span> LOS DETALLES</p><h2 id="details-title">Cada gesto cuenta.</h2></div><p>Prueba una idea, descubre los mensajes<br className="desktop-break" /> y dale un primer vistazo a nuestra Navidad.</p></div>
        <div className="details-grid"><GiftFormExample /><StatesExample /></div>
      </div></section>
      <section className="closing-note page-width" aria-label="Un encuentro para compartir"><span className="closing-note__icon"><Leaf aria-hidden="true" /></span>
        <p>No se trata del tamaño del regalo.<br /><em>Se trata de pensar en alguien.</em></p><span className="closing-note__stars" aria-hidden="true">✦</span></section>
    </main>
    <footer className="site-footer page-width"><p>Hecho para compartir un poquito de ilusión.</p><a tabIndex={0} href="#inicio">Volver arriba<ArrowUpRight aria-hidden="true" /></a><span>AMIGO SECRETO · 2026</span></footer>
  </div>;
}
