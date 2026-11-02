import { BadRequestException, Body, Controller, Delete, Get, Injectable, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { DataSource, Between, In, IsNull, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Activity, ActivityExercise, Exercise, PlannedWorkout, RunningRoutineItem, WorkoutTemplate } from '../db/entities.js';
import type { AuthedRequest } from '../auth/auth.js';
import { dateOnly, validate, day } from '../core/validate.js';
import { z } from 'zod';
import { deleteStravaImage } from './strava-image.js';

const types=z.enum(['GYM','RUN','OTHER']);
const statuses=z.enum(['PLANNED','COMPLETED','PARTIAL','SKIPPED','REST']);
const runTypes=z.enum(['EASY','LONG','TEMPO','INTERVALS','RACE','RECOVERY']);
const setSchema=z.object({reps:z.coerce.number().int().min(0).max(10000),weightKg:z.coerce.number().min(0).max(100000),rpe:z.coerce.number().min(1).max(10).nullable().optional(),completed:z.boolean().default(true)});
const activityExerciseSchema=z.object({exerciseId:z.string().uuid(),sets:z.array(setSchema).max(30)});
const activityBase=z.object({
  date:z.string().regex(day),type:types,title:z.string().trim().min(1).max(120),
  durationSeconds:z.coerce.number().int().positive().max(259200).nullable().optional(),
  distanceMeters:z.coerce.number().int().positive().max(500000).nullable().optional(),
  elevationMeters:z.coerce.number().int().min(0).max(30000).nullable().optional(),
  runType:runTypes.nullable().optional(),effort:z.coerce.number().int().min(1).max(10).nullable().optional(),
  avgHeartRate:z.coerce.number().int().min(30).max(240).nullable().optional(),notes:z.string().max(5000).nullable().optional(),
  planId:z.string().uuid().nullable().optional(),completed:z.boolean().default(true),exercises:z.array(activityExerciseSchema).max(35).default([]),
});
const activitySchema=activityBase.superRefine((a,ctx)=>{if(a.type==='RUN'&&(!a.distanceMeters||!a.durationSeconds))ctx.addIssue({code:'custom',message:'Runs require distance and duration',path:['distanceMeters']});});
const planSchema=z.object({date:z.string().regex(day),title:z.string().trim().min(1).max(120),type:types,status:statuses.default('PLANNED'),notes:z.string().max(5000).nullable().optional()});
const runningRoutineSchema=z.object({startDate:z.string().regex(day),items:z.array(z.object({weekday:z.coerce.number().int().min(0).max(6),title:z.string().trim().min(1).max(50),distanceLabel:z.string().trim().min(1).max(20),paceLabel:z.string().trim().min(1).max(12)})).min(1).max(7)});
const templateSchema=z.object({name:z.string().trim().min(1).max(100),exercises:z.array(z.object({exerciseId:z.string().uuid(),sets:z.coerce.number().int().min(1).max(30),reps:z.coerce.number().int().min(1).max(100)})).max(35)});
const exerciseSchema=z.object({name:z.string().trim().min(1).max(100),muscleGroup:z.string().min(1).max(70),equipment:z.string().max(100).nullable().optional()});
function sortedActivity(a:Activity):Activity {
  a.exercises?.sort((x,y)=>x.position-y.position).forEach(e=>e.sets?.sort((x,y)=>x.position-y.position));
  return a;
}
function utcDate(value:string){return new Date(`${value}T12:00:00.000Z`)}
function dateString(value:Date){return value.toISOString().slice(0,10)}
const activityRelations={exercises:{exercise:true,sets:true}} as const;
@Injectable()
export class TrainingService {
 constructor(public readonly db:DataSource) {}
 async ownPlan(id:string,userId:string){const plan=await this.db.getRepository(PlannedWorkout).findOneBy({id,userId});if(!plan)throw new NotFoundException('Planned workout not found');return plan;}
 async ownActivity(id:string,userId:string){const activity=await this.db.getRepository(Activity).findOneBy({id,userId});if(!activity)throw new NotFoundException('Activity not found');return activity;}
 async verifyExercises(userId:string,exerciseIds:string[]) {
   const unique=[...new Set(exerciseIds)];if(!unique.length)return;
   const count=await this.db.getRepository(Exercise).count({where:[{id:In(unique),userId:IsNull()},{id:In(unique),userId}]});
   if(count!==unique.length)throw new BadRequestException('Unknown or inaccessible exercise');
 }
 async materializeRunningRoutine(userId:string,from:string,to:string) {
   const routineRepo=this.db.getRepository(RunningRoutineItem);
   const items=await routineRepo.find({where:{userId,active:true,startDate:LessThanOrEqual(to)}});
   if(!items.length)return;
   const ids=items.map(item=>item.id);
   const existing=await this.db.getRepository(PlannedWorkout).find({where:{userId,routineItemId:In(ids),date:Between(from,to)},select:{routineItemId:true,date:true}});
   const keys=new Set(existing.map(plan=>`${plan.routineItemId}|${plan.date}`));
   const plans:Partial<PlannedWorkout>[]=[];
   for(const item of items){
     const first=utcDate(item.startDate>from?item.startDate:from);
     first.setUTCDate(first.getUTCDate()+((item.weekday-first.getUTCDay()+7)%7));
     for(const cursor=new Date(first);dateString(cursor)<=to;cursor.setUTCDate(cursor.getUTCDate()+7)){
       const date=dateString(cursor),key=`${item.id}|${date}`;
       if(!keys.has(key))plans.push({userId,date,title:`${item.title} · ${item.distanceLabel} km · ${item.paceLabel}/km`,type:'RUN',status:'PLANNED',notes:`Weekly running routine · Target: ${item.distanceLabel} km at ${item.paceLabel}/km`,routineItemId:item.id});
     }
   }
   if(plans.length)await this.db.getRepository(PlannedWorkout).save(plans,{chunk:100});
 }
 async replaceRunningRoutine(userId:string,raw:unknown) {
   const input=validate(runningRoutineSchema,raw);dateOnly(input.startDate);
   return this.db.transaction(async em=>{
     const repo=em.getRepository(RunningRoutineItem);
     const previous=await repo.findBy({userId,active:true});
     if(previous.length){
       const ids=previous.map(item=>item.id);
       await em.getRepository(PlannedWorkout).delete({userId,routineItemId:In(ids),status:'PLANNED',date:MoreThanOrEqual(input.startDate)});
       await repo.update({userId,active:true},{active:false});
     }
     return repo.save(input.items.map(item=>repo.create({...item,userId,startDate:input.startDate,active:true})));
   });
 }
 async createActivity(userId:string,raw:unknown) {
   const input=validate(activitySchema,raw);dateOnly(input.date);
   const exercises=input.exercises??[];
   await this.verifyExercises(userId,exercises.map(e=>e.exerciseId));
   if(input.planId){const p=await this.ownPlan(input.planId,userId);
     if(p.status==='REST')throw new BadRequestException('Rest day cannot have a completed activity');
     if(p.date!==input.date||p.type!==input.type)throw new BadRequestException('Activity date and type must match its planned session');
     if(await this.db.getRepository(Activity).existsBy({planId:input.planId}))throw new BadRequestException('This plan already has an activity');
   }
   const activity=await this.db.transaction(async em=>{
     const repo=em.getRepository(Activity);
     const created=repo.create({userId,date:input.date,type:input.type,title:input.title,
       planId:input.planId??null,durationSeconds:input.durationSeconds??null,distanceMeters:input.distanceMeters??null,
       elevationMeters:input.elevationMeters??null,runType:input.runType??null,effort:input.effort??null,
       avgHeartRate:input.avgHeartRate??null,notes:input.notes??null,completed:input.completed,
       exercises:exercises.map((ex,position)=>({exerciseId:ex.exerciseId,position,
         sets:ex.sets.map((set,i)=>({position:i,reps:set.reps,weightKg:String(set.weightKg),rpe:set.rpe==null?null:String(set.rpe),completed:set.completed}))}))});
     const saved=await repo.save(created);
     if(input.planId)await em.getRepository(PlannedWorkout).update({id:input.planId,userId},{status:input.completed?'COMPLETED':'PARTIAL'});
     return saved;
   });
   return this.db.getRepository(Activity).findOne({where:{id:activity.id,userId},relations:activityRelations}).then(a=>a?sortedActivity(a):activity);
 }
}
@Controller()
export class TrainingController {
 constructor(private readonly service:TrainingService,private readonly db:DataSource) {}
 @Get('calendar') async calendar(@Req() req:AuthedRequest,@Query('from') from?:string,@Query('to') to?:string){
   const start=dateOnly(from||'2026-01-01'),end=dateOnly(to||'2030-12-31');
   await this.service.materializeRunningRoutine(req.authId,start,end);
   const range=Between(start,end);
   const [plans,activities]=await Promise.all([
     this.db.getRepository(PlannedWorkout).find({where:{userId:req.authId,date:range},order:{date:'ASC'}}),
     this.db.getRepository(Activity).find({where:{userId:req.authId,date:range},relations:activityRelations,order:{date:'ASC'}})
   ]);
   return {plans,activities:activities.map(sortedActivity)};
 }
 @Get('running-routine') runningRoutine(@Req() req:AuthedRequest){return this.db.getRepository(RunningRoutineItem).find({where:{userId:req.authId,active:true},order:{weekday:'ASC'}});}
 @Post('running-routine') saveRunningRoutine(@Req() req:AuthedRequest,@Body() raw:unknown){return this.service.replaceRunningRoutine(req.authId,raw);}
 /** Return the original routine targets when opening Log a run from the calendar.
  * The duration is only a target estimate, never claimed to be a measured run. */
 @Get('plans/:id/run-prefill') async runPrefill(@Req() req:AuthedRequest,@Param('id') id:string){
   const plan=await this.service.ownPlan(id,req.authId);
   if(plan.type!=='RUN')throw new BadRequestException('This planned activity is not a run');
   const alreadyLogged=await this.db.getRepository(Activity).findOneBy({planId:id,userId:req.authId});
   if(alreadyLogged)return {existingActivityId:alreadyLogged.id,planId:id};
   const routine=plan.routineItemId?await this.db.getRepository(RunningRoutineItem).findOneBy({id:plan.routineItemId,userId:req.authId}):null;
   // Prefer the saved routine record. Fall back to the text persisted in the plan,
   // including old or manually edited plans without a routine association.
   const fallback=plan.notes?.match(/Target:\s*([\d.,]+(?:\s*[-–]\s*[\d.,]+)?)\s*km\s*at\s*(\d{1,2}:[0-5]\d)\s*\/km/i)
     ||plan.title.match(/([\d.,]+(?:\s*[-–]\s*[\d.,]+)?)\s*km\s*[·•-]\s*(\d{1,2}:[0-5]\d)\s*\/km/i);
   const distanceTarget=routine?.distanceLabel||fallback?.[1]||null;
   const paceTarget=routine?.paceLabel||fallback?.[2]||null;
   const distanceMatch=distanceTarget?.match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:[-–]\s*(\d+(?:[.,]\d+)?))?\s*$/);
   const distanceKm=distanceMatch?Number(distanceMatch[1].replace(',','.')):null;
   const targetPaceMatch=paceTarget?.match(/^(\d{1,2}):([0-5]\d)$/);
   const targetPaceSeconds=targetPaceMatch?Number(targetPaceMatch[1])*60+Number(targetPaceMatch[2]):null;
   const durationSeconds=distanceKm&&targetPaceSeconds?Math.round(distanceKm*targetPaceSeconds):null;
   const title=routine?.title||plan.title.replace(/\s*[·•]\s*[\d.,]+(?:\s*[-–]\s*[\d.,]+)?\s*km\s*[·•]\s*\d{1,2}:[0-5]\d\s*\/km\s*$/i,'');
   const name=title.toLowerCase();
   const runType=name.includes('long')?'LONG':name.includes('tempo')||name.includes('moderate')?'TEMPO':name.includes('interval')?'INTERVALS':name.includes('recover')?'RECOVERY':name.includes('race')?'RACE':'EASY';
   return {planId:id,date:plan.date,title,runType,distanceKm,durationSeconds,
     distanceTarget,paceTarget,isDistanceRange:Boolean(distanceMatch?.[2]),isEstimatedDuration:Boolean(durationSeconds)};
 }
 @Get('plans') plans(@Req() req:AuthedRequest){return this.db.getRepository(PlannedWorkout).find({where:{userId:req.authId},order:{date:'DESC'}});}
 @Post('plans') createPlan(@Req() req:AuthedRequest,@Body() raw:unknown){const v=validate(planSchema,raw);dateOnly(v.date);const repo=this.db.getRepository(PlannedWorkout);if(v.status==='COMPLETED')throw new BadRequestException('Complete a plan by logging an activity');return repo.save(repo.create({...v,userId:req.authId}));}
 @Patch('plans/:id') async updatePlan(@Req() req:AuthedRequest,@Param('id') id:string,@Body() raw:unknown){const plan=await this.service.ownPlan(id,req.authId);const v=validate(planSchema.partial(),raw);if(v.status==='COMPLETED')throw new BadRequestException('Complete a planned workout using its Complete action');if(v.date)dateOnly(v.date);if(await this.db.getRepository(Activity).existsBy({planId:id})&&(v.date&&v.date!==plan.date||v.type&&v.type!==plan.type||v.status==='REST'))throw new BadRequestException('Cannot modify the date, type or rest status of a logged activity');return this.db.getRepository(PlannedWorkout).save(Object.assign(plan,v));}
 @Delete('plans/:id') async deletePlan(@Req() req:AuthedRequest,@Param('id') id:string){const p=await this.service.ownPlan(id,req.authId);await this.db.getRepository(PlannedWorkout).remove(p);return {ok:true};}
 @Post('plans/:id/complete') async completePlan(@Req() req:AuthedRequest,@Param('id') id:string){const p=await this.service.ownPlan(id,req.authId);if(p.status==='REST')throw new BadRequestException('Rest days cannot be completed');if(await this.db.getRepository(Activity).existsBy({planId:id}))throw new BadRequestException('Already logged: edit its activity instead');if(p.type==='RUN')throw new BadRequestException('A run requires distance and duration. Log it through the running form.');return this.service.createActivity(req.authId,{date:p.date,type:p.type,title:p.title,planId:id,completed:true,exercises:[]});}
 @Get('exercises') exercises(@Req() req:AuthedRequest){return this.db.getRepository(Exercise).find({where:[{userId:IsNull()},{userId:req.authId}],order:{name:'ASC'}});}
 @Post('exercises') async createExercise(@Req() req:AuthedRequest,@Body() raw:unknown){const v=validate(exerciseSchema,raw);const repo=this.db.getRepository(Exercise);const existing=await repo.findOne({where:[{name:v.name,userId:IsNull()},{name:v.name,userId:req.authId}]});if(existing)throw new BadRequestException('Exercise already exists');return repo.save(repo.create({name:v.name,muscleGroup:v.muscleGroup,equipment:v.equipment??null,userId:req.authId}));}
 @Get('templates') async templates(@Req() req:AuthedRequest){const data=await this.db.getRepository(WorkoutTemplate).find({where:{userId:req.authId},relations:{exercises:{exercise:true}},order:{createdAt:'DESC'}});return data.map(t=>{t.exercises.sort((a,b)=>a.position-b.position);return t;});}
 @Post('templates') async createTemplate(@Req() req:AuthedRequest,@Body() raw:unknown){const v=validate(templateSchema,raw);await this.service.verifyExercises(req.authId,v.exercises.map(e=>e.exerciseId));const repo=this.db.getRepository(WorkoutTemplate);const t=await repo.save(repo.create({userId:req.authId,name:v.name,exercises:v.exercises.map((e,position)=>({...e,position}))}));return repo.findOne({where:{id:t.id},relations:{exercises:{exercise:true}}});}
 @Delete('templates/:id') async deleteTemplate(@Req() req:AuthedRequest,@Param('id') id:string){const repo=this.db.getRepository(WorkoutTemplate);const t=await repo.findOneBy({id,userId:req.authId});if(!t)throw new NotFoundException('Template not found');await repo.remove(t);return {ok:true};}
 @Get('activities') async activities(@Req() req:AuthedRequest,@Query('type') type?:string,@Query('from') from?:string,@Query('to') to?:string){
   const t=type?validate(types,type):undefined;
   const date=from&&to?Between(dateOnly(from),dateOnly(to)):from?MoreThanOrEqual(dateOnly(from)):to?LessThanOrEqual(dateOnly(to)):undefined;
   const items=await this.db.getRepository(Activity).find({where:{userId:req.authId,type:t,date},relations:activityRelations,order:{date:'DESC',createdAt:'DESC'}});
   return items.map(sortedActivity);
 }
 @Post('activities') createActivity(@Req() req:AuthedRequest,@Body() raw:unknown){return this.service.createActivity(req.authId,raw);}
 @Patch('activities/:id') async updateActivity(@Req() req:AuthedRequest,@Param('id') id:string,@Body() raw:unknown){
   const prev=await this.service.ownActivity(id,req.authId);
   const v=validate(activityBase.partial(),raw);
   if(v.date)dateOnly(v.date);
   if(v.exercises)await this.service.verifyExercises(req.authId,v.exercises.map(e=>e.exerciseId));
   if(v.planId!==undefined&&v.planId!==prev.planId)throw new BadRequestException('Reassigning a planned workout is not supported');
   if(prev.planId&&(v.date||v.type)){const p=await this.service.ownPlan(prev.planId,req.authId);if(v.date&&v.date!==p.date||v.type&&v.type!==p.type)throw new BadRequestException('Linked activity must match its planned date and type');}
   if((v.type??prev.type)==='RUN'&&(!(v.distanceMeters??prev.distanceMeters)||!(v.durationSeconds??prev.durationSeconds)))throw new BadRequestException('Runs require distance and duration');
   const {exercises,planId,...data}=v;
   await this.db.transaction(async em=>{
     const repo=em.getRepository(Activity);
     await repo.update({id,userId:req.authId},data);
     if(exercises){
       await em.getRepository(ActivityExercise).delete({activityId:id});
       await em.getRepository(ActivityExercise).save(exercises.map((e,position)=>em.getRepository(ActivityExercise).create({activityId:id,exerciseId:e.exerciseId,position,sets:e.sets.map((s,i)=>({position:i,reps:s.reps,weightKg:String(s.weightKg),rpe:s.rpe==null?null:String(s.rpe),completed:s.completed}))})));
     }
     if(prev.planId&&v.completed!==undefined)await em.getRepository(PlannedWorkout).update({id:prev.planId,userId:req.authId},{status:v.completed?'COMPLETED':'PARTIAL'});
   });
   const updated=await this.db.getRepository(Activity).findOne({where:{id,userId:req.authId},relations:activityRelations});
   if(!updated)throw new NotFoundException('Activity not found');return sortedActivity(updated);
 }
 @Delete('activities/:id') async deleteActivity(@Req() req:AuthedRequest,@Param('id') id:string){const a=await this.service.ownActivity(id,req.authId);await this.db.transaction(async em=>{await em.getRepository(Activity).delete({id,userId:req.authId});if(a.planId)await em.getRepository(PlannedWorkout).update({id:a.planId,userId:req.authId},{status:'PLANNED'});});await deleteStravaImage(a.stravaImagePath);return {ok:true};}
}
