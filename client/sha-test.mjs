import { sha256 } from './src/sha256.js';
import crypto from 'crypto';
const cases = ['', 'abc', '1234', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'abcd1234:567890', 'x'.repeat(1000)];
let bad = 0;
for (const c of cases) {
  const want = crypto.createHash('sha256').update(c).digest('hex');
  if (sha256(c) !== want) { bad++; console.log('MISMATCH', c.length); }
}
console.log(bad ? 'SHA FAIL' : 'sha256 matches node crypto for all cases');
