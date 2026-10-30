import { useEffect,useRef } from 'react';
import type { GiftDraft } from '../../domain/gift-editor';
import { availableImportFields,importFields,importLabels,importValue } from '../../domain/product-import';
import { useProductImport } from '../../hooks/useProductImport';
import { Button } from '../ui/Button';

const sources={'json-ld':'Datos estructurados','open-graph':'Open Graph',html:'Metadatos de la página'};
export function GiftProductImport({draft,participantId,enabled,apply}:{draft:GiftDraft;participantId:string;enabled:boolean;apply(next:GiftDraft,expected:string):boolean}) {
  const lookup=useProductImport(draft,participantId,enabled,apply);
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{if(lookup.preview)heading.current?.focus();},[lookup.preview]);
  const metadata=lookup.preview?.metadata;
  const available=metadata?availableImportFields(draft,metadata):[];
  return <div className="product-import">
    <div className="product-import__actions"><Button variant="secondary" loading={lookup.loading} disabled={!enabled || !draft.product_url.trim() || lookup.waiting} onClick={()=>{void lookup.start();}}>{lookup.loading?'Consultando tienda…':'Importar información'}</Button>
      {lookup.loading&&<Button variant="quiet" onClick={lookup.cancel}>Cancelar importación</Button>}
    </div>
    <p className="field__hint">Consulta solo al pulsar el botón. Puedes seguir escribiendo; si cambias el borrador, descartaremos la consulta. Importar no guarda el regalo.</p>
    <p className="product-import__status" role="status" aria-live="polite">{lookup.loading?'Buscando información. Puedes cancelar sin perder tu borrador.':lookup.message || (metadata?'Encontramos sugerencias. Elige los campos que quieras aplicar.':'')}</p>
    {metadata&&<section className="product-import__preview" aria-labelledby="import-preview-title">
      <h3 id="import-preview-title" tabIndex={-1} ref={heading}>Revisa lo que encontramos</h3>
      <p>Solo están marcados los campos vacíos. Marca un campo con información para reemplazarlo. Todo seguirá editable.</p>
      <p className="product-import__origin">Página consultada: {metadata.final_url}</p>
      {metadata.warnings.includes('PARTIAL_METADATA')&&<p>La tienda solo proporcionó parte de la información. Completa lo que falte a mano.</p>}
      {(metadata.warnings.includes('PRICE_AMBIGUOUS')||metadata.warnings.includes('MULTIPLE_PRODUCTS'))&&<p>Hay varias ofertas o productos. No proponemos un precio exacto; verifica la variante en la tienda.</p>}
      {metadata.warnings.some((warning)=>warning.startsWith('JSON_LD_'))&&<p>Parte de los datos de la tienda no pudo leerse. Revisa las sugerencias antes de aplicarlas.</p>}
      {metadata.fields.reference_price&&!metadata.fields.currency&&<p>La tienda no informó la moneda. El precio está desmarcado hasta que lo revises.</p>}
      <fieldset className="product-import__choices"><legend className="sr-only">Campos encontrados para importar</legend>
        {importFields.filter((field)=>metadata.fields[field]!==undefined).map((field)=>{
          const supported=available.includes(field),existing=importValue(draft,field);
          return <label className="product-import__choice" key={field}><input type="checkbox" checked={lookup.selected.has(field)} disabled={!supported} onChange={()=>lookup.toggle(field)} />
            <span><strong>{importLabels[field]}</strong><span className="product-import__value">{metadata.fields[field]}</span><span className="product-import__source">Fuente: {sources[metadata.sources[field]!]}</span>
              {!supported?<span className="product-import__existing">Modelo solo se aplica a objetos; no cambiaremos el tipo de regalo.</span>:existing.trim()&&<span className="product-import__existing">{field==='image_url'&&draft.imageSource==='existing'?'Ya tienes una imagen subida.':`Actual: ${existing}`} Se reemplaza solo si lo marcas.</span>}
            </span></label>;
        })}
      </fieldset>
      {metadata.fields.reference_price&&!metadata.fields.currency&&lookup.selected.has('reference_price')&&<label className="product-import__confirm"><input type="checkbox" checked={lookup.confirmed} onChange={(event)=>lookup.setConfirmed(event.target.checked)} />Confirmé en la tienda que este precio está en {draft.currency}.</label>}
      {lookup.priceIssue&&<p role="status">{lookup.priceIssue}</p>}
      <p>No convertimos monedas ni inferimos talla, ajuste o preferencias personales. La imagen se cargará solo si aplicas ese campo.</p>
      <div className="product-import__actions"><Button variant="secondary" disabled={!enabled || !lookup.selected.size || !!lookup.priceIssue} onClick={lookup.applySelected}>Aplicar campos seleccionados</Button><Button variant="quiet" onClick={lookup.cancel}>Descartar sugerencias</Button></div>
    </section>}
  </div>;
}
