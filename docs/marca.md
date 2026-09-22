# Marca de Nexo

Todo lo que necesitas para usar la marca sin inventar cosas nuevas cada vez.

## La idea

Nexo es un punto de unión: un solo lugar donde se juntan tú, cualquier modelo y tus herramientas. El símbolo es justo eso, una **N hecha de dos nodos unidos por un enlace**. Los dos puntos azules son los nodos; el trazo que los une es el nexo.

## Piezas

Todas viven en `public/brand/` y se generan solas (ver abajo).

| Archivo | Para qué |
| --- | --- |
| `nexo-logo-dark.svg` / `nexo-logo-light.svg` | Logo completo (símbolo + "nexo") sobre fondo oscuro / claro |
| `nexo-mark-dark.svg` / `nexo-mark-light.svg` | Solo el símbolo, para espacios chicos |
| `nexo-code-logo-dark.svg` / `nexo-code-logo-light.svg` | Sub-marca de Nexo Code |
| `nexo-app-icon.svg` | Ícono de app: símbolo blanco sobre cuadro azul |

Además están el favicon (`src/app/icon.svg`), el ícono de iOS (`src/app/apple-icon.png`), los íconos de la PWA (`public/icons/`) y la imagen para compartir enlaces (`src/app/opengraph-image.png`).

Dentro de la app usa los componentes, no los archivos:

```tsx
import { NexoLogo, NexoMark } from "@/components/brand/logo";

<NexoLogo size={24} />            // logo completo
<NexoLogo size={24} product="code" /> // Nexo Code
<NexoMark size={20} />            // solo el símbolo
```

El trazo toma el color del texto donde lo pongas (`currentColor`) y los nodos usan `--brand`, así se ve bien en tema claro y oscuro sin hacer nada.

## Colores

| Nombre | Hex | Uso |
| --- | --- | --- |
| Azul Nexo | `#4f6bff` | Íconos de app, fondos de marca |
| Azul Nexo (oscuro) | `#5b7cff` | Acento y nodos sobre fondo oscuro |
| Azul Nexo (claro) | `#3450e6` | Acento y nodos sobre fondo claro |
| Noche | `#151515` | Fondo principal en oscuro |
| Papel | `#eeedeb` | Texto principal en oscuro |
| Tinta | `#1b1b1a` | Texto principal en claro |
| Chispa | `#e27a5c` | Solo para el indicador de "trabajando" (los tres puntitos) |

El azul es el único color de acento. La chispa no se usa para botones ni enlaces.

## Tipografía

- **Interfaz:** la fuente del sistema (SF Pro en Apple, Segoe en Windows, Roboto en Android).
- **Titulares grandes** (saludo, login): Source Serif 4.
- **Código:** la monoespaciada del sistema.
- **La palabra "nexo" del logo no es una fuente**: está dibujada con el mismo trazo del símbolo. No la reemplaces con texto.

## Lo que no se hace

- No cambies los colores de los nodos por otro que no sea el azul (o blanco en el ícono de app).
- No estires, rotes ni le pongas sombras o degradados al logo.
- No pongas el logo sobre fotos o fondos con mucho ruido; si no hay contraste, usa el ícono de app.
- Deja aire alrededor: como mínimo el alto de un nodo en cada lado.
- Tamaño mínimo del símbolo: 16 px; del logo completo: 18 px de alto.

## Regenerar todo

Si cambias el trazo o los colores en `src/components/brand/brand.json`:

```bash
node scripts/brand.mjs
```

Eso reescribe los SVG de `public/brand/`, el favicon, los PNG de íconos y la imagen para compartir.
