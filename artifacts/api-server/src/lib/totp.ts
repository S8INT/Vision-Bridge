/**
 * TOTP (Time-based One-Time Password) utilities.
 * Uses otpauth library — RFC 6238 compliant.
 * Required for clinician (Doctor / Admin) MFA.
 */

import * as OTPAuth from "otpauth";

const ISSUER = "VisionBridge UG";
const DIGITS = 6;
const PERIOD = 30;
const ALGORITHM = "SHA1";
const WINDOW = 1;

export interface TotpSetup {
  secret: string;
  otpauthUrl: string;
}

export function generateTotpSecret(email: string): TotpSetup {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret,
  });

  return {
    secret: secret.base32,
    otpauthUrl: totp.toString(),
  };
}

export function verifyTotpCode(secret: string, code: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      algorithm: ALGORITHM,
      digits: DIGITS,
      period: PERIOD,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    const delta = totp.validate({ token: code.replace(/\s/g, ""), window: WINDOW });
    return delta !== null;
  } catch {
    return false;
  }
}
