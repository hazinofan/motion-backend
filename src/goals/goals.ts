import { BadRequestException,Body,Controller,Delete,Get,NotFoundException,Param,Patch,Post,Req } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Goal, type GoalKind } from '../db/entities.js';
import type { AuthedRequest } from '../auth/auth.js';
import { dateOnly, day, validate } from '../core/validate.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
const schema=z.object({title:z.string().trim().min(1).max(140),kind:z.enum(['RUN_DISTANCE','RUN_TIME','STRENGTH','CONSISTENCY','HABIT','CUSTOM','MARATHON']),targetValue:z.coerce.number().min(0).max(1e11).nullable().optional(),unit:z.string().max(30).nullable().optional(),targetDate:z.string().regex(day).nullable().optional(),description:z.string().max(3000).nullable().optional()});
@Controller('goals')
export class GoalsController {
 constructor(private readonly db:DataSource) {}
 @Get() all(@Req() req:AuthedRequest){return this.db.getRepository(Goal).find({where:{userId:req.authId},order:{createdAt:'DESC'}});}
 @Post() add(@Req() req:AuthedRequest,@Body() raw:unknown){const v=validate(schema,raw);if(v.targetDate)dateOnly(v.targetDate);const repo=this.db.getRepository(Goal);return repo.save(repo.create({userId:req.authId,slug:`custom-${randomUUID()}`,title:v.title,kind:v.kind as GoalKind,targetValue:v.targetValue==null?null:String(v.targetValue),unit:v.unit,targetDate:v.targetDate,description:v.description}));}
 @Patch(':id') async edit(@Req() req:AuthedRequest,@Param('id') id:string,@Body() raw:unknown){const repo=this.db.getRepository(Goal);const g=await repo.findOneBy({id,userId:req.authId});if(!g)throw new NotFoundException('Goal not found');const v=validate(schema.partial(),raw);if(v.targetDate)dateOnly(v.targetDate);const {targetValue,...data}=v;repo.merge(g,data);if(targetValue!==undefined)g.targetValue=targetValue===null?null:String(targetValue);return repo.save(g);}
 @Delete(':id') async remove(@Req() req:AuthedRequest,@Param('id') id:string){const repo=this.db.getRepository(Goal);const g=await repo.findOneBy({id,userId:req.authId});if(!g)throw new NotFoundException('Goal not found');if(g.kind==='MARATHON')throw new BadRequestException('The marathon goal cannot be deleted');await repo.remove(g);return {ok:true};}
}
