export type Unit = 'in' | 'cm';

/** Where the suggested layouts panel sits. */
export type Dock = 'bottom' | 'right';

/** All lengths are stored in inches. Positions are the top-left of the outer frame, measured from the wall's top-left. */
export interface Piece {
  id: string;
  name: string;
  /** Visible art width/height. */
  artW: number;
  artH: number;
  /** Mat border: left/right (matX) and top/bottom (matY). */
  matX: number;
  matY: number;
  /** Frame moulding width (all four sides). */
  frame: number;
  /**
   * How the size is described. Unset: art + mat + frame. 'outer': just the overall width and height
   * (`outerW`/`outerH`); the art/mat/frame numbers are kept so switching back restores them.
   */
  sizing?: 'outer';
  outerW?: number;
  outerH?: number;
  /** Optional thumbnail as a data URL. */
  image?: string;
  /** The image is a straightened photo of the whole piece, frame included, so it is drawn edge to edge. */
  photoFull?: true;
  x: number;
  y: number;
}

export interface Furniture {
  enabled: boolean;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  id: string;
  name: string;
  wall: { w: number; h: number };
  furniture: Furniture;
  /** Preferred spacing between frames; used for gap snapping and auto layouts. */
  gap: number;
  pieces: Piece[];
  updatedAt: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
