-- =============================================================================
--  public.registros — el esquema del mural, versionado
-- =============================================================================
--
--  Hasta ahora las politicas y las constraints vivian solo en el panel de
--  Supabase: no se podian revisar en un diff, ni recrear si se perdia el
--  proyecto, ni notar si alguien las cambiaba. Este archivo es el estado
--  deseado de la tabla y se corre en el SQL Editor del panel.
--
--  Es idempotente: cada bloque comprueba antes de crear, asi que se puede
--  correr entero las veces que haga falta sin romper lo que ya esta.
--
--  POR QUE IMPORTA TANTO. El sitio es estatico: el navegador habla directo
--  con la Data API usando `PUBLIC_SUPABASE_ANON_KEY`, que viaja en el bundle
--  y cualquiera puede leer. Las defensas de `@data/seguridad` viven en el
--  navegador y no se aplican a un `curl`. Lo unico que de verdad protege la
--  tabla es lo que esta aqui.
--
-- =============================================================================


-- -----------------------------------------------------------------------------
--  0 · Lo que ya estaba (comprobado contra la base el 2026-11-24)
-- -----------------------------------------------------------------------------
--  RLS activo. Con la llave publica:
--    SELECT  200   permitido  (el mural necesita leerse)
--    INSERT  si    permitido, filtrado por CHECK
--    UPDATE  401   bloqueado
--    DELETE  401   bloqueado
--
--  CHECK ya existentes: registros_nombre_check, registros_edad_check,
--  registros_lugar_origen_check, registros_alimentacion_check,
--  registros_prefiere_check, registros_merece_digna_check,
--  registros_oportunidades_justas_check, registros_perdida_soberania_check,
--  registros_valor_check, registros_mensaje_check.
--
--  Nada de lo de abajo los toca, salvo dos: `registros_prefiere_check` y
--  `registros_perdida_soberania_check`, que la seccion 3 vuelve a escribir
--  porque las dos preguntas que vigilan cambiaron de opciones. Esas dos ya
--  viven aqui. El resto se deja como esta y las constraints nuevas llevan
--  nombre propio, para no pisar definiciones que no estan en este archivo.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
--  1 · Los tres campos que entraban sin validar
-- -----------------------------------------------------------------------------

--  `fecha` era el hueco serio. El timelapse calcula su duracion como
--  `ultimo - primero` (ver `largo` en `src/mural/timelapse.ts`), asi que un
--  solo registro fechado en 1800 convierte la pelicula en dos siglos y aplasta
--  todas las inscripciones reales en el ultimo parpadeo. Y como DELETE esta
--  bloqueado, no se podria borrar sin entrar al panel.
--
--  El rango va estatico y holgado porque una CHECK tiene que ser inmutable:
--  no puede llamar a now(). El cerco fino —que la fecha no se aleje del dia
--  de hoy— lo pone el trigger de la seccion 2.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'registros_fecha_check') then
    alter table public.registros add constraint registros_fecha_check
      check (fecha ~ '^\d{4}-\d{2}-\d{2}$' and fecha >= '2026-01-01' and fecha <= '2031-12-31');
  end if;
end $$;

--  `zona` aceptaba cualquier cosa. Impacto bajo —`remapAll` la recalcula al
--  cargar (ver `cartel.ts`)— pero igual viaja al CSV que la gente descarga.
--  No se fija el patron `zona_NN` a proposito: si manana la ilustracion trae
--  sus regiones con nombre propio, una CHECK estricta rechazaria altas
--  validas. Largo y nada de caracteres de control.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'registros_zona_check') then
    alter table public.registros add constraint registros_zona_check
      check (char_length(zona) between 1 and 40 and zona !~ '[[:cntrl:]]');
  end if;
end $$;

--  `mensaje` solo tenia tope de largo. Un `<script>` guardado es inerte —el
--  front pinta con textContent, comprobado— pero el spam con enlaces no: es
--  una caja de texto publica sin moderacion y sin forma de borrar.
--  Este patron es el mismo de PATRON_URL en `@data/seguridad`, para que el
--  servidor y el navegador rechacen lo mismo.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'registros_mensaje_limpio_check') then
    alter table public.registros add constraint registros_mensaje_limpio_check
      check (
        mensaje !~ '[[:cntrl:]]'
        and mensaje !~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|mx|io|co|xyz|ru|cn|info|biz|me|ly|gg|tv)([^a-z]|$))'
      );
  end if;
end $$;

--  `ocupacion` por si acaso: es el unico campo de texto libre que quedaba sin
--  comprobar. Si ya tiene su CHECK, este bloque no hace nada.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'registros_ocupacion_check') then
    alter table public.registros add constraint registros_ocupacion_check
      check (char_length(ocupacion) <= 80 and ocupacion !~ '[[:cntrl:]]');
  end if;
end $$;


