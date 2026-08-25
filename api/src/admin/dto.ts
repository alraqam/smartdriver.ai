import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContentStatus } from '@prisma/client';

export class ImportDto {
  /// The file's contents: an array of topic, rule or question rows. The kind is
  /// detected from the shape of the first row, exactly as the CLI does, so a
  /// caller cannot mislabel a file.
  @IsArray()
  @ArrayMinSize(1)
  // A guard against a runaway or hostile payload, well above any real bank.
  @ArrayMaxSize(20000)
  rows!: unknown[];

  /// Shown in the ContentImport audit row so a load can be traced back to a
  /// file. Not a path — the server never reads from disk here.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  filename?: string;

  /// Validate and report, write nothing.
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  /// Waive the guard that refuses an import retiring more than 20% of the live
  /// bank. Only pass this after looking at why the file wants to.
  @IsOptional()
  @IsBoolean()
  allowMassRetire?: boolean;
}

export class UpdateQuestionStatusDto {
  @IsEnum(ContentStatus)
  status!: ContentStatus;
}

export class BulkStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids!: string[];

  @IsEnum(ContentStatus)
  status!: ContentStatus;
}

export class UpdateQuestionDto {
  /// A path under /api/uploads returned by POST /admin/uploads. Explicit null
  /// clears the image; omitting the field leaves it untouched.
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty?: number;
}

export class QuestionQueryDto {
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @IsOptional()
  @IsString()
  topicId?: string;

  /// Substring match against either locale's question text.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  // Query params arrive as strings; the global ValidationPipe transforms but
  // does not guess types, so these need an explicit one or @IsInt rejects
  // every paginated request.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  take?: number;
}
