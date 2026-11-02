import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ZodError, type ZodType } from 'zod';
export function validate<T>(schema: ZodType<T>, value: unknown): T {
  try { return schema.parse(value); }
  catch (error) {
    if (error instanceof ZodError) throw new BadRequestException(error.issues.map(x => `${x.path.join('.') || 'input'}: ${x.message}`).join('; '));
    throw error;
  }
}
export const day = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
export function dateOnly(value: string): string {
  if (!day.test(value) || Number.isNaN(new Date(`${value}T12:00:00Z`).getTime()) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) throw new BadRequestException('Invalid date (expected YYYY-MM-DD)');
  return value;
}
export function localToday(tz: string): string { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function dayDifference(a: string, b: string): number { return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`))/86400000); }
export function addDays(a: string, amount: number): string { const d = new Date(`${a}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0,10); }
export function fail(message: string, status = HttpStatus.FORBIDDEN): never { throw new HttpException(message, status); }
