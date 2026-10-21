-- GACFOOD ETIQUETAS — schema inicial (app independente do GACFOOD)
-- Fuso padrão: America/Sao_Paulo. Todas as datas "de negócio" (lote, validade, vencida) usam o horário de Brasília.

-- ============================================================
-- Funções de apoio
-- ============================================================
create or replace function public.hoje_sp()
returns date language sql stable
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql
as $$ begin new.updated_at = now(); return new; end $$;

-- ============================================================
-- Usuários (perfis) — acesso só para usuários liberados (ativo = true)
-- ============================================================
create table public.perfis (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text,
  ativo boolean not null default false,
  created_at timestamptz not null default now()
);

-- O primeiro usuário criado é liberado automaticamente; os demais ficam aguardando liberação.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.perfis (user_id, nome, email, ativo)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(coalesce(new.email, 'usuario'), '@', 1)),
    new.email,
    not exists (select 1 from public.perfis)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.usuario_ativo()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.perfis where user_id = auth.uid() and ativo) $$;

-- ============================================================
-- Listas que aceitam novos registros (filial, setor, categoria, praça, armazenamento, motivo)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['filiais','setores','categorias','pracas','armazenamentos','motivos_cancelamento'] loop
    execute format($f$
      create table public.%I (
        id uuid primary key default gen_random_uuid(),
        nome text not null check (btrim(nome) <> ''),
        ativo boolean not null default true,
        created_at timestamptz not null default now()
      )$f$, t);
    execute format('create unique index %I on public.%I (lower(btrim(nome)))', t || '_nome_uk', t);
  end loop;
end $$;

insert into public.categorias (nome) values ('Manipulado'), ('Em produção'), ('Resfriado'), ('Congelado'), ('Descongelando');
insert into public.armazenamentos (nome) values ('Refrigerado'), ('Congelado'), ('Ambiente');
insert into public.motivos_cancelamento (nome) values ('Etiqueta gerada errada'), ('Erro de impressão'), ('Produto descartado');

-- ============================================================
-- Configurações da empresa (rodapé da etiqueta)
-- ============================================================
create table public.config (
  chave text primary key,
  valor text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.config (chave, valor) values ('empresa_nome', ''), ('empresa_cnpj', '');

-- ============================================================
-- Produtos (cadastro independente, só para gerar etiquetas)
-- ============================================================
create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  descricao text,
  filial_id uuid references public.filiais(id),
  setor_id uuid references public.setores(id),
  categoria_id uuid references public.categorias(id),
  praca_ids uuid[] not null default '{}',
  unidade text,
  ativo boolean not null default true,
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index produtos_filial_nome_uk
  on public.produtos (coalesce(filial_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(nome)));
create index produtos_nome_idx on public.produtos (lower(nome));
create trigger produtos_updated_at before update on public.produtos
  for each row execute function public.set_updated_at();

-- ============================================================
-- Etiquetas (escritas só pelas funções abaixo)
-- ============================================================
create table public.etiquetas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  lote text not null,
  grupo_id uuid not null,
  produto_id uuid references public.produtos(id) on delete set null,
  produto_nome text not null,
  filial_id uuid references public.filiais(id) on delete set null,
  filial_nome text,
  setor_nome text,
  categoria_nome text not null,
  armazenamento text,
  pracas text[] not null default '{}',
  quantidade_produzida numeric,
  unidade text,
  peso_gramas numeric,
  marca text,
  sif text,
  validade_original date,
  dias_validade integer not null check (dias_validade >= 1),
  validade date not null,
  manipulado_em timestamptz not null default now(),
  status text not null default 'ativa' check (status in ('ativa', 'baixada', 'cancelada')),
  baixada_em timestamptz,
  baixada_por uuid references auth.users(id) on delete set null,
  baixada_por_nome text,
  motivo_cancelamento text,
  responsavel_id uuid references auth.users(id) on delete set null,
  responsavel_nome text not null,
  created_at timestamptz not null default now()
);
create index etiquetas_status_idx on public.etiquetas (status, validade);
create index etiquetas_produto_idx on public.etiquetas (produto_id, created_at desc);
create index etiquetas_filial_idx on public.etiquetas (filial_id);
create index etiquetas_criado_idx on public.etiquetas (created_at desc);
create index etiquetas_grupo_idx on public.etiquetas (grupo_id);

