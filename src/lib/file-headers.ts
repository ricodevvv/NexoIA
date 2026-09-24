const INLINE = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"];

/**
 * Encabezados para servir un archivo del usuario. Solo las imágenes raster y
 * los PDF se muestran en el navegador; todo lo demás (SVG, HTML, zips) se
 * descarga, y va con una CSP que no deja correr nada por si alguien lo abre.
 */
export function fileHeaders(mediaType: string, name: string, cache: string) {
  const inline = INLINE.includes(mediaType);
  const headers: Record<string, string> = {
    "Content-Type": mediaType,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Cache-Control": cache,
    "X-Content-Type-Options": "nosniff",
  };
  if (mediaType !== "application/pdf") headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";
  return headers;
}
