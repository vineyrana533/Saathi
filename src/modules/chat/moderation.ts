/**
 * Content scanner for chat, profile text and booking notes (sections 5 and 8 of the brief).
 * Pure function: returns an action and reason codes. Callers store blocked content for
 * moderators and show the sender a polite explanation.
 *
 * Severity:
 *  - block:  contact details, payment handles, links, explicit prohibited services
 *  - review: ambiguous terms that need a human look (held, not delivered)
 */
export type ScanAction = 'allow' | 'review' | 'block';
export type ScanReason =
  | 'phone_number'
  | 'email'
  | 'upi_id'
  | 'link'
  | 'social_handle'
  | 'off_platform_app'
  | 'prohibited_service'
  | 'needs_review';

export interface ScanResult {
  action: ScanAction;
  reasons: ScanReason[];
}

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', oh: '0', shunya: '0', sunya: '0',
  one: '1', ek: '1',
  two: '2', do: '2',
  three: '3', teen: '3', tin: '3',
  four: '4', char: '4', chaar: '4',
  five: '5', paanch: '5', panch: '5',
  six: '6', chhe: '6', che: '6', chheh: '6',
  seven: '7', saat: '7', sat: '7',
  eight: '8', aath: '8', ath: '8',
  nine: '9', nau: '9', no: '9',
};
const MULTIPLIER_WORDS: Record<string, number> = { double: 2, triple: 3, dabal: 2 };

/** Converts spelled-out digits ("nine eight double seven") into digit runs. */
export function wordsToDigits(text: string): string {
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let out = '';
  let pendingMultiplier = 1;
  for (const tok of tokens) {
    if (tok in MULTIPLIER_WORDS) {
      pendingMultiplier = MULTIPLIER_WORDS[tok]!;
      continue;
    }
    const digit = NUMBER_WORDS[tok] ?? (/^\d+$/.test(tok) ? tok : null);
    if (digit !== null) {
      out += digit.repeat(pendingMultiplier);
    } else {
      out += ' ';
    }
    pendingMultiplier = 1;
  }
  return out;
}

function hasPhoneNumber(text: string): boolean {
  // Digits separated by spaces, dots, dashes, brackets or slashes.
  const compact = text.replace(/[\s.\-()/\\_,+]/g, '');
  if (/\d{10,}/.test(compact)) return true;
  if (/(?:^|\D)[6-9]\d{9}(?:\D|$)/.test(text.replace(/[\s.\-()]/g, ''))) return true;
  // Spelled-out or mixed ("nine 8 seven ...").
  const spelled = wordsToDigits(text).replace(/\s+/g, ' ');
  return spelled.split(' ').some((run) => run.length >= 8);
}

const EMAIL = /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|\bat\b)\s*[a-z0-9-]+\s*(?:\.|\(dot\)|\[dot\]|\bdot\b)\s*[a-z]{2,}/i;
const UPI = /\b[a-z0-9._-]{2,}@(?:ok)?(?:axis|sbi|hdfcbank|icici|ybl|ibl|axl|paytm|upi|apl|okaxis|oksbi|okicici|okhdfcbank|fbl|kotak|jupiteraxis|freecharge|airtel|abfspay|pingpay|yapl|rbl|idfcbank|barodampay|aubank|indus|federal|kmbl|timecosmos|waaxis|wahdfcbank|waicici|wasbi)\b/i;
const UPI_GENERIC = /\b[a-z0-9._-]{3,}@[a-z]{3,}\b(?!\s*\.)/i;
const LINK = /(?:https?:\/\/|www\.|\b(?:wa\.me|t\.me|bit\.ly|tinyurl\.com|rzp\.io|paytm\.me|pay\.google\.com)\b|\b[a-z0-9-]{2,}\.(?:com|in|net|org|io|me|co|app|link|xyz)\b)/i;
const SOCIAL_HANDLE = /(?:^|\s)@[a-z0-9_.]{3,}/i;
const OFF_PLATFORM = /\b(?:whats\s*app|whatsapp|watsapp|wapp|telegram|insta(?:gram)?|snap(?:chat)?|facebook|fb\s*id|signal\s*app|imo|gpay|google\s*pay|phone\s*pe|phonepe|paytm|call\s+me\s+direct(?:ly)?|my\s+(?:number|no\.?|mobile|cell)|your\s+(?:number|no\.?|mobile)|pay\s+(?:me\s+)?(?:cash|directly|outside)|book\s+(?:me\s+)?directly|outside\s+(?:the\s+)?app)\b/i;

/** Explicit prohibited services (section 5): always blocked. */
const PROHIBITED = /\b(?:escort|sex(?:ual|y)?|nude|naked|massage|body\s*to\s*body|b2b\s*massage|cuddl(?:e|ing)|girlfriend\s+experience|boyfriend\s+experience|gfe|bfe|hook\s*-?\s*up|intimate|romantic|romance|dating|date\s+night|kiss(?:ing)?|happy\s+ending|erotic|adult\s+service|call\s*girl|call\s*boy|overnight\s+(?:stay|companion|booking)|hotel\s+room)\b/i;
/** Needs a human: therapy claims and private-space meetings. */
const REVIEW = /\b(?:therapy|therapist|counsel(?:l)?ing|counsel(?:l)?or|treatment|healing|private\s+(?:room|place|space)|my\s+place|your\s+place|alone\s+together|stay\s+the\s+night)\b/i;

export function scanText(input: string): ScanResult {
  const text = input.normalize('NFKC');
  const reasons = new Set<ScanReason>();
  if (hasPhoneNumber(text)) reasons.add('phone_number');
  if (EMAIL.test(text)) reasons.add('email');
  if (UPI.test(text) || (UPI_GENERIC.test(text) && !EMAIL.test(text))) reasons.add('upi_id');
  if (LINK.test(text)) reasons.add('link');
  if (SOCIAL_HANDLE.test(text)) reasons.add('social_handle');
  if (OFF_PLATFORM.test(text)) reasons.add('off_platform_app');
  if (PROHIBITED.test(text)) reasons.add('prohibited_service');
  const blocking = reasons.size > 0;
  if (!blocking && REVIEW.test(text)) return { action: 'review', reasons: ['needs_review'] };
  return { action: blocking ? 'block' : 'allow', reasons: [...reasons] };
}

/** Customer- and worker-facing explanation. Plain language, no accusation. */
export function explainBlock(reasons: ScanReason[]): string {
  if (reasons.includes('prohibited_service')) {
    return 'This message was not sent. Saathi does not allow requests for personal, intimate or physical-contact services.';
  }
  if (reasons.some((r) => ['phone_number', 'email', 'upi_id', 'link', 'social_handle', 'off_platform_app'].includes(r))) {
    return 'This message was not sent because it looks like it shares contact or payment details. Please keep calls, chat and payments in Saathi so both of you stay covered.';
  }
  return 'This message is waiting for a quick review by our team before it is delivered.';
}
