import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RunningRoutines20261029000000 implements MigrationInterface {
  name='RunningRoutines20261029000000';

  async up(queryRunner:QueryRunner):Promise<void> {
    if(!await queryRunner.hasTable('RunningRoutineItem')) {
      await queryRunner.query("CREATE TABLE `RunningRoutineItem` (`id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL, `weekday` INTEGER NOT NULL, `title` VARCHAR(191) NOT NULL, `distanceLabel` VARCHAR(30) NOT NULL, `paceLabel` VARCHAR(20) NOT NULL, `startDate` VARCHAR(10) NOT NULL, `active` BOOLEAN NOT NULL DEFAULT TRUE, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX `RunningRoutineItem_userId_active_idx` (`userId`, `active`), PRIMARY KEY (`id`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
      await queryRunner.query('ALTER TABLE `RunningRoutineItem` ADD CONSTRAINT `RunningRoutineItem_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE');
    }
    if(!await queryRunner.hasColumn('PlannedWorkout','routineItemId')) {
      await queryRunner.query('ALTER TABLE `PlannedWorkout` ADD `routineItemId` VARCHAR(191) NULL');
      await queryRunner.query('CREATE UNIQUE INDEX `PlannedWorkout_routineItemId_date_key` ON `PlannedWorkout` (`routineItemId`, `date`)');
      await queryRunner.query('ALTER TABLE `PlannedWorkout` ADD CONSTRAINT `PlannedWorkout_routineItemId_fkey` FOREIGN KEY (`routineItemId`) REFERENCES `RunningRoutineItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE');
    }
  }

  async down(queryRunner:QueryRunner):Promise<void> {
    await queryRunner.query('ALTER TABLE `PlannedWorkout` DROP FOREIGN KEY `PlannedWorkout_routineItemId_fkey`');
    await queryRunner.query('DROP INDEX `PlannedWorkout_routineItemId_date_key` ON `PlannedWorkout`');
    await queryRunner.query('ALTER TABLE `PlannedWorkout` DROP COLUMN `routineItemId`');
    await queryRunner.query('DROP TABLE `RunningRoutineItem`');
  }
}
