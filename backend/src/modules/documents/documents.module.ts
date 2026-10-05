import { Module } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { STORAGE_PROVIDER } from './storage-provider.interface';
import { LocalStorageProvider } from './providers/local-storage.provider';

@Module({
  imports: [ConfigModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    LocalStorageProvider,
    {
      // Only LocalStorageProvider is implemented in Phase 1. Swap in an
      // S3-compatible provider behind the same interface before production.
      provide: STORAGE_PROVIDER,
      useExisting: LocalStorageProvider,
    },
  ],
  exports: [DocumentsService, STORAGE_PROVIDER],
})
export class DocumentsModule {}
