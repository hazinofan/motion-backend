import { appDataSource } from '../src/db/data-source.js';
try {
  await appDataSource.initialize();
  await appDataSource.undoLastMigration({transaction:'none'});
  console.log('Reverted last TypeORM migration');
} finally { if (appDataSource.isInitialized) await appDataSource.destroy(); }
