/**
 * Applies migrations to the database in DATABASE_URL_OWNER (staging/production).
 * The saathi_app role's password is set once by an operator there, not by this script.
 */
import { runMigrations } from './lib/migrate';

const ownerUrl = process.env.DATABASE_URL_OWNER;
if (!ownerUrl) {
  console.error('DATABASE_URL_OWNER is required');
  process.exit(1);
}
const local = /@localhost[:/]/.test(ownerUrl);
runMigrations({ ownerUrl, appUrl: process.env.DATABASE_URL, setAppPassword: local })
  .then(() => console.log('Migrations applied'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
