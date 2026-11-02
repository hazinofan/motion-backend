import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  BadRequestException, Controller, Delete, Get, NotFoundException, Param,
  Post, Req, StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { Activity } from '../db/entities.js';
import type { AuthedRequest } from '../auth/auth.js';

type ImageUpload = { buffer: Buffer; mimetype: string; size: number };
const maxSize = 10 * 1024 * 1024;
const dir = () => resolve(process.cwd(), 'public', 'files', 'strava');

function extension(file: ImageUpload): 'png' | 'jpg' | 'webp' {
  const b = file.buffer;
  if (!b || !b.length || b.length > maxSize) throw new BadRequestException('The screenshot must be smaller than 10 MB');
  if (file.mimetype === 'image/png' && b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (file.mimetype === 'image/jpeg' && b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (file.mimetype === 'image/webp' && b.length >= 12 && b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP') return 'webp';
  throw new BadRequestException('Upload a valid PNG, JPG or WebP Strava screenshot');
}

function diskPath(key: string): string {
  // Files are referenced by generated names only. Never use a user-supplied disk path.
  if (!/^strava\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(key)) throw new NotFoundException('Screenshot not found');
  return join(dir(), basename(key));
}

export async function deleteStravaImage(key: string | null | undefined): Promise<void> {
  if (!key) return;
  try { await unlink(diskPath(key)); } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error('Could not remove Strava screenshot', err);
  }
}

@Controller('activities')
export class StravaImageController {
  constructor(private readonly db: DataSource) {}

  private async getRun(id: string, userId: string) {
    const run = await this.db.getRepository(Activity).findOneBy({ id, userId, type: 'RUN' });
    if (!run) throw new NotFoundException('Run not found');
    return run;
  }

  @Post(':id/strava-image')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: maxSize, files: 1 } }))
  async upload(@Req() req: AuthedRequest, @Param('id') id: string, @UploadedFile() image?: ImageUpload) {
    const run = await this.getRun(id, req.authId);
    if (!image) throw new BadRequestException('Choose a screenshot first');
    const ext = extension(image);
    const key = `strava/${randomUUID()}.${ext}`;
    const target = diskPath(key);
    await mkdir(dir(), { recursive: true });
    await writeFile(target, image.buffer, { flag: 'wx' });
    try {
      await this.db.getRepository(Activity).update({ id, userId: req.authId, type: 'RUN' }, { stravaImagePath: key });
    } catch (err) {
      await deleteStravaImage(key);
      throw err;
    }
    await deleteStravaImage(run.stravaImagePath);
    return { id, stravaImagePath: key };
  }

  @Get(':id/strava-image')
  async view(@Req() req: AuthedRequest, @Param('id') id: string) {
    const run = await this.getRun(id, req.authId);
    if (!run.stravaImagePath) throw new NotFoundException('No screenshot attached to this run');
    const filePath = diskPath(run.stravaImagePath);
    try { await access(filePath); } catch { throw new NotFoundException('Screenshot file missing'); }
    const contentType = filePath.endsWith('.png') ? 'image/png' : filePath.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return new StreamableFile(createReadStream(filePath), {
      type: contentType,
      disposition: 'inline',
    });
  }

  @Delete(':id/strava-image')
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    const run = await this.getRun(id, req.authId);
    if (!run.stravaImagePath) return { ok: true };
    await this.db.getRepository(Activity).update({ id, userId: req.authId }, { stravaImagePath: null });
    await deleteStravaImage(run.stravaImagePath);
    return { ok: true };
  }
}
