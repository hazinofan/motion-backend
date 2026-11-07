import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ActivityType = 'GYM' | 'RUN' | 'OTHER';
export type PlanStatus = 'PLANNED' | 'COMPLETED' | 'PARTIAL' | 'SKIPPED' | 'REST';
export type RunType = 'EASY' | 'LONG' | 'TEMPO' | 'INTERVALS' | 'RACE' | 'RECOVERY';
export type HabitKind = 'CIGARETTES' | 'ALCOHOL';
export type CheckinStatus = 'SUCCESS' | 'LAPSE';
export type GoalKind = 'RUN_DISTANCE' | 'RUN_TIME' | 'STRENGTH' | 'CONSISTENCY' | 'HABIT' | 'CUSTOM' | 'MARATHON';
export type ShareKind = 'TRAINING' | 'RUNNING' | 'GYM' | 'HABITS' | 'GOAL';
export const ACTIVITY_TYPES: ActivityType[] = ['GYM','RUN','OTHER'];
export const PLAN_STATUSES: PlanStatus[] = ['PLANNED','COMPLETED','PARTIAL','SKIPPED','REST'];
export const RUN_TYPES: RunType[] = ['EASY','LONG','TEMPO','INTERVALS','RACE','RECOVERY'];
export const HABIT_KINDS: HabitKind[] = ['CIGARETTES','ALCOHOL'];
export const CHECKIN_STATUSES: CheckinStatus[] = ['SUCCESS','LAPSE'];
export const GOAL_KINDS: GoalKind[] = ['RUN_DISTANCE','RUN_TIME','STRENGTH','CONSISTENCY','HABIT','CUSTOM','MARATHON'];
export const SHARE_KINDS: ShareKind[] = ['TRAINING','RUNNING','GYM','HABITS','GOAL'];