-- Situação calculada no horário de Brasília (vencida = ativa com validade antes de hoje)
create view public.etiquetas_v with (security_invoker = true) as
select e.*,
       (e.status = 'ativa' and e.validade < public.hoje_sp()) as vencida,
       case when e.status = 'ativa' and e.validade < public.hoje_sp() then 'vencida' else e.status end as situacao
from public.etiquetas e;

-- ============================================================
-- Fila de impressão + agentes (computador ligado à impressora)
-- ============================================================
create table public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  ordem bigint generated always as identity,
  etiqueta_id uuid not null references public.etiquetas(id) on delete cascade,
  grupo_id uuid,
  filial_id uuid references public.filiais(id) on delete set null,
  status text not null default 'pendente' check (status in ('pendente', 'imprimindo', 'ok', 'erro')),
  erro text,
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  iniciado_em timestamptz,
  finalizado_em timestamptz
);
create index print_jobs_fila_idx on public.print_jobs (status, ordem);
create index print_jobs_etiqueta_idx on public.print_jobs (etiqueta_id);
create index print_jobs_grupo_idx on public.print_jobs (grupo_id);

create table public.agentes (
  nome text primary key,
  filial_id uuid references public.filiais(id) on delete set null,
  ultimo_contato timestamptz not null default now()
);

-- online = falou com o servidor nos últimos 30 segundos (relógio do servidor, não do celular)
create view public.agentes_v with (security_invoker = true) as
select a.*, (now() - a.ultimo_contato) < interval '30 seconds' as online from public.agentes a;

-- ============================================================
-- Segurança (RLS): só usuário logado E liberado enxerga/edita
-- ============================================================
alter table public.perfis enable row level security;
alter table public.filiais enable row level security;
alter table public.setores enable row level security;
alter table public.categorias enable row level security;
alter table public.pracas enable row level security;
alter table public.armazenamentos enable row level security;
alter table public.motivos_cancelamento enable row level security;
alter table public.config enable row level security;
alter table public.produtos enable row level security;
alter table public.etiquetas enable row level security;
alter table public.print_jobs enable row level security;
alter table public.agentes enable row level security;

-- perfis: cada um vê o próprio; usuários liberados veem todos (para liberar novos). Alteração só pela função.
create policy perfis_select on public.perfis for select to authenticated
  using (user_id = auth.uid() or public.usuario_ativo());

do $$
declare t text;
begin
  foreach t in array array['filiais','setores','categorias','pracas','armazenamentos','motivos_cancelamento'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.usuario_ativo())', t || '_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.usuario_ativo())', t || '_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.usuario_ativo()) with check (public.usuario_ativo())', t || '_upd', t);
  end loop;
end $$;

create policy config_sel on public.config for select to authenticated using (public.usuario_ativo());
create policy config_upd on public.config for update to authenticated using (public.usuario_ativo()) with check (public.usuario_ativo());

create policy produtos_sel on public.produtos for select to authenticated using (public.usuario_ativo());
create policy produtos_ins on public.produtos for insert to authenticated with check (public.usuario_ativo());
create policy produtos_upd on public.produtos for update to authenticated using (public.usuario_ativo()) with check (public.usuario_ativo());

create policy etiquetas_sel on public.etiquetas for select to authenticated using (public.usuario_ativo());
create policy print_jobs_sel on public.print_jobs for select to authenticated using (public.usuario_ativo());
create policy agentes_sel on public.agentes for select to authenticated using (public.usuario_ativo());

-- Privilégios: nada para anônimo; logado só o necessário (o resto passa pelas funções)
revoke all on all tables in schema public from anon, authenticated;
grant select on public.perfis, public.etiquetas_v, public.etiquetas, public.print_jobs, public.agentes, public.agentes_v to authenticated;
grant select, insert, update on public.filiais, public.setores, public.categorias, public.pracas,
  public.armazenamentos, public.motivos_cancelamento, public.produtos to authenticated;
grant select, update (valor, updated_at) on public.config to authenticated;

-- ============================================================
-- Funções de negócio (security definer + checagem de usuário liberado)
-- ============================================================
create or replace function public.exigir_usuario_ativo()
returns void language plpgsql stable security definer set search_path = public, pg_temp
as $$ begin
  if auth.uid() is null or not public.usuario_ativo() then raise exception 'ACESSO_NEGADO'; end if;
