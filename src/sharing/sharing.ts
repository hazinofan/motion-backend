import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, HttpException, HttpStatus } from '@nestjs/common';
import { createHash,randomBytes } from 'node:crypto';
import { DataSource, Between } from 'typeorm';
import { ShareLink, Activity, Goal } from '../db/entities.js';
import { Public } from '../auth/auth.js';
import type { AuthedRequest } from '../auth/auth.js';
import { AnalyticsService } from '../analytics/analytics.js';
import { HabitsService } from '../habits/habits.js';
import { validate } from '../core/validate.js';
import { z } from 'zod';
const kinds=z.enum(['TRAINING','RUNNING','GYM','HABITS','GOAL']);
const fields=z.object({stats:z.boolean().default(true),calendar:z.boolean().default(false),history:z.boolean().default(false),cigarettes:z.boolean().default(false),alcohol:z.boolean().default(false),goals:z.boolean().default(false)}).strict();
const createSchema=z.object({kind:kinds,visibleFields:fields});
const updateSchema=z.object({enabled:z.boolean().optional(),visibleFields:fields.optional()});
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
@Controller('shares')
export class SharingController {
 constructor(private readonly db:DataSource){}
 @Get() list(@Req() req:AuthedRequest){return this.db.getRepository(ShareLink).find({where:{userId:req.authId},select:{id:true,kind:true,visibleFields:true,enabled:true,createdAt:true,expiresAt:true},order:{createdAt:'DESC'}});}
 @Post() async create(@Req() req:AuthedRequest,@Body() raw:unknown){const v=validate(createSchema,raw);const token=randomBytes(32).toString('base64url');const repo=this.db.getRepository(ShareLink);const created=await repo.save(repo.create({userId:req.authId,kind:v.kind,visibleFields:v.visibleFields,tokenHash:hash(token),enabled:true}));return {id:created.id,kind:created.kind,enabled:created.enabled,token,visibleFields:created.visibleFields};}
 @Patch(':id') async update(@Req() req:AuthedRequest,@Param('id') id:string,@Body() raw:unknown){const repo=this.db.getRepository(ShareLink);const share=await repo.findOneBy({id,userId:req.authId});if(!share)throw new NotFoundException('Share link not found');const v=validate(updateSchema,raw);repo.merge(share,v);const saved=await repo.save(share);return {id:saved.id,kind:saved.kind,enabled:saved.enabled,visibleFields:saved.visibleFields};}
 @Delete(':id') async delete(@Req() req:AuthedRequest,@Param('id') id:string){const repo=this.db.getRepository(ShareLink);const share=await repo.findOneBy({id,userId:req.authId});if(!share)throw new NotFoundException('Share link not found');await repo.remove(share);return {ok:true};}
}
@Public()
@Controller('public')
export class PublicSharingController {
 private hits=new Map<string,{count:number,until:number}>();
 constructor(private readonly db:DataSource,private readonly analytics:AnalyticsService,private readonly habits:HabitsService){}
 @Get(':token') async share(@Param('token') token:string,@Req() req:import('express').Request){
  const ip=req.ip||'unknown';const now=Date.now();const existing=this.hits.get(ip);const count=existing&&existing.until>now?existing.count+1:1;
  this.hits.set(ip,{count,until:now+60000});if(count>60)throw new HttpException('Too many requests',HttpStatus.TOO_MANY_REQUESTS);
  if(!/^[\w-]{40,80}$/.test(token))throw new NotFoundException('Shared page not found');
  const link=await this.db.getRepository(ShareLink).findOne({where:{tokenHash:hash(token)},relations:{user:true}});
  if(!link||!link.enabled||link.expiresAt&&link.expiresAt<new Date())throw new NotFoundException('Shared page not found or revoked');
  const f=fields.parse(link.visibleFields);const today=await this.analytics.today(link.userId);const yearStart=`${today.slice(0,4)}-01-01`;
  const result:Record<string,unknown>={kind:link.kind,owner:link.user.displayName,visibleFields:f};
  if(f.stats){
    const stats=await this.analytics.overview(link.userId,yearStart,today);
    // The public response contains only explicitly permitted aggregate fields.
    if(link.kind==='RUNNING')result.stats={runSessions:stats.runSessions,totalRunKm:stats.totalRunKm,longestRunKm:stats.longestRunKm,paceTrend:stats.paceTrend,runningByWeek:stats.runningByWeek};
    else if(link.kind==='GYM')result.stats={gymSessions:stats.gymSessions,gymVolumeKg:stats.gymVolumeKg,muscles:stats.muscles};
    else if(link.kind==='HABITS')result.stats={};
    else result.stats={completedWorkouts:stats.completedWorkouts,consistency:stats.consistency,runSessions:stats.runSessions,totalRunKm:stats.totalRunKm,gymSessions:stats.gymSessions};
  }
  if(f.calendar&&link.kind==='TRAINING'){
    const sessions=await this.db.getRepository(Activity).find({where:{userId:link.userId,completed:true,date:Between(yearStart,today)},select:{date:true,type:true}});
    const grouped=new Map<string,number>();for(const s of sessions)grouped.set(s.date,(grouped.get(s.date)||0)+1);
    result.calendar=[...grouped].map(([date,count])=>({date,count}));
  }
  if(f.history&&link.kind==='RUNNING')result.history=await this.db.getRepository(Activity).find({where:{userId:link.userId,type:'RUN',completed:true},select:{date:true,distanceMeters:true,durationSeconds:true,runType:true},order:{date:'DESC'},take:20});
  if(f.history&&link.kind==='GYM')result.history=await this.db.getRepository(Activity).find({where:{userId:link.userId,type:'GYM',completed:true},select:{date:true,title:true,durationSeconds:true},order:{date:'DESC'},take:20});
  if(link.kind==='HABITS'&&(f.cigarettes||f.alcohol))result.habits=(await this.habits.summary(link.userId)).filter(h=>h.kind==='CIGARETTES'?f.cigarettes:f.alcohol).map(h=>({kind:h.kind,daysSinceQuit:h.daysSinceQuit,currentStreak:h.currentStreak,longestStreak:h.longestStreak,confirmedDays:h.confirmedDays,checkins:f.calendar?h.checkins.map(c=>({date:c.date,status:c.status})):undefined}));
  if(f.goals)result.goals=await this.db.getRepository(Goal).find({where:{userId:link.userId},select:{title:true,kind:true,targetValue:true,targetDate:true,unit:true}});
  return result;
 }
}
