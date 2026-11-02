import 'reflect-metadata';
import 'dotenv/config';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities.js';
import { InitialSchema20261028000000 } from './migrations/20261028000000-InitialSchema.js';
import { RunningRoutines20261029000000 } from './migrations/20261029000000-RunningRoutines.js';
import { StravaImages20261101000000 } from './migrations/20261101000000-StravaImages.js';

export const dbOptions: DataSourceOptions = {
  type: 'mysql', url: process.env.DATABASE_URL,
  entities: ENTITIES,
  migrations: [InitialSchema20261028000000,RunningRoutines20261029000000,StravaImages20261101000000],
  synchronize: true,
  timezone: 'Z',
  charset: 'utf8mb4',
  logging: process.env.TYPEORM_LOGGING === 'true',
};
export const appDataSource = new DataSource(dbOptions);
