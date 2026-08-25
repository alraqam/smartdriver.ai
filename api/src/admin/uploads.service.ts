import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { writeFile, stat } from 'fs/promises';
import { join, resolve } from 'path';

/// Where uploads land. A bind mount or volume in Docker — see docker-compose.
export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || './uploads');

/// Served under the API prefix so the Vite dev proxy and the nginx /api rule
/// already cover it, and images stay same-origin with the app.
export const UPLOAD_ROUTE = '/api/uploads';

/// 4 MB. A question diagram is a few hundred KB; anything far past that is a
/// mistake or an attack, not a road sign.
export const MAX_BYTES = 4 * 1024 * 1024;

interface Sniffed {
  ext: string;
  mime: string;
}

/// Identify an image from its CONTENT, not its declared type or filename.
///
/// Both of those come from the client and neither is evidence. This is the
/// check that decides what gets written to disk and served back, so it reads
/// the actual magic bytes.
///
/// SVG is deliberately absent. An SVG can carry script, and one served from
/// the app's own origin is stored XSS against every learner who opens that
/// question. Raster only.
export function sniffImage(buf: Buffer): Sniffed | null {
  if (buf.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', mime: 'image/png' };
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  // WEBP: "RIFF" .... "WEBP"
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger('UploadsService');

  constructor() {
    if (!existsSync(UPLOAD_DIR)) {
      mkdirSync(UPLOAD_DIR, { recursive: true });
      this.logger.log(`Created upload directory ${UPLOAD_DIR}`);
    }
  }

  /// Store an image and return the URL to reference it by.
  ///
  /// The filename is the sha256 of the CONTENT plus the sniffed extension.
  /// That gets three things at once: the client's filename never touches the
  /// filesystem (so there is no path traversal to defend against), re-uploading
  /// the same diagram is free rather than a duplicate, and the name changes
  /// whenever the bytes do, so the file can be cached forever.
  async store(buf: Buffer, declaredName?: string) {
    if (!buf?.length) throw new BadRequestException('Fayl bo\'sh');
    if (buf.length > MAX_BYTES) {
      throw new BadRequestException(`Fayl juda katta (maks ${MAX_BYTES / 1024 / 1024} MB)`);
    }

    const kind = sniffImage(buf);
    if (!kind) {
      throw new BadRequestException(
        'Faqat PNG, JPEG yoki WEBP rasm qabul qilinadi (SVG xavfsizlik sababli qabul qilinmaydi).',
      );
    }

    const hash = createHash('sha256').update(buf).digest('hex');
    const filename = `${hash}.${kind.ext}`;
    const path = join(UPLOAD_DIR, filename);

    let deduped = false;
    try {
      await stat(path);
      deduped = true; // identical bytes already stored
    } catch {
      await writeFile(path, buf);
    }

    this.logger.log(
      `${deduped ? 'Reused' : 'Stored'} ${filename} (${buf.length} bytes)` +
        (declaredName ? ` from "${declaredName}"` : ''),
    );

    return {
      url: `${UPLOAD_ROUTE}/${filename}`,
      filename,
      bytes: buf.length,
      contentType: kind.mime,
      deduped,
    };
  }
}
