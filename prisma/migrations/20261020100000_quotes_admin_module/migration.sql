-- New delegated-admin permission for the Custom Quotation creator. Its own
-- migration because Postgres can't use a new enum value in the same transaction.
ALTER TYPE "public"."AdminModule" ADD VALUE 'QUOTES';
