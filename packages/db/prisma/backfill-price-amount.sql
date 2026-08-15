-- One-off backfill of Book.priceAmount (minor units) from the free-form price
-- string. Run ONCE against a database that has existing Book rows (e.g. prod at
-- deploy). No-op on an empty local dev DB.
UPDATE "Book"
SET "priceAmount" = ROUND(
  NULLIF(regexp_replace(price, '[^0-9.]', '', 'g'), '')::numeric * 100
)::int
WHERE price IS NOT NULL
  AND regexp_replace(price, '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$';
