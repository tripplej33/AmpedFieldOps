-- Allow anon role to read permissions
DROP POLICY IF EXISTS permissions_read_all_anon ON public.permissions;
CREATE POLICY permissions_read_all_anon ON public.permissions
  FOR SELECT TO anon USING (true);
