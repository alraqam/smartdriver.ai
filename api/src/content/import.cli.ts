// CLI entry point for bulk content loads:
//
//   npm run content:import -- ../content/topics.json
//   npm run content:import -- ../content/questions.seed.json --dry-run
//
// Same code path as POST /api/admin/import, so what you validate on the
// command line is exactly what the endpoint would do.
import 'dotenv/config';
import { readFileSync } from 'fs';
import { basename, resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { ImportService } from './import.service';
import { PrismaService } from '../prisma/prisma.service';

async function main() {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const allowMassRetire = args.includes('--allow-mass-retire');

  if (files.length === 0) {
    console.error('Usage: npm run content:import -- <file.json> [more.json ...] [--dry-run] [--allow-mass-retire]');
    process.exit(2);
  }

  const prisma = new PrismaClient() as unknown as PrismaService;
  const svc = new ImportService(prisma);
  let failed = false;

  for (const file of files) {
    const path = resolve(process.cwd(), file);
    try {
      const rows = JSON.parse(readFileSync(path, 'utf8'));
      const r = await svc.import(rows, basename(path), { dryRun, allowMassRetire });
      console.log(
        `${r.dryRun ? '[dry-run] ' : ''}${r.kind.padEnd(9)} ${r.filename}: ` +
          `inserted=${r.inserted} updated=${r.updated} unchanged=${r.skipped}`,
      );
      for (const w of r.warnings) console.warn(`  warning: ${w}`);
    } catch (e: any) {
      failed = true;
      console.error(`FAILED ${file}: ${e?.response?.message || e?.message || e}`);
    }
  }

  await (prisma as unknown as PrismaClient).$disconnect();
  process.exit(failed ? 1 : 0);
}

main();
