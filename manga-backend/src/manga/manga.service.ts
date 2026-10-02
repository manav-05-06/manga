import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MangaService {
  constructor(private prisma: PrismaService) {}

  async getChapterWithPages(mangaId: string, chapterNum: number) {
    const chapter = await this.prisma.chapter.findFirst({
      where: {
        mangaId: mangaId,
        chapterNum: chapterNum,
      },
      include: {
        pages: {
          orderBy: { pageNum: 'asc' }, 
        },
        scenes: {
          orderBy: { startPage: 'asc' }, // Include scene data for music
        }
      },
    });

    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    return chapter;
  }
}
