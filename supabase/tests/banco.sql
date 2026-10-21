-- Testes do banco (rodam num Postgres que imita o Supabase). Qualquer falha aborta com erro.
\set ON_ERROR_STOP on
begin;

-- helpers
create or replace function pg_temp.como(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.erro_de(sqltxt text) returns text language plpgsql as $$
begin execute sqltxt; return null; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.afirmar(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; raise notice 'OK   %', msg; end $$;

-- usuários: o 1º é liberado sozinho, o 2º fica aguardando
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'admin@teste.com');
insert into auth.users (id, email) values ('22222222-2222-2222-2222-222222222222', 'novo@teste.com');
select pg_temp.afirmar((select ativo from perfis where user_id = '11111111-1111-1111-1111-111111111111'), '1º usuário nasce liberado');
select pg_temp.afirmar(not (select ativo from perfis where user_id = '22222222-2222-2222-2222-222222222222'), '2º usuário nasce aguardando liberação');

-- dados base (como dono do banco)
insert into filiais (nome) values ('Matriz');
insert into setores (nome) values ('Cozinha Quente');
insert into pracas (nome) values ('Guarnição'), ('Grill'), ('Fria');
insert into produtos (nome, descricao, filial_id, setor_id, unidade, praca_ids)
  values ('Feijão cozido', 'Feijão preto', (select id from filiais), (select id from setores), 'un', '{}');

-- anônimo não vê nada
set local role anon;
select pg_temp.afirmar(pg_temp.erro_de('select * from produtos') like '%permission denied%', 'anônimo sem acesso a produtos');
select pg_temp.afirmar(pg_temp.erro_de('select * from etiquetas') like '%permission denied%', 'anônimo sem acesso a etiquetas');
reset role;

-- usuário aguardando liberação: RLS não mostra nada e funções negam
select pg_temp.como('22222222-2222-2222-2222-222222222222');
select pg_temp.afirmar((select count(*) from produtos) = 0, 'usuário não liberado não vê produtos');
select pg_temp.afirmar((select count(*) from categorias) = 0, 'usuário não liberado não vê listas');
select pg_temp.afirmar(pg_temp.erro_de('select dashboard_contagens(null)') = 'ACESSO_NEGADO', 'usuário não liberado: dashboard negado');
select pg_temp.afirmar(pg_temp.erro_de($q$insert into pracas (nome) values ('Hack')$q$) like '%row-level security%', 'usuário não liberado não cadastra');
reset role;

-- usuário liberado
select pg_temp.como('11111111-1111-1111-1111-111111111111');
select pg_temp.afirmar((select count(*) from produtos) = 1, 'usuário liberado vê produtos');
select pg_temp.afirmar(pg_temp.erro_de($q$delete from produtos$q$) like '%permission denied%', 'ninguém apaga produtos direto');
select pg_temp.afirmar(pg_temp.erro_de($q$insert into etiquetas (codigo,lote,grupo_id,produto_nome,categoria_nome,dias_validade,validade,responsavel_nome) values ('X','X',gen_random_uuid(),'x','x',1,current_date,'x')$q$) like '%permission denied%', 'etiqueta não é criada direto (só pela função)');
select pg_temp.afirmar(pg_temp.erro_de($q$update etiquetas set status='baixada'$q$) like '%permission denied%', 'etiqueta não é alterada direto');

create temp table _p as select id from produtos limit 1;
grant select on _p to authenticated;

-- gerar 4 etiquetas
create temp table _g as
  select * from gerar_etiquetas((select id from _p), 'Manipulado', 'Refrigerado', array['Guarnição','Grill'],
        2, 'un', 500, 'JBS', '1511', current_date + 30, public.hoje_sp() + 3, 4);
grant select on _g to authenticated;
select pg_temp.afirmar((select count(*) from _g) = 4, 'gerar 4 => 4 etiquetas');
select pg_temp.afirmar((select count(distinct codigo) from _g) = 4, '4 códigos diferentes');
select pg_temp.afirmar((select count(distinct lote) from _g) = 4, '4 lotes diferentes');
select pg_temp.afirmar((select string_agg(right(lote,4), ',' order by lote) from _g) = '0001,0002,0003,0004', 'lotes sequenciais 0001..0004');
select pg_temp.afirmar((select bool_and(length(codigo) = 6) from _g), 'códigos com 6 caracteres');
select pg_temp.afirmar((select bool_and(lote like 'FEI' || to_char(now() at time zone 'America/Sao_Paulo','DDMMYY') || '%') from _g), 'lote usa 3 letras do produto + data de Brasília');
select pg_temp.afirmar((select count(*) from print_jobs) = 4, '4 trabalhos de impressão na fila');
select pg_temp.afirmar((select bool_and(status='pendente') from print_jobs), 'trabalhos nascem pendentes');
select pg_temp.afirmar((select bool_and(dias_validade = 3 and validade = public.hoje_sp()+3) from _g), 'dias_validade = 3');
select pg_temp.afirmar((select bool_and(pracas = array['Guarnição','Grill'] and setor_nome = 'Cozinha Quente' and filial_nome = 'Matriz' and responsavel_nome = 'admin') from _g), 'snapshot: praças, setor, filial, responsável');

-- segunda geração no mesmo dia continua a sequência
create temp table _g2 as select * from gerar_etiquetas((select id from _p), 'manipulado', null, '{}', 1, null, null, null, null, null, public.hoje_sp() + 1, 2);
select pg_temp.afirmar((select string_agg(right(lote,4), ',' order by lote) from _g2) = '0005,0006', 'lotes continuam 0005,0006');
select pg_temp.afirmar((select bool_and(categoria_nome = 'Manipulado' and unidade = 'un') from _g2), 'categoria canônica + unidade do produto');

-- validações (nada gravado nos erros)
select pg_temp.afirmar(pg_temp.erro_de($q$select * from gerar_etiquetas((select id from _p),'Manipulado',null,'{}',1,null,null,null,null,null,public.hoje_sp(),1)$q$) = 'DIAS_VALIDADE_INVALIDOS', 'validade hoje => DIAS_VALIDADE_INVALIDOS');
select pg_temp.afirmar(pg_temp.erro_de($q$select * from gerar_etiquetas((select id from _p),'Manipulado',null,'{}',1,null,null,null,null,null,public.hoje_sp()-2,1)$q$) = 'DIAS_VALIDADE_INVALIDOS', 'validade passada => erro');
select pg_temp.afirmar(pg_temp.erro_de($q$select * from gerar_etiquetas((select id from _p),'Manipulado',null,'{}',1,null,null,null,null,null,public.hoje_sp()+4000,1)$q$) = 'VALIDADE_MUITO_LONGA', 'validade acima de 10 anos => erro');
select pg_temp.afirmar(pg_temp.erro_de($q$select * from gerar_etiquetas((select id from _p),'Manipulado',null,'{}',1,null,null,null,null,null,public.hoje_sp()+2,0)$q$) = 'QUANTIDADE_ETIQUETAS_INVALIDA', 'quantidade 0 => erro');
select pg_temp.afirmar(pg_temp.erro_de($q$select * from gerar_etiquetas((select id from _p),'Manipulado',null,'{}',1,null,null,null,null,null,public.hoje_sp()+2,51)$q$) = 'QUANTIDADE_ETIQUETAS_INVALIDA', 'quantidade 51 => erro');
select pg_temp.afirmar(pg_temp.erro_de($q$select * from gerar_etiquetas((select id from _p),'Inexistente',null,'{}',1,null,null,null,null,null,public.hoje_sp()+2,1)$q$) = 'CATEGORIA_INVALIDA', 'categoria inexistente => erro');
select pg_temp.afirmar(pg_temp.erro_de($q$select * from gerar_etiquetas((select id from _p),'Manipulado',null,array['Nao existe'],1,null,null,null,null,null,public.hoje_sp()+2,1)$q$) = 'PRACA_INVALIDA', 'praça inexistente => erro');
select pg_temp.afirmar(pg_temp.erro_de($q$select * from gerar_etiquetas('99999999-9999-9999-9999-999999999999','Manipulado',null,'{}',1,null,null,null,null,null,public.hoje_sp()+2,1)$q$) = 'PRODUTO_NAO_ENCONTRADO', 'produto inexistente => erro');
select pg_temp.afirmar((select count(*) from etiquetas) = 6, 'erros não gravaram nada (continuam 6)');
-- tudo-ou-nada: falha na criação aborta o lote inteiro
select pg_temp.afirmar(pg_temp.erro_de($q$select * from gerar_etiquetas((select id from _p),'Manipulado',null,array['Grill','Nope'],1,null,null,null,null,null,public.hoje_sp()+2,3)$q$) = 'PRACA_INVALIDA', 'praça inválida no meio da lista => erro');
select pg_temp.afirmar((select count(*) from etiquetas) = 6, 'continua 6 após erro');

-- baixar / cancelar
select pg_temp.afirmar((select (baixar_etiqueta((select lower(codigo) from _g order by lote limit 1))).status) = 'baixada', 'baixar etiqueta (código em minúsculo)');
select pg_temp.afirmar(pg_temp.erro_de($q$select baixar_etiqueta((select codigo from _g order by lote limit 1))$q$) = 'ETIQUETA_JA_ENCERRADA', 'baixar de novo => ETIQUETA_JA_ENCERRADA');
select pg_temp.afirmar(pg_temp.erro_de($q$select baixar_etiqueta('ZZZZZZ')$q$) = 'ETIQUETA_NAO_ENCONTRADA', 'código inexistente => erro');
select pg_temp.afirmar(pg_temp.erro_de($q$select cancelar_etiqueta((select codigo from _g order by lote offset 1 limit 1), '  ')$q$) = 'MOTIVO_OBRIGATORIO', 'cancelar sem motivo => erro');
select pg_temp.afirmar((select (cancelar_etiqueta((select codigo from _g order by lote offset 1 limit 1), 'Gerada errada')).status) = 'cancelada', 'cancelar com motivo');

-- reimprimir
select pg_temp.afirmar((select reimprimir_etiqueta((select id from _g limit 1), 3)) is not null, 'reimprimir 3 vias');
select pg_temp.afirmar((select count(*) from print_jobs) = 6 + 3, 'fila = 6 + 3 vias');
select pg_temp.afirmar(pg_temp.erro_de($q$select reimprimir_etiqueta((select id from _g limit 1), 51)$q$) = 'QUANTIDADE_ETIQUETAS_INVALIDA', 'reimprimir 51 => erro');

-- dashboard
reset role;
update etiquetas set validade = public.hoje_sp() - 1 where id = (select id from _g order by lote offset 2 limit 1);  -- vira vencida (ativa e vencida)
select pg_temp.como('11111111-1111-1111-1111-111111111111');
select pg_temp.afirmar((dashboard_contagens(null)::jsonb) = '{"geradas":6,"ativas":4,"baixadas":1,"canceladas":1,"vencidas":1}'::jsonb, 'dashboard: geradas 6, ativas 4, baixadas 1, canceladas 1, vencidas 1');
select pg_temp.afirmar((select count(*) from etiquetas_v where situacao = 'vencida') = 1, 'view: 1 vencida');
select pg_temp.afirmar((dashboard_contagens((select id from filiais))::jsonb ->> 'geradas') = '6', 'dashboard filtrado por filial');
select pg_temp.afirmar((dashboard_contagens('99999999-9999-9999-9999-999999999999')::jsonb ->> 'geradas') = '0', 'dashboard de outra filial = 0');

-- agente de impressão: fila em ordem, 1 por vez, sem repetir
create temp table _j as select agente_proximo_trabalho((select id from filiais))::jsonb as j;
select pg_temp.afirmar((select (j -> 'etiqueta' ->> 'codigo') = (select codigo from _g order by lote limit 1) from _j), 'agente pega o 1º da fila (FIFO)');
select pg_temp.afirmar((select count(*) from print_jobs where status = 'imprimindo') = 1, 'só 1 trabalho em impressão');
select pg_temp.afirmar((select (agente_proximo_trabalho((select id from filiais))::jsonb -> 'etiqueta' ->> 'codigo') <> (select j -> 'etiqueta' ->> 'codigo' from _j)), 'próximo pedido traz OUTRA etiqueta (nunca repete)');
select agente_concluir(((select j from _j) ->> 'job_id')::uuid, true, null);
select pg_temp.afirmar((select status from print_jobs where id = ((select j from _j) ->> 'job_id')::uuid) = 'ok', 'concluir => ok');
select pg_temp.afirmar((select (agente_proximo_trabalho(null)::jsonb ->> 'job_id') is not null), 'agente sem filial pega qualquer');

-- trabalho preso > 3 min vira erro (não reimprime sozinho)
reset role;
update print_jobs set iniciado_em = now() - interval '10 minutes' where status = 'imprimindo';
select pg_temp.como('11111111-1111-1111-1111-111111111111');
select agente_proximo_trabalho(null);
select pg_temp.afirmar((select count(*) from print_jobs where status = 'erro' and erro like 'Interrompido%') >= 1, 'trabalho preso vira erro (sem reimprimir sozinho)');

-- liberar usuário
select pg_temp.afirmar(pg_temp.erro_de($q$select alterar_usuario_ativo('11111111-1111-1111-1111-111111111111', false)$q$) = 'NAO_PODE_BLOQUEAR_A_SI_MESMO', 'não bloqueia a si mesmo');
select alterar_usuario_ativo('22222222-2222-2222-2222-222222222222', true);
select pg_temp.afirmar((select ativo from perfis where user_id = '22222222-2222-2222-2222-222222222222'), 'usuário liberado pelo painel');

-- fuso: 02:30 UTC de 20/10 ainda é 19/10 em Brasília
reset role;
select pg_temp.afirmar((('2026-10-20 02:30:00+00'::timestamptz) at time zone 'America/Sao_Paulo')::date = date '2026-10-19', 'Brasília: 02:30 UTC do dia 20 = dia 19');
rollback;
\echo === TESTES DO BANCO CONCLUÍDOS ===
