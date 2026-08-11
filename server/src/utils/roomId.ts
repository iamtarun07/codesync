import { randomBytes } from 'crypto';

// Crockford-style alphabet: no 0/O/1/I so room codes survive being read aloud.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_ID_LENGTH = 10;

/** Cryptographically secure, unbiased (32-char alphabet divides 256 evenly). */
export function generateRoomId(length: number = ROOM_ID_LENGTH): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export const ROOM_ID_REGEX = new RegExp(`^[${ALPHABET}]{6,16}$`);

/** Opaque per-file identifier. Never exposed as a path, so hex is fine. */
export function generateFileId(): string {
  return randomBytes(9).toString('hex');
}

export const FILE_ID_REGEX = /^[0-9a-f]{18}$/;
