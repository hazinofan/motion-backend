import { Table, TableForeignKey, TableIndex, type MigrationInterface, type QueryRunner } from 'typeorm';

export class RunningWeekChanges20261104000000 implements MigrationInterface {
  name = 'RunningWeekChanges20261104000000';
  async up(q: QueryRunner): Promise<void> {
    if (await q.hasTable('runningweekchange')) return;
    await q.createTable(new Table({
      name: 'runningweekchange',
      columns: [
        {name:'id',type:'varchar',length:'36',isPrimary:true},
        {name:'userId',type:'varchar',length:'191'},
        {name:'weekStart',type:'varchar',length:'10'},
        {name:'reason',type:'varchar',length:'30'},
        {name:'details',type:'varchar',length:'500',isNullable:true},
        {name:'changes',type:'json'},
        {name:'createdAt',type:'datetime',precision:3,default:'CURRENT_TIMESTAMP(3)'},
      ],
    }),true);
    await q.createIndex('runningweekchange', new TableIndex({name:'IDX_runningweekchange_user_week',columnNames:['userId','weekStart']}));
    await q.createForeignKey('runningweekchange', new TableForeignKey({columnNames:['userId'],referencedTableName:'user',referencedColumnNames:['id'],onDelete:'CASCADE'}));
  }
  async down(q: QueryRunner): Promise<void> {
    if (await q.hasTable('runningweekchange')) await q.dropTable('runningweekchange',true);
  }
}
