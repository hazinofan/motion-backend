import 'dotenv/config';
import {Test} from '@nestjs/testing';
import type {INestApplication} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import {AppModule} from '../src/app.module.js';
// Requires a running MySQL instance, an applied migration and a seeded user.
const ready=!!process.env.DATABASE_URL&&!!process.env.PACE_ADMIN_EMAIL&&!!process.env.PACE_ADMIN_PASSWORD&&!!process.env.PACE_SESSION_SECRET;
describe.skipIf(!ready)('PACE API (e2e)',()=>{
 let app:INestApplication;
 beforeAll(async()=>{const testing=await Test.createTestingModule({imports:[AppModule]}).compile();app=testing.createNestApplication();app.use(cookieParser());app.setGlobalPrefix('api');await app.init()});
 afterAll(async()=>app?.close());
 it('blocks anonymous private requests',async()=>{await request(app.getHttpServer()).get('/api/dashboard').expect(401)});
 it('signs in and loads real seeded data',async()=>{
  const res=await request(app.getHttpServer()).post('/api/auth/login').send({email:process.env.PACE_ADMIN_EMAIL,password:process.env.PACE_ADMIN_PASSWORD}).expect(201);
  expect(res.headers['set-cookie']).toBeDefined();
  const cookie=res.headers['set-cookie'][0].split(';')[0];
  const dash=await request(app.getHttpServer()).get('/api/dashboard').set('Cookie',cookie).expect(200);
  expect(dash.body.week).toBeDefined();
  expect(dash.body.marathonDaysLeft).toBeGreaterThanOrEqual(0);
 });
});
