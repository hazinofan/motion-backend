import 'dotenv/config';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createObserveModule } from '@nestjs/observe';
import { APP_GUARD } from '@nestjs/core';
import { dbOptions } from './db/data-source.js';
import { AuthController, AuthGuard } from './auth/auth.js';
import { TrainingController, TrainingService } from './training/training.js';
import { StravaImageController } from './training/strava-image.js';
import { HabitsController, HabitsService } from './habits/habits.js';
import { GoalsController } from './goals/goals.js';
import {
  AnalyticsController,
  AnalyticsService,
} from './analytics/analytics.js';
import {
  SharingController,
  PublicSharingController,
} from './sharing/sharing.js';
export const { ObserveModule, ObserveInstrument } = createObserveModule();
@Module({
  imports: [
    TypeOrmModule.forRoot(dbOptions),
    ...(process.env.OBSERVE_APP_KEY && process.env.OBSERVE_APP_SECRET
      ? [
          ObserveModule.forRoot({
            appKey: process.env.OBSERVE_APP_KEY,
            appSecret: process.env.OBSERVE_APP_SECRET,
            serviceId: 'pace-backend', 
          }),
        ]
      : []),
  ],
  controllers: [
    AuthController,
    TrainingController,
    StravaImageController,
    HabitsController,
    GoalsController,
    AnalyticsController,
    SharingController,
    PublicSharingController,
  ],
  providers: [
    TrainingService,
    HabitsService,
    AnalyticsService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
