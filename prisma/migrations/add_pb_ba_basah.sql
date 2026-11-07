-- BA aktivasi format NextOne: data tambahan + scan BA tanda tangan basah
ALTER TABLE pb_order
  ADD COLUMN IF NOT EXISTS ba_scan VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS ba_data TEXT NULL;
