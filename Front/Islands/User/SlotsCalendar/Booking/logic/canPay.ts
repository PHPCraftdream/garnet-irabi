/** Хватает ли денег; бесплатная бронь проходит всегда. */
export function canPay(balance: number, total: number): boolean {
  return total === 0 || balance >= total;
}
