import { sniffImage, MAX_BYTES } from './uploads.service';

// The sniffer is the check that decides what gets written to disk and served
// back to every learner. Its job is to ignore what the client CLAIMS a file is.

const png = (extra = 0) =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8 + extra)]);
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const webp = () =>
  Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.alloc(4), Buffer.from('WEBP', 'ascii'), Buffer.alloc(8)]);

describe('sniffImage', () => {
  it('accepts the three raster formats by their magic bytes', () => {
    expect(sniffImage(png())).toEqual({ ext: 'png', mime: 'image/png' });
    expect(sniffImage(jpeg())).toEqual({ ext: 'jpg', mime: 'image/jpeg' });
    expect(sniffImage(webp())).toEqual({ ext: 'webp', mime: 'image/webp' });
  });

  // The one that matters: an SVG served from the app's own origin can carry
  // script, which would be stored XSS against every learner opening the
  // question it is attached to.
  it('rejects SVG even though it is a legitimate image format', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(sniffImage(svg)).toBeNull();
  });

  it('rejects HTML dressed up as an image', () => {
    expect(sniffImage(Buffer.from('<!doctype html><script>alert(1)</script>'))).toBeNull();
  });

  it('rejects an executable', () => {
    // MZ header — a Windows PE.
    expect(sniffImage(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(32)]))).toBeNull();
  });

  it('rejects a file whose extension lies about its contents', () => {
    // "diagram.png" full of zip bytes. Nothing about the NAME reaches this
    // function, which is the point.
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(32)]);
    expect(sniffImage(zip)).toBeNull();
  });

  it('rejects a truncated header rather than guessing', () => {
    expect(sniffImage(Buffer.from([0x89, 0x50]))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });

  it('does not mistake RIFF alone for WEBP', () => {
    // A WAV file is also RIFF.
    const wav = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.alloc(4), Buffer.from('WAVE', 'ascii'), Buffer.alloc(8)]);
    expect(sniffImage(wav)).toBeNull();
  });

  it('keeps a size ceiling well above a real diagram', () => {
    // A road-sign diagram is a few hundred KB; the ceiling exists to stop a
    // mistake or an attack, not to be tight.
    expect(MAX_BYTES).toBeGreaterThan(512 * 1024);
    expect(MAX_BYTES).toBeLessThanOrEqual(8 * 1024 * 1024);
  });
});
