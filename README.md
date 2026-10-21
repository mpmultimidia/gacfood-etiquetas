# Etiquetas — sistema independente (Vercel + Supabase)

Gera, imprime, baixa e acompanha etiquetas de produção. Não depende do GACFOOD.

## O que tem
- **Dashboard** (primeira tela após o login): cards Geradas, Ativas, Baixadas, Canceladas e Vencidas. Cada card abre a lista; cada etiqueta abre os detalhes (dar baixa, cancelar, reimprimir, usar como base).
- **Etiqueta**: procurar produto (lupa) → histórico de etiquetas do produto → gerar de 1 a 50 etiquetas, com praças múltiplas, dias de validade ligados à data, e **Baixar / consultar** por câmera (QR) ou código.
- **Cadastros**: Produtos (filial, descrição, setor responsável, categoria, praças), Listas (todas aceitam novos registros), Empresa (rodapé da etiqueta) e Usuários (liberar acesso).
- **Agente de impressão** (`agente-impressao/`): programa que roda no computador ligado à impressora e imprime a fila.

Todas as datas usam o **horário de Brasília**, em qualquer aparelho.

## 1. Banco (Supabase)
1. Crie um projeto no Supabase (região São Paulo).
2. Em **SQL Editor**, rode o arquivo `supabase/migrations/20261020000100_schema_inicial.sql`.
3. Em **Authentication → Users → Add user**, crie o primeiro usuário (marque *Auto Confirm User*). **O primeiro usuário já nasce liberado.** Os seguintes ficam aguardando e são liberados em *Cadastros → Usuários*.
4. Em **Authentication → Providers → Email**, desligue *Allow new users to sign up* (só você cria usuários).

## 2. Site (Vercel)
Variáveis de ambiente do projeto:
- `NEXT_PUBLIC_SUPABASE_URL` = URL do projeto (Settings → API)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = chave pública *anon*

A câmera só funciona em **https** (a Vercel já entrega).

## 3. Impressora (computador ligado a ela)
1. Instale o Node.js (versão 20 ou mais nova) nesse computador.
2. Copie a pasta `agente-impressao`, copie `.env.example` para `.env` e preencha (use um usuário só para a impressora).
3. `IMPRESSORA_COMPARTILHAMENTO` = nome do compartilhamento da impressora no Windows (o mesmo já usado no GACFOOD).
4. Dê dois cliques em `iniciar-agente.bat`. No sistema, a aba Etiqueta mostra **🟢 Impressora conectada**.
5. Para iniciar com o Windows, coloque um atalho do `.bat` em `shell:startup`.

Como o agente imprime: uma etiqueta por vez, em ordem, com pausa (`INTERVALO_MS`). **Se falhar, não repete sozinho**: a tela mostra o erro e o botão "Tentar imprimir novamente".

## 4. Uso rápido
Cadastros → Listas/Produtos → Etiqueta → procurar produto → informar dias de validade e **quantidade de etiquetas** → Gerar e imprimir.
Baixa: Etiqueta → *Baixar / consultar* → Escanear com a câmera.

## Segurança
Ninguém sem login enxerga dados. Usuário logado só acessa se estiver **liberado**. Etiquetas só são criadas/alteradas por funções do banco (não direto). O acesso não depende de cargo.
