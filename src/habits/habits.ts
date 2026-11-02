import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Habit, HabitCheckin, User, type HabitKind } from '../db/entities.js';
import type { AuthedRequest } from '../auth/auth.js';
import {
  addDays,
  dateOnly,
  day,
  dayDifference,
  localToday,
  validate,
} from '../core/validate.js';
import { z } from 'zod';
const habitSchema = z.object({
  quitDate: z.string().regex(day).nullable().optional(),
  unitsPerDay: z.coerce.number().min(0).max(200).nullable().optional(),
  costPerUnit: z.coerce.number().min(0).max(100000).nullable().optional(),
  frequencyPerWeek: z.coerce.number().min(0).max(7).nullable().optional(),
  spendingPerWeek: z.coerce.number().min(0).max(100000).nullable().optional(),
  currency: z.string().min(3).max(3).default('MAD'),
});
const checkinSchema = z.object({
  date: z.string().regex(day),
  status: z.enum(['SUCCESS', 'LAPSE']),
  notes: z.string().max(2000).nullable().optional(),
});
function habitKind(kind: string): HabitKind {
  if (kind !== 'CIGARETTES' && kind !== 'ALCOHOL')
    throw new BadRequestException('Unknown habit');
  return kind;
}
@Injectable()
export class HabitsService {
  constructor(private readonly db: DataSource) {}
  async summary(userId: string) {
    const user = await this.db
      .getRepository(User)
      .findOneByOrFail({ id: userId });
    const today = localToday(user.timezone);
    const habits = await this.db
      .getRepository(Habit)
      .find({
        where: { userId },
        relations: { checkins: true },
        order: { kind: 'ASC' },
      });
    return habits.map((h) => {
      const entries = h.checkins
        .filter((c) => c.date <= today && (!h.quitDate || c.date >= h.quitDate))
        .sort((a, b) => a.date.localeCompare(b.date));
      const success = new Set(
        entries.filter((e) => e.status === 'SUCCESS').map((e) => e.date),
      );
      let longestStreak = 0,
        currentRun = 0;
      for (const c of entries) {
        if (c.status === 'LAPSE') {
          currentRun = 0;
          continue;
        }
        const prev = addDays(c.date, -1);
        currentRun = success.has(prev) ? currentRun + 1 : 1;
        longestStreak = Math.max(longestStreak, currentRun);
      }
      let currentStreak = 0;
      let cursor = today;
      if (!success.has(cursor)) cursor = addDays(cursor, -1);
      while (success.has(cursor)) {
        currentStreak++;
        cursor = addDays(cursor, -1);
      }
      const confirmedDays = entries.filter(
        (e) => e.status === 'SUCCESS',
      ).length;
      const cigaretteAvoided =
        h.kind === 'CIGARETTES'
          ? confirmedDays * Number(h.unitsPerDay || 0)
          : 0;
      const saved =
        h.kind === 'CIGARETTES'
          ? cigaretteAvoided * Number(h.costPerUnit || 0)
          : (confirmedDays / 7) * Number(h.spendingPerWeek || 0);
      return {
        id: h.id,
        kind: h.kind,
        quitDate: h.quitDate,
        unitsPerDay: h.unitsPerDay,
        costPerUnit: h.costPerUnit,
        frequencyPerWeek: h.frequencyPerWeek,
        spendingPerWeek: h.spendingPerWeek,
        currency: h.currency,
        checkins: entries,
        currentStreak,
        longestStreak,
        confirmedDays,
        daysSinceQuit: h.quitDate
          ? Math.max(0, dayDifference(today, h.quitDate))
          : null,
        cigarettesAvoided: Math.round(cigaretteAvoided),
        moneySaved: Math.round(saved * 100) / 100,
      };
    });
  }
}
@Controller('habits')
export class HabitsController {
  constructor(
    private readonly db: DataSource,
    private readonly habits: HabitsService,
  ) {}
  @Get() all(@Req() req: AuthedRequest) {
    return this.habits.summary(req.authId);
  }
  @Post(':kind') async configure(
    @Req() req: AuthedRequest,
    @Param('kind') rawKind: string,
    @Body() raw: unknown,
  ) {
    const kind = habitKind(rawKind),
      v = validate(habitSchema, raw);
    if (v.quitDate) dateOnly(v.quitDate);
    const repo = this.db.getRepository(Habit);
    const habit =
      (await repo.findOneBy({ userId: req.authId, kind })) ??
      repo.create({ userId: req.authId, kind, currency: 'MAD' });
    const {
      unitsPerDay,
      costPerUnit,
      frequencyPerWeek,
      spendingPerWeek,
      ...data
    } = v;
    repo.merge(habit, data);
    if (unitsPerDay !== undefined)
      habit.unitsPerDay = unitsPerDay === null ? null : String(unitsPerDay);
    if (costPerUnit !== undefined)
      habit.costPerUnit = costPerUnit === null ? null : String(costPerUnit);
    if (frequencyPerWeek !== undefined)
      habit.frequencyPerWeek =
        frequencyPerWeek === null ? null : String(frequencyPerWeek);
    if (spendingPerWeek !== undefined)
      habit.spendingPerWeek =
        spendingPerWeek === null ? null : String(spendingPerWeek);
    return repo.save(habit);
  }
  @Post(':kind/checkins') async checkin(
    @Req() req: AuthedRequest,
    @Param('kind') rawKind: string,
    @Body() raw: unknown,
  ) {
    const kind = habitKind(rawKind),
      v = validate(checkinSchema, raw);
    dateOnly(v.date);
    const h = await this.db
      .getRepository(Habit)
      .findOneBy({ userId: req.authId, kind });
    if (!h) throw new NotFoundException('Configure this habit first');
    if (!h.quitDate)
      throw new BadRequestException(
        'Set a quit date before recording check-ins',
      );
    const tz = (
      await this.db.getRepository(User).findOneByOrFail({ id: req.authId })
    ).timezone;
    if (v.date > localToday(tz) || v.date < h.quitDate)
      throw new BadRequestException(
        'Check-in date must be between the quit date and today',
      );
    const repo = this.db.getRepository(HabitCheckin);
    const c =
      (await repo.findOneBy({ habitId: h.id, date: v.date })) ??
      repo.create({ habitId: h.id, date: v.date });
    c.status = v.status;
    c.notes = v.notes ?? null;
    return repo.save(c);
  }
}
