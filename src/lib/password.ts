/** bcrypt only considers the first 72 UTF-8 bytes. Reject truncating passwords. */
export function validPassword(password: string): boolean {
  return password.length >= 12 && Buffer.byteLength(password, "utf8") <= 72;
}
