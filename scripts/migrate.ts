import { appDataSource } from '../src/db/data-source.js';
try {
  await appDataSource.initialize();
  const migrations = await appDataSource.runMigrations({ transaction:'none' });
  console.log('TypeORM migrations applied:', migrations.map(m=>m.name));
} finally { if (appDataSource.isInitialized) await appDataSource.destroy(); }
