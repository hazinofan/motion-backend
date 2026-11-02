import type { MigrationInterface, QueryRunner } from 'typeorm';

export class StravaImages20261101000000 implements MigrationInterface {
  name = 'StravaImages20261101000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    // Safe for development databases that already used TypeORM synchronize: true.
    const table = (await queryRunner.getTable('activity')) ?? (await queryRunner.getTable('Activity'));
    if (!table) throw new Error('Activity table does not exist');
    if (!table.findColumnByName('stravaImagePath')) {
      await queryRunner.query(`ALTER TABLE \`${table.name}\` ADD COLUMN \`stravaImagePath\` varchar(255) NULL`);
    }
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    const table = (await queryRunner.getTable('activity')) ?? (await queryRunner.getTable('Activity'));
    if (table?.findColumnByName('stravaImagePath')) {
      await queryRunner.query(`ALTER TABLE \`${table.name}\` DROP COLUMN \`stravaImagePath\``);
    }
  }
}
