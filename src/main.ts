import 'dotenv/config';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { AppModule,ObserveInstrument } from './app.module.js';
async function bootstrap() {
  if (!process.env.PACE_SESSION_SECRET || process.env.PACE_SESSION_SECRET.length < 32) throw new Error('Set PACE_SESSION_SECRET >=32 characters in your .env');
  const app=await NestFactory.create(AppModule,process.env.OBSERVE_APP_KEY&&process.env.OBSERVE_APP_SECRET?{instrument:ObserveInstrument}:{});
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({origin:(process.env.FRONTEND_ORIGIN || 'http://localhost:3000').split(',').map(x=>x.trim()),credentials:true});
  await app.listen(Number(process.env.PORT || 4000));
}
bootstrap();
