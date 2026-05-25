/** MatuDB: filtros ANTES de update/delete. insert/update devuelven Promise, no encadenan .eq() después. */
export function firstRow<T>(data: T | T[] | null | undefined): T {
  if (data == null) throw new Error("No se recibió fila de MatuDB");
  return (Array.isArray(data) ? data[0] : data) as T;
}

export function rows<T>(data: T | T[] | null | undefined): T[] {
  if (data == null) return [];
  return Array.isArray(data) ? data : [data];
}
