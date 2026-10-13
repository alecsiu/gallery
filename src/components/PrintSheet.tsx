import { outerH, outerW } from '../geometry';
import { formatLabel } from '../units';
import type { Layout, Unit } from '../types';
import { WallSvg } from './WallSvg';

/** Hidden on screen; shown by the print stylesheet. Includes a hanging list with measurements for every piece. */
export function PrintSheet({ layout, unit }: { layout: Layout; unit: Unit }) {
  const { wall } = layout;
  return (
    <div className="print-sheet">
      <h1>{layout.name}</h1>
      <p>
        Wall {formatLabel(wall.w, unit)} × {formatLabel(wall.h, unit)}
      </p>
      <WallSvg layout={layout} unit={unit} scale={4} showDims />
      <table>
        <thead>
          <tr>
            <th>Piece</th>
            <th>Art</th>
            <th>Outer size</th>
            <th>From left edge</th>
            <th>From top</th>
            <th>Center above floor</th>
          </tr>
        </thead>
        <tbody>
          {layout.pieces.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>
                {formatLabel(p.artW, unit)} × {formatLabel(p.artH, unit)}
              </td>
              <td>
                {formatLabel(outerW(p), unit)} × {formatLabel(outerH(p), unit)}
              </td>
              <td>{formatLabel(p.x, unit)}</td>
              <td>{formatLabel(p.y, unit)}</td>
              <td>{formatLabel(wall.h - (p.y + outerH(p) / 2), unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
