import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// A CLI do Prisma (migrate, studio) conecta como app_migrator, dono das tabelas.
// O runtime da aplicação usa DATABASE_URL (app_user, sem BYPASSRLS). Ver docs/DECISIONS.md.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.MIGRATION_DATABASE_URL ?? '',
  },
});
