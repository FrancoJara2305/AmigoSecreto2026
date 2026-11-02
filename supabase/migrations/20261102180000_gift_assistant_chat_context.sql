-- Gift assistant chat: one conversation per person, so the context is the person's published
-- preferences plus all of their public gifts. Same quotas as before; still server-only.
drop function public.server_assistant(uuid,uuid);

create function public.server_assistant(p_participant_id uuid)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb; person jsonb; items jsonb;
begin
  if p_participant_id is null then
    return jsonb_build_object('ok',false,'status',422,'error','INVALID_REQUEST');
  end if;
  -- Lock order: global minute -> global day -> context. Attempts count even when the context is
  -- missing, so probing identifiers spends the same budget.
  result:=private.consume_quota('assistant','global',decode(repeat('00',32),'hex'),60,10);
  if not (result->>'ok')::boolean then return result; end if;
  result:=private.consume_quota('assistant','global',decode(repeat('00',32),'hex'),86400,200);
  if not (result->>'ok')::boolean then return result; end if;

  -- Public catalogue fields only: no name, slug, photo, message or credential data.
  select jsonb_build_object('id',p.id,'general_preferences',p.general_preferences)
    into person from public.participants p where p.id=p_participant_id;
  if person is null then return jsonb_build_object('ok',false,'status',404,'error','NOT_FOUND'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('position',g.position,'title',g.title,'description',g.description,'gift_type',g.gift_type,
      'details',g.details,'reference_price',g.reference_price,'currency',g.currency,'product_url',g.product_url) order by g.position),'[]'::jsonb)
    into items from public.gifts g where g.participant_id=p_participant_id;
  return jsonb_build_object('ok',true,'participant',person,'gifts',items);
end;
$$;

revoke all on function public.server_assistant(uuid) from public,anon,authenticated;
grant execute on function public.server_assistant(uuid) to service_role;
