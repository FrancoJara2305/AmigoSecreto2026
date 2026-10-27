-- T06: fictitious LOCAL data only. Not a migration; automatic CLI seeding remains disabled.
-- Run through `npm run seed:local`, never by pasting this file into a remote SQL editor.
-- No tokens, privileged credentials, binary files, Auth users or Storage objects.
begin;
do $$
begin
  if current_setting('app.seed_environment', true) is distinct from 'local' then
    raise exception 'Seed disabled: use the local-only seed runner.';
  end if;
end;
$$;

lock table public.participants, public.gifts in share row exclusive mode;
do $$
declare
  slugs text[] := array['ana','bruno','camila','diego','elena','gabriel','lucia','mateo','natalia','sofia','tomas'];
  demo_id uuid;
  idx integer;
begin
  -- Refuse to mix demo data with other local participants.
  if exists (select 1 from public.participants p where p.id not in (
    select ('11111111-1111-4111-8111-' || lpad(n::text,12,'0'))::uuid from generate_series(1,11) n
  )) then
    raise exception 'Seed refused: this local database already contains non-demo participants. No data was changed.';
  end if;
  for idx in 1..11 loop
    demo_id := ('11111111-1111-4111-8111-' || lpad(idx::text,12,'0'))::uuid;
    if exists (select 1 from public.participants where
      (id = demo_id and slug <> slugs[idx]) or (slug = slugs[idx] and id <> demo_id)) then
      raise exception 'Seed refused: a demo identity conflicts with existing data. No data was changed.';
    end if;
  end loop;
end;
$$;

insert into public.participants (id,name,slug,avatar_key,personal_message,general_preferences,display_order)
values
 ('11111111-1111-4111-8111-000000000001','Ana','ana','star',null,null,1),
 ('11111111-1111-4111-8111-000000000002','Bruno','bruno','reindeer','Siempre hay espacio para una buena historia.','Me gustan la lectura y el café. Prefiero objetos duraderos y colores tierra.',2),
 ('11111111-1111-4111-8111-000000000003','Camila','camila','bell','Un detalle para acompañarme todos los días.','Mis colores favoritos son el crema y el verde. Prefiero prendas de algodón y cortes holgados.',3),
 ('11111111-1111-4111-8111-000000000004','Diego','diego','tree',null,'Me gusta cocinar. Evitar utensilios con piezas difíciles de limpiar.',4),
 ('11111111-1111-4111-8111-000000000005','Elena','elena','snowflake','Entre libros, plantas y una taza de té.','Prefiero tonos suaves. No necesito envoltorios grandes; me encantan los detalles sencillos.',5),
 ('11111111-1111-4111-8111-000000000006','Gabriel','gabriel','gift','Algo útil para mis próximas aventuras.','Disfruto salir a caminar. Negro y azul oscuro son mis colores favoritos.',6),
 ('11111111-1111-4111-8111-000000000007','Lucía','lucia','star','Las pequeñas cosas hacen especial el día.','Me gustan la papelería y las cosas hechas a mano. Evitar fragancias intensas.',7),
 ('11111111-1111-4111-8111-000000000008','Mateo','mateo','reindeer','Música para trabajar y comodidad para pasear.','Prefiero diseños discretos. En ropa suelo usar M, pero revisa las indicaciones de cada opción.',8),
 ('11111111-1111-4111-8111-000000000009','Natalia','natalia','bell','Un poquito de creatividad para esta Navidad.','Me gustan los colores terracota y verde oliva. Prefiero materiales reutilizables.',9),
 ('11111111-1111-4111-8111-000000000010','Sofía','sofia','tree','Regalos para hacer una pausa y disfrutar.','Me gustan las plantas y la cerámica. Evitar objetos demasiado grandes para un departamento pequeño.',10),
 ('11111111-1111-4111-8111-000000000011','Tomás','tomas','gift','Todavía estoy pensando en mis tres ideas.',null,11)
on conflict (id) do nothing;

