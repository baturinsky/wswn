export = p4wn;
export as namespace p4wn;

declare namespace p4wn {
  type p4state = {
    beginning: string;
    board: Int32Array;
    castles: number;
    draw_timeout: number;
    enpassant: number;
    to_play: number;
    moveno: number;
    history: [number, number, number][];
    historyStrings: string[];
    prepared: boolean;
    over: number;
    move(
      start: number | string,
      end?: number,
      promotion?: number
    ): { flags: number; string: string; ok: boolean };
    findmove(depth: number): [number, number, number];
    jump_to_moveno(n: number);
  };

  type p4changes = any;

  function p4_fen2state(string): p4state;
  function p4_state2fen(state: p4state): string;
  function p4_new_game(): p4state;
  function p4_move(
    state: p4state,
    s: number,
    e: number,
    promotion: number
  ): { flags: number; string: string; ok: boolean };
  function p4_make_move(
    state: p4state,
    s: number,
    e: number,
    promotion: number
  ): p4changes;
  function p4_unmake_move(state: p4state, changes: p4changes);
  function p4_prepare(state: p4state);
  function p4_parse(
    state: p4state,
    colour: number,
    ep,
    score
  ): [number, number, number][];
  function p4_jump_to_moveno(state: p4state, move: number);
  function p4_move2string(
    state: p4state,
    s: number,
    e: number,
    S: number,
    promotion: number,
    flags,
    moves
  );

  const P4_MOVE_FLAG_OK: number;
  const P4_MOVE_FLAG_CHECK: number;
  const P4_MOVE_FLAG_MATE: number;
  const P4_MOVE_FLAG_CAPTURE: number;
  const P4_MOVE_FLAG_CASTLE_KING: number;
  const P4_MOVE_FLAG_CASTLE_QUEEN: number;
  const P4_MOVE_FLAG_DRAW: number;

  const P4_MOVE_ILLEGAL: number;
  const P4_MOVE_MISSED_MATE: number;
  const P4_MOVE_CHECKMATE: number;
  const P4_MOVE_STALEMATE: number;
}