end $$;

create or replace function public.gerar_etiquetas(
  p_produto_id uuid,
  p_categoria text,
  p_armazenamento text,
  p_pracas text[],
  p_quantidade_produzida numeric,
  p_unidade text,
  p_peso_gramas numeric,
  p_marca text,
  p_sif text,
  p_validade_original date,
  p_validade date,
  p_quantidade_etiquetas integer
) returns setof public.etiquetas
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_prod public.produtos%rowtype;
  v_cat text;
  v_arm text;
  v_pracas text[] := '{}';
  v_praca text;
  v_nome_praca text;
  v_dias integer;
  v_resp text;
  v_filial text;
  v_setor text;
  v_grupo uuid := gen_random_uuid();
  v_prefixo text;
  v_seq integer;
  v_lote text;
  v_codigo text;
  v_tentativas integer;
  v_id uuid;
  i integer;
  c_chars constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
begin
  perform public.exigir_usuario_ativo();

  if p_quantidade_etiquetas is null or p_quantidade_etiquetas < 1 or p_quantidade_etiquetas > 50 then
    raise exception 'QUANTIDADE_ETIQUETAS_INVALIDA';
  end if;

  select * into v_prod from public.produtos where id = p_produto_id and ativo;
  if not found then raise exception 'PRODUTO_NAO_ENCONTRADO'; end if;

  select nome into v_cat from public.categorias where lower(btrim(nome)) = lower(btrim(coalesce(p_categoria, ''))) and ativo;
  if v_cat is null then raise exception 'CATEGORIA_INVALIDA'; end if;

  if nullif(btrim(coalesce(p_armazenamento, '')), '') is not null then
    select nome into v_arm from public.armazenamentos where lower(btrim(nome)) = lower(btrim(p_armazenamento)) and ativo;
    if v_arm is null then raise exception 'ARMAZENAMENTO_INVALIDO'; end if;
  end if;

  foreach v_praca in array coalesce(p_pracas, '{}') loop
    select nome into v_nome_praca from public.pracas where lower(btrim(nome)) = lower(btrim(v_praca)) and ativo;
    if v_nome_praca is null then raise exception 'PRACA_INVALIDA'; end if;
    if not (v_nome_praca = any (v_pracas)) then v_pracas := v_pracas || v_nome_praca; end if;
  end loop;

  if p_validade is null then raise exception 'VALIDADE_OBRIGATORIA'; end if;
  v_dias := p_validade - public.hoje_sp();
  if v_dias < 1 then raise exception 'DIAS_VALIDADE_INVALIDOS'; end if;
  if v_dias > 3650 then raise exception 'VALIDADE_MUITO_LONGA'; end if;

  select nome into v_resp from public.perfis where user_id = auth.uid();
  select nome into v_filial from public.filiais where id = v_prod.filial_id;
  select nome into v_setor from public.setores where id = v_prod.setor_id;

  -- prefixo do lote: 3 letras do produto (sem acento) + DDMMAA de Brasília
  v_prefixo := substr(rpad(regexp_replace(
                 translate(upper(v_prod.nome), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'),
                 '[^A-Z]', '', 'g'), 3, 'X'), 1, 3)
               || to_char(now() at time zone 'America/Sao_Paulo', 'DDMMYY');
  perform pg_advisory_xact_lock(hashtext('lote:' || v_prod.id::text || v_prefixo));
  select coalesce(max(substr(lote, length(lote) - 3)::integer), 0) into v_seq
    from public.etiquetas where produto_id = v_prod.id and lote like v_prefixo || '%';

  for i in 1..p_quantidade_etiquetas loop
    v_seq := v_seq + 1;
    v_lote := v_prefixo || lpad(v_seq::text, 4, '0');

    v_tentativas := 0;
    loop
      v_codigo := (select string_agg(substr(c_chars, 1 + floor(random() * 36)::integer, 1), '')
                   from generate_series(1, 6));
      exit when not exists (select 1 from public.etiquetas where codigo = v_codigo);
      v_tentativas := v_tentativas + 1;
      if v_tentativas > 30 then raise exception 'CODIGO_INDISPONIVEL'; end if;
    end loop;

    insert into public.etiquetas (
      codigo, lote, grupo_id, produto_id, produto_nome, filial_id, filial_nome, setor_nome,
      categoria_nome, armazenamento, pracas, quantidade_produzida, unidade, peso_gramas, marca, sif,
      validade_original, dias_validade, validade, responsavel_id, responsavel_nome
    ) values (
      v_codigo, v_lote, v_grupo, v_prod.id, v_prod.nome, v_prod.filial_id, v_filial, v_setor,
      v_cat, v_arm, v_pracas, p_quantidade_produzida, coalesce(nullif(btrim(p_unidade), ''), v_prod.unidade),
      p_peso_gramas, nullif(btrim(coalesce(p_marca, '')), ''), nullif(btrim(coalesce(p_sif, '')), ''),
      p_validade_original, v_dias, p_validade, auth.uid(), coalesce(v_resp, 'Usuário')
    ) returning id into v_id;

    insert into public.print_jobs (etiqueta_id, grupo_id, filial_id) values (v_id, v_grupo, v_prod.filial_id);
  end loop;

  return query select * from public.etiquetas where grupo_id = v_grupo order by lote;
end $$;

create or replace function public.reimprimir_etiqueta(p_etiqueta_id uuid, p_copias integer default 1)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_e public.etiquetas%rowtype; v_grupo uuid := gen_random_uuid(); i integer;
begin
  perform public.exigir_usuario_ativo();
  if p_copias is null or p_copias < 1 or p_copias > 50 then raise exception 'QUANTIDADE_ETIQUETAS_INVALIDA'; end if;
  select * into v_e from public.etiquetas where id = p_etiqueta_id;
  if not found then raise exception 'ETIQUETA_NAO_ENCONTRADA'; end if;
  for i in 1..p_copias loop
    insert into public.print_jobs (etiqueta_id, grupo_id, filial_id) values (v_e.id, v_grupo, v_e.filial_id);
  end loop;
  return v_grupo;
end $$;

create or replace function public.baixar_etiqueta(p_codigo text)
returns public.etiquetas language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_e public.etiquetas%rowtype; v_nome text;
begin
  perform public.exigir_usuario_ativo();
  select * into v_e from public.etiquetas where codigo = upper(btrim(coalesce(p_codigo, ''))) for update;
  if not found then raise exception 'ETIQUETA_NAO_ENCONTRADA'; end if;
  if v_e.status <> 'ativa' then raise exception 'ETIQUETA_JA_ENCERRADA'; end if;
  select nome into v_nome from public.perfis where user_id = auth.uid();
  update public.etiquetas
     set status = 'baixada', baixada_em = now(), baixada_por = auth.uid(), baixada_por_nome = coalesce(v_nome, 'Usuário')
   where id = v_e.id returning * into v_e;
  return v_e;
end $$;

create or replace function public.cancelar_etiqueta(p_codigo text, p_motivo text)
returns public.etiquetas language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_e public.etiquetas%rowtype; v_nome text;
begin
  perform public.exigir_usuario_ativo();
  if btrim(coalesce(p_motivo, '')) = '' then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  select * into v_e from public.etiquetas where codigo = upper(btrim(coalesce(p_codigo, ''))) for update;
  if not found then raise exception 'ETIQUETA_NAO_ENCONTRADA'; end if;
  if v_e.status <> 'ativa' then raise exception 'ETIQUETA_JA_ENCERRADA'; end if;
  select nome into v_nome from public.perfis where user_id = auth.uid();
  update public.etiquetas
     set status = 'cancelada', motivo_cancelamento = btrim(p_motivo), baixada_em = now(),
         baixada_por = auth.uid(), baixada_por_nome = coalesce(v_nome, 'Usuário')
   where id = v_e.id returning * into v_e;
  return v_e;
end $$;

create or replace function public.dashboard_contagens(p_filial uuid default null)
returns json language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare r json;
begin
  perform public.exigir_usuario_ativo();
  select json_build_object(
    'geradas',    count(*),
    'ativas',     count(*) filter (where status = 'ativa'),
    'baixadas',   count(*) filter (where status = 'baixada'),
    'canceladas', count(*) filter (where status = 'cancelada'),
    'vencidas',   count(*) filter (where status = 'ativa' and validade < public.hoje_sp())
  ) into r from public.etiquetas where p_filial is null or filial_id = p_filial;
  return r;
end $$;

create or replace function public.alterar_usuario_ativo(p_user_id uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.exigir_usuario_ativo();
  if p_user_id = auth.uid() and not p_ativo then raise exception 'NAO_PODE_BLOQUEAR_A_SI_MESMO'; end if;
  update public.perfis set ativo = p_ativo where user_id = p_user_id;
end $$;

-- ---------- Agente de impressão (computador ligado à impressora) ----------
create or replace function public.agente_ping(p_nome text, p_filial uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.exigir_usuario_ativo();
  insert into public.agentes (nome, filial_id, ultimo_contato) values (p_nome, p_filial, now())
  on conflict (nome) do update set filial_id = excluded.filial_id, ultimo_contato = now();
end $$;

-- Pega UM trabalho por vez (fila em ordem). Nunca repete automaticamente: o que ficou preso vira erro.
create or replace function public.agente_proximo_trabalho(p_filial uuid default null)
returns json language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_job public.print_jobs%rowtype; v_e public.etiquetas%rowtype;
begin
  perform public.exigir_usuario_ativo();

  update public.print_jobs
     set status = 'erro', erro = 'Interrompido: o agente parou durante a impressão. Use Reimprimir.', finalizado_em = now()
   where status = 'imprimindo' and iniciado_em < now() - interval '3 minutes';

  select * into v_job from public.print_jobs
   where status = 'pendente' and (p_filial is null or filial_id is null or filial_id = p_filial)
   order by ordem limit 1 for update skip locked;
  if not found then return null; end if;

  update public.print_jobs set status = 'imprimindo', iniciado_em = now() where id = v_job.id;
  select * into v_e from public.etiquetas where id = v_job.etiqueta_id;

  return json_build_object(
    'job_id', v_job.id,
    'etiqueta', to_jsonb(v_e),
    'empresa_nome', (select valor from public.config where chave = 'empresa_nome'),
    'empresa_cnpj', (select valor from public.config where chave = 'empresa_cnpj')
  );
end $$;

create or replace function public.agente_concluir(p_job_id uuid, p_ok boolean, p_erro text default null)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.exigir_usuario_ativo();
  update public.print_jobs
     set status = case when p_ok then 'ok' else 'erro' end,
         erro = case when p_ok then null else left(coalesce(p_erro, 'Falha ao imprimir'), 500) end,
         finalizado_em = now()
   where id = p_job_id;
end $$;

-- Execução: só usuário logado (nunca anônimo)
revoke all on function public.hoje_sp() from public, anon;
grant execute on function public.hoje_sp() to authenticated;
revoke all on function public.usuario_ativo() from public, anon;
grant execute on function public.usuario_ativo() to authenticated;
revoke all on function public.exigir_usuario_ativo() from public, anon;
grant execute on function public.exigir_usuario_ativo() to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

revoke all on function public.gerar_etiquetas(uuid, text, text, text[], numeric, text, numeric, text, text, date, date, integer) from public, anon;
grant execute on function public.gerar_etiquetas(uuid, text, text, text[], numeric, text, numeric, text, text, date, date, integer) to authenticated;
revoke all on function public.reimprimir_etiqueta(uuid, integer) from public, anon;
grant execute on function public.reimprimir_etiqueta(uuid, integer) to authenticated;
revoke all on function public.baixar_etiqueta(text) from public, anon;
grant execute on function public.baixar_etiqueta(text) to authenticated;
revoke all on function public.cancelar_etiqueta(text, text) from public, anon;
grant execute on function public.cancelar_etiqueta(text, text) to authenticated;
revoke all on function public.dashboard_contagens(uuid) from public, anon;
grant execute on function public.dashboard_contagens(uuid) to authenticated;
revoke all on function public.alterar_usuario_ativo(uuid, boolean) from public, anon;
grant execute on function public.alterar_usuario_ativo(uuid, boolean) to authenticated;
revoke all on function public.agente_ping(text, uuid) from public, anon;
grant execute on function public.agente_ping(text, uuid) to authenticated;
revoke all on function public.agente_proximo_trabalho(uuid) from public, anon;
grant execute on function public.agente_proximo_trabalho(uuid) to authenticated;
revoke all on function public.agente_concluir(uuid, boolean, text) from public, anon;
grant execute on function public.agente_concluir(uuid, boolean, text) to authenticated;
