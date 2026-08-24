import { BadRequestException } from '@nestjs/common';

// Uzbek mobile numbers are 9 digits after the +998 country code. Learners type
// them every way imaginable — "+998 90 123-45-67", "998901234567", "901234567",
// "8 90 123 45 67" — and every variant must resolve to the SAME User row, or a
// learner who typed it differently on their second visit silently gets a new
// empty account. Normalising at the edge is what makes `User.phone` a usable
// unique key.
const UZ_CC = '998';

export function normalizePhone(input: string): string {
  const digits = String(input ?? '').replace(/\D/g, '');

  let local: string;
  if (digits.length === 9) {
    // Bare national number: 901234567
    local = digits;
  } else if (digits.length === 12 && digits.startsWith(UZ_CC)) {
    // Full number with country code: 998901234567
    local = digits.slice(3);
  } else if (digits.length === 13 && digits.startsWith('8' + UZ_CC)) {
    // Trunk prefix in front of the country code: 8998901234567
    local = digits.slice(4);
  } else if (digits.length === 10 && digits.startsWith('8')) {
    // Soviet-era trunk prefix still in muscle memory: 8901234567
    local = digits.slice(1);
  } else {
    throw new BadRequestException(
      "Telefon raqami noto'g'ri. Namuna: +998 90 123 45 67",
    );
  }

  // Uzbek mobile operator codes are 2 digits and never start with 0 or 1.
  if (!/^[2-9]\d{8}$/.test(local)) {
    throw new BadRequestException(
      "Telefon raqami noto'g'ri. Namuna: +998 90 123 45 67",
    );
  }

  return `+${UZ_CC}${local}`;
}

// Display form for logs and SMS text: +998 90 123 45 67
export function formatPhone(e164: string): string {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}

// Masked form for anything a third party might read (Sentry, audit exports).
export function maskPhone(e164: string): string {
  return e164.length > 6 ? `${e164.slice(0, 7)}****${e164.slice(-2)}` : e164;
}
