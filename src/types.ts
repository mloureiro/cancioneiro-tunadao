export interface ChordPosition {
  chord: string;
  position: number;
}

export interface SongLine {
  type: "lyrics" | "chords-only" | "instruction" | "empty";
  lyrics?: string;
  chords?: ChordPosition[];
  isBold?: boolean;
  instruction?: string;
}

export interface Section {
  type: string;
  label?: string;
  isChorus: boolean;
  lines: SongLine[];
}

export interface SongPart {
  metadata?: {
    parte?: string;
    tom?: string;
  };
  sections: Section[];
}

export interface Song {
  metadata: {
    titulo: string;
    tom: string;
    artista?: string;
    subtitulo?: string;
    /** Número de colunas para esta música (1 ou 2). Default: 2. */
    colunas?: number;
  };
  parts: SongPart[];
}
