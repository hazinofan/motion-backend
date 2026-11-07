import { Controller, Get, Injectable, Query, Req } from '@nestjs/common';
import { DataSource, Between } from 'typeorm';
import { Activity, PlannedWorkout, Goal, User } from '../db/entities.js';
import type { AuthedRequest } from '../auth/auth.js';
import { addDays, dateOnly, dayDifference, localToday } from '../core/validate.js';
import { HabitsService } from '../habits/habits.js';
import { TrainingService } from '../training/training.js';

@Injectable()
export class AnalyticsService {
 constructor(public readonly db:DataSource,private readonly habits:HabitsService,private readonly training:TrainingService) {}
 async today(userId:string){const user=await this.db.getRepository(User).findOneByOrFail({id:userId});return localToday(user.timezone);}
 async overview(userId:string,from:string,to:string){
   dateOnly(from);dateOnly(to);
   const today=await this.today(userId);
   const [activities,plans]=await Promise.all([
     this.db.getRepository(Activity).find({where:{userId,date:Between(from,to),completed:true},relations:{exercises:{exercise:true,sets:true}},order:{date:'ASC',createdAt:'ASC'}}),
     this.db.getRepository(PlannedWorkout).find({where:{userId,date:Between(from,to)}})
   ]);
   const eligible=plans.filter(p=>p.status!=='REST'&&p.date<=today);
   const completed=eligible.filter(p=>p.status==='COMPLETED'&&activities.some(a=>a.planId===p.id)).length;
   const consistency=eligible.length?Math.round(completed/eligible.length*100):null;
   const runs=activities.filter(a=>a.type==='RUN');const gym=activities.filter(a=>a.type==='GYM');
   const totalMeters=runs.reduce((a,r)=>a+(r.distanceMeters||0),0);
   const weekRunning=new Map<string,number>();
   const months=new Map<string,{month:string,runKm:number,workouts:number,gymVolume:number}>();
   const muscles=new Map<string,number>();
   let gymVolume=0;
   for(const a of activities){
     const month=a.date.slice(0,7);
     const m=months.get(month)||{month,runKm:0,workouts:0,gymVolume:0};m.workouts++;
     if(a.type==='RUN'){m.runKm+=(a.distanceMeters||0)/1000;
       const d=new Date(`${a.date}T12:00:00Z`);const days=(d.getUTCDay()+6)%7;const monday=addDays(a.date,-days);
       weekRunning.set(monday,(weekRunning.get(monday)||0)+(a.distanceMeters||0)/1000);
     }
     if(a.type==='GYM')for(const ae of a.exercises){
       const vol=ae.sets.filter(s=>s.completed).reduce((total,s)=>total+s.reps*Number(s.weightKg),0);
       gymVolume+=vol;m.gymVolume+=vol;
       muscles.set(ae.exercise.muscleGroup,(muscles.get(ae.exercise.muscleGroup)||0)+1);
     }
     months.set(month,m);
   }
   return {
     from,to,eligiblePlanned:eligible.length,completedPlanned:completed,consistency,
     completedWorkouts:activities.length,skipped:eligible.filter(p=>p.status==='SKIPPED').length,
     gymSessions:gym.length,runSessions:runs.length,otherSessions:activities.length-gym.length-runs.length,
     totalRunKm:Math.round(totalMeters/10)/100,averagePaceSecondsPerKm:runs.length?Math.round(runs.reduce((sum,r)=>sum+(r.durationSeconds||0),0)/(totalMeters/1000)):null,
     longestRunKm:Math.max(0,...runs.map(r=>(r.distanceMeters||0)/1000)),gymVolumeKg:Math.round(gymVolume),
     runningByWeek:[...weekRunning].sort(([a],[b])=>a.localeCompare(b)).map(([week,km])=>({week,km:Math.round(km*100)/100})),
     months:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(m=>({...m,runKm:Math.round(m.runKm*100)/100,gymVolume:Math.round(m.gymVolume)})),
     muscles:[...muscles].sort((a,b)=>b[1]-a[1]).map(([muscle,sets])=>({muscle,sets})),
     paceTrend:runs.filter(r=>r.durationSeconds&&r.distanceMeters).map(r=>({date:r.date,paceSecKm:Math.round(r.durationSeconds!*1000/r.distanceMeters!)})),
     runningPrs:{
       // Exact-distance efforts only; never extrapolate a faster split from a longer run.
       fiveK:runs.filter(r=>r.distanceMeters===5000&&r.durationSeconds).reduce<number|null>((best,r)=>best===null? r.durationSeconds!:Math.min(best,r.durationSeconds!),null),
       tenK:runs.filter(r=>r.distanceMeters===10000&&r.durationSeconds).reduce<number|null>((best,r)=>best===null? r.durationSeconds!:Math.min(best,r.durationSeconds!),null)
     }
   };
 }
 async dashboard(userId:string){
  const today=await this.today(userId);const dow=(new Date(`${today}T12:00:00Z`).getUTCDay()+6)%7;
  const monday=addDays(today,-dow);const year=today.slice(0,4);
  // Materialize repeating workouts before the dashboard reads its upcoming schedule.
  await Promise.all([this.training.materializeGymRoutine(userId,monday,addDays(today,14)),this.training.materializeRunningRoutine(userId,monday,addDays(today,14))]);
  const [week,all,plans,habits,goals]=await Promise.all([
    this.overview(userId,monday,today),
    this.db.getRepository(Activity).find({where:{userId,completed:true,date:Between(`${year}-01-01`,today)},order:{date:'DESC',createdAt:'DESC'}}),
    this.db.getRepository(PlannedWorkout).find({where:{userId,date:Between(today,addDays(today,14))},order:{date:'ASC'}}),
    this.habits.summary(userId),
    this.db.getRepository(Goal).find({where:{userId}})
  ]);
  const counts=new Map<string,{count:number,types:Set<string>,runningKm:number}>();
  for(const a of all){const v=counts.get(a.date)||{count:0,types:new Set<string>(),runningKm:0};v.count++;v.types.add(a.type);v.runningKm+=(a.distanceMeters||0)/1000;counts.set(a.date,v);}
  const contribution=[...counts].map(([date,c])=>({date,count:c.count,types:[...c.types],runningKm:Math.round(c.runningKm*100)/100}));
  let streak=0;let cursor=counts.has(today)?today:addDays(today,-1);
  while(counts.has(cursor)){streak++;cursor=addDays(cursor,-1);}
  return {today,week,streak,contribution,plans,habits,goals,recentActivities:all.slice(0,8),marathonDaysLeft:Math.max(0,dayDifference('2027-01-31',today))};
 }
}
@Controller()
export class AnalyticsController {
 constructor(private readonly analytics:AnalyticsService){}
 @Get('dashboard') dashboard(@Req() req:AuthedRequest){return this.analytics.dashboard(req.authId);}
 @Get('statistics') async stats(@Req() req:AuthedRequest,@Query('from') from?:string,@Query('to') to?:string){const today=await this.analytics.today(req.authId);return this.analytics.overview(req.authId,from||addDays(today,-29),to||today);}
 @Get('contributions') async contributions(@Req() req:AuthedRequest,@Query('year') rawYear?:string){
   const today=await this.analytics.today(req.authId);
   const year=rawYear&&/^20\d{2}$/.test(rawYear)?rawYear:today.slice(0,4);
   const sessions=await this.analytics.db.getRepository(Activity).find({where:{userId:req.authId,completed:true,date:Between(`${year}-01-01`,`${year}-12-31`)},select:{date:true,type:true,distanceMeters:true}});
   const perDay=new Map<string,{count:number,types:Set<string>,runningKm:number}>();
   for(const a of sessions){const row=perDay.get(a.date)||{count:0,types:new Set<string>(),runningKm:0};row.count++;row.types.add(a.type);row.runningKm+=(a.distanceMeters||0)/1000;perDay.set(a.date,row);}
   return [...perDay].map(([date,v])=>({date,count:v.count,types:[...v.types],runningKm:Math.round(v.runningKm*100)/100}));
 }
}
