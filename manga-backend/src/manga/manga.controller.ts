import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { MangaService } from './manga.service';

@Controller('manga')
export class MangaController {
  constructor(private readonly mangaService: MangaService) {}

  // Route will be: GET /manga/:mangaId/chapter/:chapterNum
  @Get(':mangaId/chapter/:chapterNum')
  getChapter(
    @Param('mangaId') mangaId: string,
    @Param('chapterNum', ParseIntPipe) chapterNum: number,
  ) {
    return this.mangaService.getChapterWithPages(mangaId, chapterNum);
  }
}

