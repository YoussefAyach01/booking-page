/**
 * Normalise a Moroccan phone number to WhatsApp's international digits (212XXXXXXXXX).
 * Accepts "0612345678", "+212 6 12 34 56 78", "00212612345678". Returns null if it does not look valid.
 */
export function normalizeMoroccanPhone(input: string): string | null {
  let d = input.replace(/[\s.\-()]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith('00212')) d = d.slice(2);
  else if (d.startsWith('0')) d = '212' + d.slice(1);
  return /^212[5-9]\d{8}$/.test(d) ? d : null;
}

export function waUrl(digits: string, message: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
