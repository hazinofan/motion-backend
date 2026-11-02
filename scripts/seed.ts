import 'dotenv/config';
import { scryptSync, randomBytes } from 'node:crypto';
import { appDataSource } from '../src/db/data-source.js';
import { User, Exercise, WorkoutTemplate, Activity, Goal, Habit, type HabitKind } from '../src/db/entities.js';
const email=process.env.PACE_ADMIN_EMAIL?.trim().toLowerCase();
const password=process.env.PACE_ADMIN_PASSWORD;
if(!email||!password||password.length<12||password==='replace-with-a-long-unique-password')throw new Error('Set PACE_ADMIN_EMAIL and a strong PACE_ADMIN_PASSWORD (>=12 chars)');
const salt=randomBytes(16).toString('hex');
const hash=`${salt}:${scryptSync(password,salt,64).toString('hex')}`;
await appDataSource.initialize();
try {
 const users=appDataSource.getRepository(User);
 const firstUser=await users.findOne({where:{}});
 if(firstUser&&firstUser.email!==email)throw new Error('PACE is a single-user app. Existing account email differs from PACE_ADMIN_EMAIL.');
 let user=await users.findOneBy({email});
 if(!user)user=await users.save(users.create({email,passwordHash:hash,displayName:process.env.PACE_ADMIN_NAME||'Athlete',timezone:'Africa/Casablanca'}));
 const exercises:[string,string,string][]=[['Barbell bench press','Chest','Barbell'],['Incline dumbbell press','Chest','Dumbbell'],['Cable fly','Chest','Cable'],['Lat pulldown','Back','Cable'],['Barbell row','Back','Barbell'],['Romanian deadlift','Legs','Barbell'],['Squat','Legs','Barbell'],['Leg press','Legs','Machine'],['Leg curl','Legs','Machine'],['Overhead press','Shoulders','Barbell'],['Lateral raise','Shoulders','Dumbbell'],['Biceps curl','Arms','Dumbbell'],['Triceps extension','Arms','Cable'],['Pull-up','Back','Bodyweight']];
 const exRepo=appDataSource.getRepository(Exercise);
 for(const [name,muscleGroup,equipment] of exercises){
   const shared=await exRepo.createQueryBuilder('e').where('e.userId IS NULL AND e.name = :name',{name}).getOne();
   if(!shared)await exRepo.save(exRepo.create({userId:null,name,muscleGroup,equipment}));
 }
 const presets:[string,string[]][]=[
  ['Chest + Back',['Barbell bench press','Incline dumbbell press','Lat pulldown','Barbell row']],
  ['Lower Body',['Squat','Romanian deadlift','Leg press','Leg curl']],
  ['Shoulders + Arms',['Overhead press','Lateral raise','Biceps curl','Triceps extension']],
  ['Full Body',['Squat','Barbell bench press','Barbell row','Overhead press']]
 ];
 const templateRepo=appDataSource.getRepository(WorkoutTemplate);
 const allExercises=await exRepo.createQueryBuilder('e').where('e.userId IS NULL').getMany();
 for(const [name,names] of presets){
   if(await templateRepo.findOneBy({userId:user.id,name}))continue;
   await templateRepo.save(templateRepo.create({userId:user.id,name,exercises:names.map((n,position)=>({exerciseId:allExercises.find(e=>e.name===n)!.id,position,sets:3,reps:10}))}));
 }
 const activityRepo=appDataSource.getRepository(Activity);
 const runs:[string,number,number][]=[['2026-09-06',12630,3724],['2026-10-20',5020,1285],['2026-10-27',4010,1247]];
 for(const [date,distanceMeters,durationSeconds] of runs){
   const seedKey=`initial-run-${date}`;
   if(!await activityRepo.findOneBy({seedKey}))await activityRepo.save(activityRepo.create({userId:user.id,seedKey,date,type:'RUN',title:'Outdoor run',runType:'EASY',distanceMeters,durationSeconds,completed:true}));
 }
 const goals=appDataSource.getRepository(Goal);
 if(!await goals.findOneBy({userId:user.id,slug:'marrakech-marathon-2027'}))await goals.save(goals.create({userId:user.id,slug:'marrakech-marathon-2027',title:'Marrakech Marathon 2027',kind:'MARATHON',targetValue:'10799',unit:'seconds',targetDate:'2027-01-31',description:'42.195 km · sub-3-hour goal (2:59:59) · approx. 4:16/km'}));
 const habits=appDataSource.getRepository(Habit);
 for(const kind of ['CIGARETTES','ALCOHOL'] as HabitKind[])if(!await habits.findOneBy({userId:user.id,kind}))await habits.save(habits.create({userId:user.id,kind,currency:'MAD'}));
 console.log('Seeded PACE account, starter exercises, running history and marathon goal for',email);
} finally {if(appDataSource.isInitialized)await appDataSource.destroy();}
