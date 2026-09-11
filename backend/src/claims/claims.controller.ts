import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ClaimsService } from './claims.service';
import { CreateClaimDto } from './dto/create-claim.dto';
import { DecisionDto } from './dto/decision.dto';

@Controller('claims')
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  @Post()
  create(@Body() dto: CreateClaimDto) {
    return this.claims.create(dto);
  }

  @Get()
  findAll() {
    return this.claims.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.claims.findOne(id);
  }

  // 200, not 201: the response is the updated claim, not the new run.
  @Post(':id/assess')
  @HttpCode(HttpStatus.OK)
  assess(@Param('id', ParseUUIDPipe) id: string) {
    return this.claims.assess(id);
  }

  @Post(':id/decision')
  @HttpCode(HttpStatus.OK)
  decide(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) {
    return this.claims.decide(id, dto);
  }
}