-- 18 gifts: two empty lists, three with 1 option, three with 2 and three with 3.
-- Existing options are preserved on rerun, including manual local edits.
insert into public.gifts (id,participant_id,position,title,description,reference_price,currency,gift_type,details)
values
 ('22222222-2222-4222-8222-000000000001','11111111-1111-4111-8111-000000000002',1,
  'Una novela de misterio','Una historia que me sorprenda; puede ser de un autor que todavía no conozca.',65,'PEN','object',
  '{"category":"Libros","specifications":"Edición en español, de preferencia tapa blanda","notes":"Evitar sagas que necesiten leer libros anteriores."}'),
 ('22222222-2222-4222-8222-000000000002','11111111-1111-4111-8111-000000000003',1,
  'Polo de algodón','Un básico cómodo para el verano.',49.90,'PEN','clothing',
  '{"subtype":"polo","size":"M","size_system":"Internacional","color":"Crema","alternative_colors":["Verde oliva","Blanco"],"fit":"Holgado","material":"Algodón","notes":"Si el corte es pequeño, puede ser L."}'),
 ('22222222-2222-4222-8222-000000000003','11111111-1111-4111-8111-000000000004',1,
  'Espátula de silicona',null,null,'PEN','object',
  '{"category":"Cocina","material":"Silicona apta para alimentos","specifications":"De una sola pieza y resistente al calor"}'),
 ('22222222-2222-4222-8222-000000000004','11111111-1111-4111-8111-000000000005',1,
  'Taza de cerámica','Para una pausa tranquila con un té.',45,'PEN','object',
  '{"category":"Hogar","color":"Marfil","dimensions":"Entre 300 y 400 ml","material":"Cerámica"}'),
 ('22222222-2222-4222-8222-000000000005','11111111-1111-4111-8111-000000000005',2,
  'Chompa ligera','Una prenda para las tardes frescas.',null,'PEN','clothing',
  '{"subtype":"chompa","size":"S","color":"Lila suave","alternative_colors":["Gris claro"],"fit":"Regular","notes":"Evitar tejidos muy gruesos o que piquen."}'),
 ('22222222-2222-4222-8222-000000000006','11111111-1111-4111-8111-000000000006',1,
  'Botella reutilizable','Para llevar agua en las caminatas.',75,'PEN','object',
  '{"category":"Deporte","color":"Negro","dimensions":"750 ml","material":"Acero inoxidable","specifications":"Tapa hermética; no necesita sorbete"}'),
 ('22222222-2222-4222-8222-000000000007','11111111-1111-4111-8111-000000000006',2,
  'Gorra para caminar',null,39.90,'PEN','clothing',
  '{"subtype":"gorra","size":"Ajustable","color":"Azul oscuro","material":"Tela ligera","notes":"Sin estampados grandes."}'),
 ('22222222-2222-4222-8222-000000000008','11111111-1111-4111-8111-000000000007',1,
  'Cuaderno de hojas punteadas','Para organizar ideas y dibujar un poco.',35,'PEN','object',
  '{"category":"Papelería","dimensions":"A5","specifications":"Papel de al menos 100 g/m²","notes":"Sin fechas impresas."}'),
 ('22222222-2222-4222-8222-000000000009','11111111-1111-4111-8111-000000000007',2,
  'Estuche para lápices',null,null,'PEN','object',
  '{"category":"Papelería","color":"Terracota","material":"Tela","dimensions":"Para unos 10 lápices"}'),
 ('22222222-2222-4222-8222-000000000010','11111111-1111-4111-8111-000000000008',1,
  'Audífonos con cable','Una opción sencilla para escuchar música desde la laptop.',89,'PEN','object',
  '{"category":"Tecnología","color":"Negro","specifications":"Conector USB-C y micrófono integrado","notes":"La conexión USB-C es más importante que la marca."}'),
 ('22222222-2222-4222-8222-000000000011','11111111-1111-4111-8111-000000000008',2,
  'Zapatillas urbanas','Para caminar por la ciudad.',null,'PEN','clothing',
  '{"subtype":"footwear","size":"42","size_system":"EU","color":"Blanco","alternative_colors":["Negro"],"notes":"Confirmar la medida en la guía de la marca; prefiero horma amplia."}'),
 ('22222222-2222-4222-8222-000000000012','11111111-1111-4111-8111-000000000008',3,
  'Soporte plegable para celular',null,29.90,'PEN','object',
  '{"category":"Tecnología","material":"Metal o plástico resistente","specifications":"Ángulo ajustable y base antideslizante"}'),
 ('22222222-2222-4222-8222-000000000013','11111111-1111-4111-8111-000000000009',1,
  'Set de acuarelas','Un set pequeño para empezar a pintar.',85,'PEN','object',
  '{"category":"Arte","specifications":"Entre 12 y 24 colores","notes":"No necesito un set profesional."}'),
 ('22222222-2222-4222-8222-000000000014','11111111-1111-4111-8111-000000000009',2,
  'Bolso de tela','Para llevar un libro y las cosas del día.',null,'PEN','clothing',
  '{"subtype":"bolso","color":"Verde oliva","alternative_colors":["Crudo"],"material":"Lona de algodón","notes":"Con un bolsillo interior sería ideal."}'),
 ('22222222-2222-4222-8222-000000000015','11111111-1111-4111-8111-000000000009',3,
  'Pinceles para acuarela',null,19.90,'USD','object',
  '{"category":"Arte","specifications":"Puntas redondas, tamaños variados","notes":"Precio ficticio en USD para probar que no se convierta automáticamente a soles."}'),
 ('22222222-2222-4222-8222-000000000016','11111111-1111-4111-8111-000000000010',1,
  'Maceta pequeña','Para una planta de escritorio.',30,'PEN','object',
  '{"category":"Jardinería","dimensions":"12 a 15 cm de diámetro","material":"Cerámica","specifications":"Con orificio de drenaje"}'),
 ('22222222-2222-4222-8222-000000000017','11111111-1111-4111-8111-000000000010',2,
  'Pijama de algodón','Algo fresco y cómodo.',79.90,'PEN','clothing',
  '{"subtype":"pijama","size":"M","color":"Azul claro","fit":"Holgado","material":"Algodón","notes":"Prefiero pantalón corto."}'),
 ('22222222-2222-4222-8222-000000000018','11111111-1111-4111-8111-000000000010',3,
  'Libro de relatos cortos',null,null,'PEN','object','{}')
on conflict (participant_id,position) do nothing;

select count(*) as demo_participants from public.participants;
select count(*) as demo_gifts from public.gifts;
commit;