-- -----------------------------------------------------------------------------
--  2 · Rate limit dentro de la API
-- -----------------------------------------------------------------------------
--
--  `@data/seguridad` ya limita los envios, pero lo hace en localStorage: frena
--  a quien usa el formulario y no hace nada contra un `curl` con la llave
--  publica. Las CHECK de arriba validan la *forma* de cada fila; ninguna
--  limita el *volumen*. Sin esto, cualquiera puede insertar filas perfectamente
--  validas hasta llenar la tabla.
--
--  LOS NUMEROS NO SON LOS DEL NAVEGADOR, Y ES A PROPOSITO.
--  El mural se deja en un puesto: en un evento, toda la gente que se registra
--  sale por la misma IP. Copiar aqui el limite del navegador (10 al dia)
--  bloquearia el evento entero en la primera hora. Esto es un tope contra
--  abuso masivo, no un limite por persona: deja pasar un kiosco ocupado
--  —300 altas por hora desde una IP son cinco por minuto, sostenidas— y
--  corta el script que quiere meter cien mil.
--
--  Si el mural se queda en una sola pantalla y no en un evento, estos numeros
--  se pueden bajar mucho. Estan en un solo lugar, abajo.


--  La sal con la que se ofusca la IP. Sin politicas de RLS, asi que la llave
--  publica no puede leerla ni escribirla: solo la alcanza la funcion del
--  trigger, que corre como security definer.
create table if not exists public.config_privada (
  clave text primary key,
  valor text not null
);
alter table public.config_privada enable row level security;

