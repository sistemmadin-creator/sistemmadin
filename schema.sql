-- ============================================================================
-- SCHEMA DATABASE: SISTEM PENILAIAN TAHFIDZ SANTRI (SUPABASE POSTGRESQL)
-- ============================================================================

-- Aktifkan ekstensi UUID jika belum aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TABEL MASTER SANTRI
CREATE TABLE IF NOT EXISTS public.santri (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama TEXT NOT NULL CHECK (char_length(trim(nama)) > 0),
    asrama TEXT NOT NULL CHECK (char_length(trim(asrama)) > 0),
    tingkat TEXT NOT NULL CHECK (tingkat IN ('15 Juz', '30 Juz')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indeks pencarian untuk performa tinggi hingga ratusan santri
CREATE INDEX IF NOT EXISTS idx_santri_tingkat ON public.santri(tingkat);
CREATE INDEX IF NOT EXISTS idx_santri_nama ON public.santri(nama);

-- 2. TABEL LOG PENILAIAN TAHFIDZ
CREATE TABLE IF NOT EXISTS public.nilai_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    santri_id UUID NOT NULL REFERENCES public.santri(id) ON DELETE CASCADE,
    tingkat TEXT NOT NULL CHECK (tingkat IN ('15 Juz', '30 Juz')),
    tahap INT NOT NULL CHECK (tahap BETWEEN 1 AND 3),
    tes_ke INT NOT NULL CHECK (tes_ke BETWEEN 1 AND 10),
    nilai_juz_1 NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (nilai_juz_1 >= 0 AND nilai_juz_1 <= 100),
    nilai_juz_2 NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (nilai_juz_2 >= 0 AND nilai_juz_2 <= 100),
    nilai_juz_3 NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (nilai_juz_3 >= 0 AND nilai_juz_3 <= 100),
    nilai_juz_4 NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (nilai_juz_4 >= 0 AND nilai_juz_4 <= 100),
    nilai_juz_5 NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (nilai_juz_5 >= 0 AND nilai_juz_5 <= 100),
    rata_rata NUMERIC(5,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Unique Constraint wajib untuk mendukung operasi UPSERT
    CONSTRAINT unique_penilaian_santri UNIQUE (santri_id, tingkat, tahap, tes_ke)
);

-- Indeks komposit untuk mempercepat query per Tingkat, Tahap, dan Tes Ke-N
CREATE INDEX IF NOT EXISTS idx_nilai_log_filter ON public.nilai_log(tingkat, tahap, tes_ke);
CREATE INDEX IF NOT EXISTS idx_nilai_log_santri ON public.nilai_log(santri_id);

-- 3. FUNCTION & TRIGGER OTOMATISASI RATA-RATA DAN UPDATED_AT
CREATE OR REPLACE FUNCTION public.fn_hitung_rata_rata_nilai()
RETURNS TRIGGER AS $$
BEGIN
    NEW.rata_rata := ROUND(
        (
            COALESCE(NEW.nilai_juz_1, 0) +
            COALESCE(NEW.nilai_juz_2, 0) +
            COALESCE(NEW.nilai_juz_3, 0) +
            COALESCE(NEW.nilai_juz_4, 0) +
            COALESCE(NEW.nilai_juz_5, 0)
        ) / 5.0, 
        2
    );
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hitung_rata_rata ON public.nilai_log;

CREATE TRIGGER trg_hitung_rata_rata
BEFORE INSERT OR UPDATE ON public.nilai_log
FOR EACH ROW
EXECUTE FUNCTION public.fn_hitung_rata_rata_nilai();

-- 4. KONFIGURASI ROW LEVEL SECURITY (RLS) & POLICIES UNTUK ANON KEY
ALTER TABLE public.santri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nilai_log ENABLE ROW LEVEL SECURITY;

-- Hapus policy lama jika script dijalankan ulang
DROP POLICY IF EXISTS "Allow public read-write on santri" ON public.santri;
DROP POLICY IF EXISTS "Allow public read-write on nilai_log" ON public.nilai_log;

-- Buat policy penuh untuk role anon dan authenticated
CREATE POLICY "Allow public read-write on santri"
ON public.santri
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public read-write on nilai_log"
ON public.nilai_log
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 5. DATA CONTOH AWAL (OPSIONAL - BISA DIHAPUS MELALUI APLIKASI)
INSERT INTO public.santri (nama, asrama, tingkat) VALUES
('Ahmad Fauzan Al-Farisi', 'Asrama Abu Bakar', '15 Juz'),
('Muhammad Rizky Pratama', 'Asrama Umar bin Khattab', '15 Juz'),
('Zaidan Abdurrahman', 'Asrama Utsman bin Affan', '30 Juz'),
('Naufal Hibatullah', 'Asrama Ali bin Abi Thalib', '30 Juz')
ON CONFLICT DO NOTHING;