@Entity('user')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({unique:true}) @Column({type:'varchar',length:191}) email: string;
  @Column({type:'varchar',length:191}) passwordHash: string;
  @Column({type:'varchar',length:191,default:'Athlete'}) displayName: string;
  @Column({type:'varchar',length:191,default:'Africa/Casablanca'}) timezone: string;
  @CreateDateColumn({type:'datetime',precision:3,default:()=> 'CURRENT_TIMESTAMP(3)'}) createdAt: Date;
}
@Entity('plannedworkout')
@Index(['userId','date'])
@Index(['routineItemId','date'],{unique:true})
@Index(['gymRoutineItemId','gymRoutineWeekStart'],{unique:true})
export class PlannedWorkout {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({type:'varchar',length:191}) userId:string;
  @ManyToOne(()=>User,{onDelete:'CASCADE'}) @JoinColumn({name:'userId'}) user:User;
  @Column({type:'varchar',length:10}) date:string;
  @Column({type:'varchar',length:191}) title:string;
  @Column({type:'enum',enum:ACTIVITY_TYPES}) type:ActivityType;
  @Column({type:'enum',enum:PLAN_STATUSES,default:'PLANNED'}) status:PlanStatus;
  @Column({type:'text',nullable:true}) notes:string|null;
  @Column({type:'varchar',length:191,nullable:true}) routineItemId:string|null;
  @ManyToOne(()=>RunningRoutineItem,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'routineItemId'}) routineItem?:RunningRoutineItem|null;
  @Index() @Column({type:'varchar',length:191,nullable:true}) gymRoutineItemId:string|null;
  @Column({type:'varchar',length:10,nullable:true}) gymRoutineWeekStart:string|null;
  @ManyToOne(()=>GymRoutineItem,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'gymRoutineItemId'}) gymRoutineItem?:GymRoutineItem|null;
  @OneToOne(()=>Activity,a=>a.plan) activity?:Activity|null;
  @CreateDateColumn({type:'datetime',precision:3,default:()=> 'CURRENT_TIMESTAMP(3)'}) createdAt:Date;
  @UpdateDateColumn({type:'datetime',precision:3,default:()=> 'CURRENT_TIMESTAMP(3)',onUpdate:'CURRENT_TIMESTAMP(3)'}) updatedAt:Date;
}
@Entity('gymroutineitem')
@Index(['userId','active'])
export class GymRoutineItem {
  @PrimaryGeneratedColumn('uuid') id:string;
  @Column({type:'varchar',length:191}) userId:string;
  @ManyToOne(()=>User,{onDelete:'CASCADE'}) @JoinColumn({name:'userId'}) user:User;
  @Column({type:'int'}) weekday:number;
  @Column({type:'varchar',length:120}) title:string;
  @Column({type:'varchar',length:191,nullable:true}) templateId:string|null;
  @ManyToOne(()=>WorkoutTemplate,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'templateId'}) template?:WorkoutTemplate|null;
  @Column({type:'varchar',length:10}) startDate:string;
  @Column({type:'boolean',default:true}) active:boolean;
  @OneToMany(()=>PlannedWorkout,p=>p.gymRoutineItem) plans:PlannedWorkout[];
  @CreateDateColumn({type:'datetime',precision:3,default:()=> 'CURRENT_TIMESTAMP(3)'}) createdAt:Date;
}
@Entity('runningroutineitem')
@Index(['userId','active'])
export class RunningRoutineItem {
  @PrimaryGeneratedColumn('uuid') id:string;
  @Column({type:'varchar',length:191}) userId:string;
  @ManyToOne(()=>User,{onDelete:'CASCADE'}) @JoinColumn({name:'userId'}) user:User;
  @Column({type:'int'}) weekday:number;
  @Column({type:'varchar',length:191}) title:string;
  @Column({type:'varchar',length:30}) distanceLabel:string;
  @Column({type:'varchar',length:20}) paceLabel:string;
  @Column({type:'varchar',length:10}) startDate:string;
  @Column({type:'boolean',default:true}) active:boolean;
  @OneToMany(()=>PlannedWorkout,p=>p.routineItem) plans:PlannedWorkout[];
  @CreateDateColumn({type:'datetime',precision:3,default:()=> 'CURRENT_TIMESTAMP(3)'}) createdAt:Date;
}
/** One audit record per weekly-plan edit. It also prevents recurrence regeneration for that week. */
@Entity('runningweekchange')
@Index('IDX_runningweekchange_user_week',['userId', 'weekStart'])
export class RunningWeekChange {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({type:'varchar',length:191}) userId: string;
  @ManyToOne(()=>User,{onDelete:'CASCADE'}) @JoinColumn({name:'userId'}) user: User;
  @Column({type:'varchar',length:10}) weekStart: string;
  @Column({type:'varchar',length:30}) reason: string;
  @Column({type:'varchar',length:500,nullable:true}) details: string|null;
  @Column({type:'json'}) changes: Record<string,unknown>[];
  @CreateDateColumn({type:'datetime',precision:3,default:()=> 'CURRENT_TIMESTAMP(3)'}) createdAt: Date;
}
@Entity('activity')
@Index(['userId','date'])
@Index(['userId','type','date'])
export class Activity {
  @PrimaryGeneratedColumn('uuid') id:string;
  @Column({type:'varchar',length:191}) userId:string;
  @ManyToOne(()=>User,{onDelete:'CASCADE'}) @JoinColumn({name:'userId'}) user:User;
  @Index({unique:true}) @Column({type:'varchar',length:191,nullable:true}) planId:string|null;
  @OneToOne(()=>PlannedWorkout,p=>p.activity,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'planId'}) plan?:PlannedWorkout|null;
  @Index({unique:true}) @Column({type:'varchar',length:191,nullable:true}) seedKey:string|null;
  @Column({type:'varchar',length:10}) date:string;
  @Column({type:'enum',enum:ACTIVITY_TYPES}) type:ActivityType;
  @Column({type:'varchar',length:191}) title:string;
  @Column({type:'int',nullable:true}) durationSeconds:number|null;
  @Column({type:'int',nullable:true}) distanceMeters:number|null;
  @Column({type:'int',nullable:true}) elevationMeters:number|null;
  @Column({type:'enum',enum:RUN_TYPES,nullable:true}) runType:RunType|null;
  @Column({type:'int',nullable:true}) effort:number|null;
  @Column({type:'int',nullable:true}) avgHeartRate:number|null;
  @Column({type:'text',nullable:true}) notes:string|null;
  @Column({type:'varchar',length:255,nullable:true}) stravaImagePath:string|null;
  @Column({type:'boolean',default:true}) completed:boolean;
  @OneToMany(()=>ActivityExercise,ae=>ae.activity,{cascade:['insert']}) exercises:ActivityExercise[];
  @CreateDateColumn({type:'datetime',precision:3,default:()=> 'CURRENT_TIMESTAMP(3)'}) createdAt:Date;
  @UpdateDateColumn({type:'datetime',precision:3,default:()=> 'CURRENT_TIMESTAMP(3)',onUpdate:'CURRENT_TIMESTAMP(3)'}) updatedAt:Date;
}
@Entity('exercise')
@Index(['userId','name'])
export class Exercise {
  @PrimaryGeneratedColumn('uuid') id:string;
  @Column({type:'varchar',length:191,nullable:true}) userId:string|null;
  @ManyToOne(()=>User,{onDelete:'CASCADE',nullable:true}) @JoinColumn({name:'userId'}) user?:User|null;
  @Column({type:'varchar',length:191}) name:string;
  @Column({type:'varchar',length:191}) muscleGroup:string;
  @Column({type:'varchar',length:191,nullable:true}) equipment:string|null;
}
@Entity('workouttemplate')
export class WorkoutTemplate {
  @PrimaryGeneratedColumn('uuid') id:string;
  @Column({type:'varchar',length:191}) userId:string;
  @ManyToOne(()=>User,{onDelete:'CASCADE'}) @JoinColumn({name:'userId'}) user:User;
  @Column({type:'varchar',length:191}) name:string;
  @OneToMany(()=>TemplateExercise,e=>e.template,{cascade:['insert']}) exercises:TemplateExercise[];
  @CreateDateColumn({type:'datetime',precision:3,default:()=> 'CURRENT_TIMESTAMP(3)'}) createdAt:Date;
}
@Entity('templateexercise')
export class TemplateExercise {
  @PrimaryGeneratedColumn('uuid') id:string;
  @Column({type:'varchar',length:191}) templateId:string;
  @ManyToOne(()=>WorkoutTemplate,t=>t.exercises,{onDelete:'CASCADE'}) @JoinColumn({name:'templateId'}) template:WorkoutTemplate;
  @Column({type:'varchar',length:191}) exerciseId:string;
  @ManyToOne(()=>Exercise,{onDelete:'RESTRICT'}) @JoinColumn({name:'exerciseId'}) exercise:Exercise;
  @Column({type:'int',default:3}) sets:number;
  @Column({type:'int',default:10}) reps:number;
  @Column({type:'int',default:0}) position:number;
}
@Entity('activityexercise')
export class ActivityExercise {
  @PrimaryGeneratedColumn('uuid') id:string;
  @Column({type:'varchar',length:191}) activityId:string;
  @ManyToOne(()=>Activity,a=>a.exercises,{onDelete:'CASCADE'}) @JoinColumn({name:'activityId'}) activity:Activity;
  @Column({type:'varchar',length:191}) exerciseId:string;
  @ManyToOne(()=>Exercise,{onDelete:'RESTRICT'}) @JoinColumn({name:'exerciseId'}) exercise:Exercise;
  @Column({type:'int',default:0}) position:number;
  @OneToMany(()=>GymSet,s=>s.activityExercise,{cascade:['insert']}) sets:GymSet[];
}
@Entity('gymset')
@Index(['activityExerciseId','position'],{unique:true})
export class GymSet {
  @PrimaryGeneratedColumn('uuid') id:string;
  @Column({type:'varchar',length:191}) activityExerciseId:string;
  @ManyToOne(()=>ActivityExercise,e=>e.sets,{onDelete:'CASCADE'}) @JoinColumn({name:'activityExerciseId'}) activityExercise:ActivityExercise;
  @Column({type:'int'}) position:number;
  @Column({type:'int'}) reps:number;
  @Column({type:'decimal',precision:8,scale:2}) weightKg:string;
  @Column({type:'decimal',precision:3,scale:1,nullable:true}) rpe:string|null;
  @Column({type:'boolean',default:true}) completed:boolean;
}
@Entity('habit')
@Index(['userId','kind'],{unique:true})
export class Habit {
  @PrimaryGeneratedColumn('uuid') id:string;
  @Column({type:'varchar',length:191}) userId:string;
  @ManyToOne(()=>User,{onDelete:'CASCADE'}) @JoinColumn({name:'userId'}) user:User;
  @Column({type:'enum',enum:HABIT_KINDS}) kind:HabitKind;
  @Column({type:'varchar',length:10,nullable:true}) quitDate:string|null;
  @Column({type:'decimal',precision:10,scale:2,nullable:true}) unitsPerDay:string|null;
  @Column({type:'decimal',precision:10,scale:2,nullable:true}) costPerUnit:string|null;
  @Column({type:'decimal',precision:5,scale:2,nullable:true}) frequencyPerWeek:string|null;
  @Column({type:'decimal',precision:10,scale:2,nullable:true}) spendingPerWeek:string|null;
  @Column({type:'varchar',length:191,default:'MAD'}) currency:string;
  @OneToMany(()=>HabitCheckin,c=>c.habit) checkins:HabitCheckin[];
}
@Entity('habitcheckin')
@Index(['habitId','date'],{unique:true})
export class HabitCheckin {
  @PrimaryGeneratedColumn('uuid') id:string;
  @Column({type:'varchar',length:191}) habitId:string;
  @ManyToOne(()=>Habit,h=>h.checkins,{onDelete:'CASCADE'}) @JoinColumn({name:'habitId'}) habit:Habit;
  @Column({type:'varchar',length:10}) date:string;
  @Column({type:'enum',enum:CHECKIN_STATUSES}) status:CheckinStatus;
  @Column({type:'text',nullable:true}) notes:string|null;
}
@Entity('goal')
@Index(['userId','slug'],{unique:true})
export class Goal {
  @PrimaryGeneratedColumn('uuid') id:string;
  @Column({type:'varchar',length:191}) userId:string;
  @ManyToOne(()=>User,{onDelete:'CASCADE'}) @JoinColumn({name:'userId'}) user:User;
  @Column({type:'varchar',length:191}) slug:string;
  @Column({type:'varchar',length:191}) title:string;
  @Column({type:'enum',enum:GOAL_KINDS}) kind:GoalKind;
  @Column({type:'decimal',precision:14,scale:3,nullable:true}) targetValue:string|null;
  @Column({type:'varchar',length:191,nullable:true}) unit:string|null;
  @Column({type:'varchar',length:10,nullable:true}) targetDate:string|null;
  @Column({type:'text',nullable:true}) description:string|null;
  @CreateDateColumn({type:'datetime',precision:3,default:()=> 'CURRENT_TIMESTAMP(3)'}) createdAt:Date;
}
@Entity('sharelink')
@Index(['userId','kind'])
export class ShareLink {
  @PrimaryGeneratedColumn('uuid') id:string;
  @Column({type:'varchar',length:191}) userId:string;
  @ManyToOne(()=>User,{onDelete:'CASCADE'}) @JoinColumn({name:'userId'}) user:User;
  @Column({type:'enum',enum:SHARE_KINDS}) kind:ShareKind;
  @Index({unique:true}) @Column({type:'varchar',length:191}) tokenHash:string;
  @Column({type:'json'}) visibleFields:Record<string,boolean>;
  @Column({type:'boolean',default:true}) enabled:boolean;
  @CreateDateColumn({type:'datetime',precision:3,default:()=> 'CURRENT_TIMESTAMP(3)'}) createdAt:Date;
  @Column({type:'datetime',precision:3,nullable:true}) expiresAt:Date|null;
}
export const ENTITIES = [User,PlannedWorkout,RunningRoutineItem,GymRoutineItem,RunningWeekChange,Activity,Exercise,WorkoutTemplate,TemplateExercise,ActivityExercise,GymSet,Habit,HabitCheckin,Goal,ShareLink];
