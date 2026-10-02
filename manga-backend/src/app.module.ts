import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { MangaModule } from './manga/manga.module';

@Module({
  imports: [PrismaModule, MangaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
