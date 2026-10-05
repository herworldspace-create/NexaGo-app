import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
  ParseFilePipeBuilder,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { MAX_DOCUMENT_SIZE_BYTES } from './storage-provider.interface';

@Controller('drivers/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Roles(Role.DRIVER)
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: MAX_DOCUMENT_SIZE_BYTES })
        .build({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }),
    )
    file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.uploadDriverDocument({
      userId: user.userId,
      type: dto.type,
      buffer: file.buffer,
      mimeType: file.mimetype,
      expiryDate: dto.expiryDate,
    });
  }

  @Roles(Role.DRIVER)
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.listDriverDocuments(user.userId);
  }
}
