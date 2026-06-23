-- ============================================================
-- VECINITY · 012b — Storage: bucket de comprobantes de pago
-- Aplicado vía /pg/query sobre el schema `storage` (self-hosted).
-- Bucket público con paths `colonia/casa/uuid.ext` (la URL solo se
-- expone vía filas RLS por colonia). Endurecer a signed URLs post-launch.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('vecino-comprobantes', 'vecino-comprobantes', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "vecino_comprob_insert" ON storage.objects;
CREATE POLICY "vecino_comprob_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vecino-comprobantes');

DROP POLICY IF EXISTS "vecino_comprob_read" ON storage.objects;
CREATE POLICY "vecino_comprob_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vecino-comprobantes');
