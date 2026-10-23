-- Já aplicada no projeto Supabase gacfood-etiquetas (recomendação de segurança do Supabase).
alter function public.hoje_sp() set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;
