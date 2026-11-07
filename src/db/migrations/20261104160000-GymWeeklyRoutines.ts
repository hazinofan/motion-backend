import { Table, TableColumn, TableForeignKey, TableIndex, type MigrationInterface, type QueryRunner } from 'typeorm';

export class GymWeeklyRoutines20261104160000 implements MigrationInterface {
  name='GymWeeklyRoutines20261104160000';
  async up(q:QueryRunner):Promise<void> {
    // The original bootstrap migration used PascalCase names, whereas the
    // current entity mappings use lowercase. Support either existing schema.
    const userTable=await q.hasTable('user')?'user':'User';
    const templateTable=await q.hasTable('workouttemplate')?'workouttemplate':'WorkoutTemplate';
    const planTable=await q.hasTable('plannedworkout')?'plannedworkout':'PlannedWorkout';
    if(!await q.hasTable('gymroutineitem')) {
      await q.createTable(new Table({
        name:'gymroutineitem',
        columns:[
          {name:'id',type:'varchar',length:'36',isPrimary:true},
          {name:'userId',type:'varchar',length:'191'},
          {name:'weekday',type:'int'},
          {name:'title',type:'varchar',length:'120'},
          {name:'templateId',type:'varchar',length:'191',isNullable:true},
          {name:'startDate',type:'varchar',length:'10'},
          {name:'active',type:'tinyint',default:1},
          {name:'createdAt',type:'datetime',precision:3,default:'CURRENT_TIMESTAMP(3)'},
        ]
      }),true);
      await q.createIndex('gymroutineitem',new TableIndex({name:'IDX_gymroutineitem_user_active',columnNames:['userId','active']}));
      await q.createForeignKey('gymroutineitem',new TableForeignKey({name:'FK_gymroutineitem_user',columnNames:['userId'],referencedTableName:userTable,referencedColumnNames:['id'],onDelete:'CASCADE'}));
      await q.createForeignKey('gymroutineitem',new TableForeignKey({name:'FK_gymroutineitem_template',columnNames:['templateId'],referencedTableName:templateTable,referencedColumnNames:['id'],onDelete:'SET NULL'}));
    }
    if(!await q.hasColumn(planTable,'gymRoutineItemId')) {
      await q.addColumn(planTable,new TableColumn({name:'gymRoutineItemId',type:'varchar',length:'191',isNullable:true}));
      await q.createForeignKey(planTable,new TableForeignKey({name:'FK_plannedworkout_gymroutine',columnNames:['gymRoutineItemId'],referencedTableName:'gymroutineitem',referencedColumnNames:['id'],onDelete:'SET NULL'}));
    }
    if(!await q.hasColumn(planTable,'gymRoutineWeekStart')){
      await q.addColumn(planTable,new TableColumn({name:'gymRoutineWeekStart',type:'varchar',length:'10',isNullable:true}));
      await q.createIndex(planTable,new TableIndex({name:'UQ_plannedworkout_gymroutine_week',columnNames:['gymRoutineItemId','gymRoutineWeekStart'],isUnique:true}));
    }
  }
  async down(q:QueryRunner):Promise<void> {
    const planTable=await q.hasTable('plannedworkout')?'plannedworkout':'PlannedWorkout';
    if(await q.hasColumn(planTable,'gymRoutineWeekStart')){
      const table=await q.getTable(planTable);
      const index=table?.indices.find(i=>i.name==='UQ_plannedworkout_gymroutine_week');
      if(index)await q.dropIndex(planTable,index);
      await q.dropColumn(planTable,'gymRoutineWeekStart');
    }
    if(await q.hasColumn(planTable,'gymRoutineItemId')){
      const table=await q.getTable(planTable);
      const fk=table?.foreignKeys.find(k=>k.columnNames.includes('gymRoutineItemId'));
      if(fk)await q.dropForeignKey(planTable,fk);
      await q.dropColumn(planTable,'gymRoutineItemId');
    }
    if(await q.hasTable('gymroutineitem'))await q.dropTable('gymroutineitem',true);
  }
}
