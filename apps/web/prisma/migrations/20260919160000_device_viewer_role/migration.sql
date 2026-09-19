-- AlterEnum
-- On its own: Postgres will not let a transaction use an enum value it added,
-- so the backfill that moves every viewer onto it is the next migration.
ALTER TYPE "Role" ADD VALUE 'DEVICE_VIEWER';
