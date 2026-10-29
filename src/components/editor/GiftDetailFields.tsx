import type { GiftDraft } from '../../domain/gift-editor';
import { SelectField, TextAreaField, TextField } from '../ui/Fields';

const subtypes = [['polo','Polo'],['camisa','Camisa'],['chompa','Chompa'],['pantalon','Pantalón'],['vestido','Vestido'],['casaca','Casaca'],['pijama','Pijama'],['gorra','Gorra'],['bolso','Bolso'],['footwear','Calzado'],['otro','Otra prenda']];
export function GiftDetailFields({ draft, errors, change }: { draft: GiftDraft; errors: Record<string, string>; change(key: string, value: string): void }) {
  const values = draft[draft.gift_type]; const clothing = draft.gift_type === 'clothing'; const footwear = clothing && values.subtype === 'footwear';
  function field(key: string, label: string, hint?: string) {
    return <TextField key={key} id={`gift-details.${key}`} label={label} hint={hint} maxLength={120} value={values[key] ?? ''} error={errors[`details.${key}`]} onChange={(event) => change(key, event.target.value)} />;
  }
  function notes(key: string, label: string) {
    return <TextAreaField id={`gift-details.${key}`} label={label} maxLength={1000} value={values[key] ?? ''} error={errors[`details.${key}`]} onChange={(event) => change(key, event.target.value)} />;
  }
  return <details className="editor-disclosure"><summary id="gift-details">Detalles que ayudarán a elegir<span>Opcional</span></summary><div className="editor-disclosure__body">{errors.details && <p className="field__error">{errors.details}</p>}
    {clothing ? <><SelectField id="gift-details.subtype" label="Tipo de prenda" value={values.subtype ?? ''} error={errors['details.subtype']} onChange={(event) => change('subtype', event.target.value)}><option value="">Sin especificar</option>{values.subtype && !subtypes.some(([value]) => value === values.subtype) && <option value={values.subtype}>{values.subtype}</option>}{subtypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
      <div className="editor-pair">{field('size', footwear ? 'Numeración' : 'Talla')}{field('size_system','Sistema de tallas', footwear ? 'Por ejemplo EU, US o UK. No se convierten las medidas.' : 'Por ejemplo Internacional, EU o US.')}</div>
      <div className="editor-pair">{field('color','Color')}<TextField id="gift-details.alternative_colors" label="Colores alternativos" hint="Hasta ocho, separados por comas." value={values.alternative_colors ?? ''} error={errors['details.alternative_colors']} onChange={(event) => change('alternative_colors', event.target.value)} /></div>
    </> : <><div className="editor-pair">{field('category','Categoría')}{field('brand','Marca')}</div><div className="editor-pair">{field('model','Modelo')}{field('color','Color')}</div></>}
    <details className="editor-more"><summary>Más detalles</summary><div className="editor-disclosure__body">{clothing ? <div className="editor-pair">{field('fit','Ajuste')}{field('brand','Marca')}</div> : field('dimensions','Dimensiones')}{field('material','Material')}{!clothing && notes('specifications','Características')}{notes('notes','Notas para elegir')}</div></details>
  </div></details>;
}