insert into public.config_privada (clave, valor)
values ('sal_ip', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (clave) do nothing;


--  El registro de envios. No guarda la IP sino su huella: la tabla no tiene
--  por que saber de quien es cada alta, solo si viene del mismo sitio que la
--  anterior. Tampoco se enlaza con `registros`, asi que no se puede atar una
--  persona a una IP ni teniendo las dos tablas.
create table if not exists public.envios (
  id      bigserial primary key,
  huella  text        not null,
  creado  timestamptz not null default now()
);
alter table public.envios enable row level security;
-- Sin ninguna politica: con RLS activo, eso niega todo a la llave publica.

create index if not exists envios_huella_creado on public.envios (huella, creado desc);
create index if not exists envios_creado        on public.envios (creado desc);


create or replace function public.limitar_registros()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Los topes. Tocar aqui y en ningun otro lado.
  tope_minuto      constant int := 20;    -- por IP
  tope_hora        constant int := 300;   -- por IP
  tope_dia         constant int := 2000;  -- por IP
  tope_global_min  constant int := 60;    -- todas las IP juntas
  margen_fecha     constant int := 2;     -- dias de holgura contra el reloj

  cabeceras json;
  ip        text;
  sal       text;
  huella_ip text;
  n         int;
begin
  -- La IP tal como la ve el borde. Cloudflare pone `cf-connecting-ip`;
  -- detras de otros proxys llega el primer tramo de `x-forwarded-for`.
  begin
    cabeceras := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    cabeceras := null;
  end;

  ip := coalesce(
    nullif(trim(split_part(cabeceras ->> 'cf-connecting-ip', ',', 1)), ''),
    nullif(trim(split_part(cabeceras ->> 'x-forwarded-for',  ',', 1)), ''),
    'desconocida'
  );

  select valor into sal from public.config_privada where clave = 'sal_ip';
  huella_ip := md5(coalesce(sal, '') || ip);

  -- La fecha no puede alejarse del reloj del servidor. Esto es lo que de
  -- verdad protege al timelapse; la CHECK de arriba es solo el cerco grueso.
  -- El margen cubre la diferencia de huso: `todayIso()` da la fecha local de
  -- quien se registra y `now()` esta en UTC.
  if NEW.fecha::date > (now() at time zone 'utc')::date + margen_fecha
     or NEW.fecha::date < (now() at time zone 'utc')::date - margen_fecha then
    raise exception 'La fecha del registro no coincide con la del servidor.'
      using errcode = 'PT422';
  end if;

  -- Limpieza perezosa: una de cada cien altas barre lo viejo, para no pagar
  -- un DELETE en cada insercion.
  if random() < 0.01 then
    delete from public.envios where creado < now() - interval '3 days';
  end if;

  select count(*) into n from public.envios
   where huella = huella_ip and creado > now() - interval '1 minute';
  if n >= tope_minuto then
    raise exception 'Demasiados registros seguidos. Espera un momento.'
      using errcode = 'PT429';
  end if;

  select count(*) into n from public.envios
   where huella = huella_ip and creado > now() - interval '1 hour';
  if n >= tope_hora then
    raise exception 'Se alcanzo el limite de registros por hora desde esta red.'
      using errcode = 'PT429';
  end if;

  select count(*) into n from public.envios
   where huella = huella_ip and creado > now() - interval '1 day';
  if n >= tope_dia then
    raise exception 'Se alcanzo el limite de registros por dia desde esta red.'
      using errcode = 'PT429';
  end if;

  -- Backstop contra abuso repartido entre muchas IP.
  select count(*) into n from public.envios
   where creado > now() - interval '1 minute';
  if n >= tope_global_min then
    raise exception 'El mural esta recibiendo demasiados registros. Intenta en un momento.'
      using errcode = 'PT429';
  end if;

  insert into public.envios (huella) values (huella_ip);
  return NEW;
end $$;

--  `security definer` con `search_path` fijo: la funcion escribe en tablas que
--  la llave publica no alcanza, y el search_path cerrado evita que alguien
--  con permiso de crear objetos la enganie con una tabla homonima.
revoke all on function public.limitar_registros() from public, anon, authenticated;

drop trigger if exists registros_rate_limit on public.registros;
create trigger registros_rate_limit
  before insert on public.registros
  for each row execute function public.limitar_registros();


-- -----------------------------------------------------------------------------
--  3 · Las dos preguntas que cambiaron (2026-11-26)
-- -----------------------------------------------------------------------------
--
--  `prefiere` dejo de preguntar por el gusto y pregunta por el acceso —que
--  alimentos tiene alguien a la mano—, con tres opciones donde habia dos. Y la
--  perdida se pregunta por la alimentacion tipica, con cuatro causas donde
--  habia tres: la economica no estaba.
--
--  Las columnas NO se renombran. Lo que guardan cambio de significado, pero
--  renombrarlas obligaria a tocar `supabaseRepo`, el CSV que la gente descarga
--  y el banco simulado sin que ningun dato quedara mejor guardado. Lo que
--  cambia son los valores que aceptan:
--
--      prefiere           mexicana | superprocesado | extranjero
--      perdida_soberania  politica | economia | industria | social
--
--  Los tokens salen de `PREGUNTAS` en `src/data/person.ts` y tienen que
--  coincidir letra por letra: el navegador valida contra esa lista
--  (`OPCIONES_VALIDAS` en `@data/seguridad`) y esto valida contra la misma, de
--  los dos lados de la API.
--
--  EL ORDEN IMPORTA. Primero se van las filas con las respuestas de antes y
--  despues se ponen las CHECK: `add constraint` valida lo que ya esta en la
--  tabla, asi que al reves falla con 23514 y no se pone ninguna.
--
--  El DELETE es el unico de todo este archivo y borra de verdad —no hay
--  papelera, y la tabla no deja hacer UPDATE ni DELETE con la llave publica,
--  asi que esto corre en el SQL Editor del panel. Borra solo lo que ya no
--  cabe en las preguntas de hoy: vuelto a correr sobre una tabla al dia no
--  toca nada.
--
--  Para ver cuantas filas se va a llevar, antes de correrlo:
--    select count(*) from public.registros
--     where prefiere not in ('mexicana', 'superprocesado', 'extranjero')
--        or perdida_soberania not in ('politica', 'economia', 'industria', 'social');

delete from public.registros
 where prefiere          not in ('mexicana', 'superprocesado', 'extranjero')
    or perdida_soberania not in ('politica', 'economia', 'industria', 'social');

--  Las dos CHECK se reescriben enteras en vez de agregarse al lado: la vieja
--  rechaza los valores nuevos, asi que convivir no es una opcion. `drop ... if
--  exists` deja el bloque idempotente igual que los de arriba.
alter table public.registros drop constraint if exists registros_prefiere_check;
alter table public.registros add constraint registros_prefiere_check
  check (prefiere in ('mexicana', 'superprocesado', 'extranjero'));

alter table public.registros drop constraint if exists registros_perdida_soberania_check;
alter table public.registros add constraint registros_perdida_soberania_check
  check (perdida_soberania in ('politica', 'economia', 'industria', 'social'));

--  `mapeo_version` no necesita nada: la columna ya esta y las altas nuevas
--  llegan con 4 (ver `MAPPING_VERSION` en `src/data/mapping.ts`). Lo que
--  quede guardado con una version anterior lo remapea el navegador al cargar.


-- -----------------------------------------------------------------------------
--  4 · Comprobar que quedo puesto
-- -----------------------------------------------------------------------------
--  Las constraints de la tabla:
--    select conname from pg_constraint
--     where conrelid = 'public.registros'::regclass and contype = 'c'
--     order by conname;
--
--  Que el trigger este vivo:
--    select tgname, tgenabled from pg_trigger
--     where tgrelid = 'public.registros'::regclass and not tgisinternal;
--
--  Que las dos preguntas que cambiaron acepten lo de hoy y nada mas:
--    select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.registros'::regclass
--       and conname in ('registros_prefiere_check',
--                       'registros_perdida_soberania_check');
--
--  Que no quede ninguna fila con las respuestas de antes:
--    select prefiere, perdida_soberania, count(*) from public.registros
--     group by 1, 2 order by 3 desc;
--
--  Que `envios` y `config_privada` no tengan politicas (o sea, cerradas):
--    select tablename, policyname from pg_policies
--     where tablename in ('envios', 'config_privada');
--    -- debe devolver cero filas
