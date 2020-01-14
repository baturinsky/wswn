import {
  h,
  render,
  FunctionalComponent,
  Component,
  createContext
} from "preact";
import {
  p4_fen2state,
  p4_jump_to_moveno,
  p4_new_game,
  p4state,
  p4_parse,
  p4_prepare,
  p4_state2fen,
  P4_MOVE_FLAG_MATE,
  P4_MOVE_FLAG_DRAW
} from "./p4wn";

const BLACK_WIN = 1;
const WHITE_WIN = 2;
const DRAW = 3;

const PGAME = 1;
const PMENU = 2;
const PLANDING = 3;
const PSTART = 4;

const SAVE_OR_LOAD = 0;
const REMOVE = 1;

const PREFIX = "wswn_";

function newRng(s: number) {
  return () => {
    const x = Math.sin(s++) * 10000;
    return x - Math.floor(x);
  };
}

function isTouchDevice() {
  return "ontouchstart" in window || navigator.maxTouchPoints;
}

const codes = " prnbkq";
const allCodes = "  PpRrNnBbKkQq";
const pictures = " ♟♜♞♝♚♛";
const cellSize = 80;
const ALLOW_NORMAL_MOVE = false;

type Mode = {
  name: string;
  bag: string;
  board: string;
  random?: boolean;
  description: string;
};

let pieceCost = [0, 0, 1, -1, 5, -5, 3, -3, 3, -3, 0, 0, 9, -9];

const modes: Mode[] = [
  {
    name: "Start With Nothing",
    bag: "KPRPBPNPQPNPBPRP",
    board: "rnbqkbnr/pppppppp/8/8/8/8/8/8 b kq - 0 1",
    description: `"Classic" mode. You place all usual white pieces in order, black starts with all pieces already in place.
    Note that you can "Pass" the piece placement. You can use it to try and win with the least pieces placed possible.
    `
  },
  {
    name: "Human Wave",
    bag: "KPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP",
    board: "rnbqkbnr/pppppppp/8/8/8/8/8/8 b kq - 0 1",
    description: `Plays by the same rules as "Start with Nothing", but you only can place King and (a lot of) Pawns.`
  },
  {
    name: "Randomised",
    bag: "KPRPBPNPQPNPBPRP",
    board: "rnbqkbnr/pppppppp/8/8/8/8/8/8 b kq - 0 1",
    random: true,
    description: `In this mode order of pieces (other than King) is randomised.`
  },
  {
    name: "Double Nothing",
    bag: "KpPrRpPbBpPnNpPqPpPnNpPbBpPrRpP",
    board: "4k3/4p3/8/8/8/8/8/8 b - - 0 1",
    description: `Both sides start with (nearly) nothing, and you place pieces for both of them.`
  }
];

function delay(time: number) {
  return new Promise(res => setTimeout(res, time));
}

function fromP4Position(game: p4state) {
  const upsideDown = [
    ...game.board.filter(
      (v, i) => i > 20 && i < 100 && i % 10 <= 8 && i % 10 > 0
    )
  ].map(v => (v >= 2 ? allCodes[v] : null));
  let res = [];
  while (upsideDown.length > 0) res.push(upsideDown.splice(0, 8));
  return [].concat(...res.reverse());
}

function fromP4Move(move: number[]) {
  return move.map(n => (9 - Math.floor(n / 10)) * 8 + (n % 10) - 1);
}

function toP4Move(move: number[]) {
  return move
    .map(n => (n < 0 ? n : (8 - Math.floor(n / 8)) * 10 + (n % 8) + 11))
    .slice(0, 2) as [number, number];
}

function possibleMoves(game: p4state, from: number) {
  p4_prepare(game);
  let moves = p4_parse(game, game.to_play, game.enpassant, 0).map(
    ([score, s, e]) => fromP4Move([s, e])
  );
  return moves;
}

const MMOVE = 0,
  MDOWN = 1,
  MUP = 2;

class Board extends Component<{
  cols: number;
  rows: number;
  position: string[];
  canDropAt: (number) => boolean;
  animation?: { cell: number; x: number; y: number };
  onMouse: (action: number, ind: number) => void;
  Cell;
}> {
  render({ cols, rows, Cell, position }) {
    let animation = this.props.animation;
    let animatedCell = animation && animation.cell;
    return (
      <div class="board" onMouseLeave={e => this.props.onMouse(MMOVE, -1)}>
        <div
          class="board-grid"
          style={`
          grid-template-columns: repeat(${cols}, ${cellSize}px);
          grid-auto-rows: ${cellSize}px;
          border-radius: ${cellSize * 0.5}px;
          border: none;
          padding: ${cellSize * 0.5}px;        
          `}
        >
          {[...new Array(cols * rows)].map((_, ind) => (
            <Cell
              ind={ind}
              col={ind % cols}
              row={Math.floor(ind / cols)}
              code={position[ind]}
              possibleMove={this.props.canDropAt(ind)}
              onMouse={this.props.onMouse}
              animation={
                animatedCell != ind ? null : [animation.x, animation.y]
              }
            />
          ))}
        </div>
        <div
          class="board-numbers"
          style={`
          top: ${cellSize * 0.9}px;
          font-size: ${cellSize * 0.4}px;
          margin-left: ${cellSize * 0.15}px;
          grid-template-rows: repeat(${rows}, ${cellSize}px);
          `}
        >
          {[...new Array(cols)].map((_, row) => (
            <div>{8 - row}</div>
          ))}
        </div>
        <div
          class="board-letters"
          style={`
          top: ${cellSize * (rows + 0.55)}px;
          font-size: ${cellSize * 0.4}px;
          margin-left: ${cellSize * 0.5}px;
          grid-template-columns: repeat(${rows}, ${cellSize}px);
          `}
        >
          {[...new Array(cols)].map((_, col) => (
            <div>{String.fromCharCode(65 + col)}</div>
          ))}
        </div>
      </div>
    );
  }
}

const Piece: FunctionalComponent<{ code: string; animation?: number[] }> = ({
  code,
  animation
}) => {
  if (!code) return <span />;
  const codei = codes.indexOf(code.toLowerCase());
  const symbol = codei >= 0 ? pictures[codei] : code;
  const white = codei >= 0 && code.toUpperCase() == code;
  return (
    <span
      style={
        animation
          ? `top:${animation[1]}; left:${animation[0]}; z-index:10;`
          : null
      }
      class={"board-cell-content " + (white ? "white" : "black")}
    >
      {symbol}
    </span>
  );
};

type CellProps = {
  ind: number;
  col: number;
  row: number;
  code: string;
  possibleMove: boolean;
  animation: number[];
  onMouse: (action: number, ind: number) => void;
};
class Cell extends Component<CellProps> {
  render(p: CellProps) {
    return (
      <div
        onMouseDown={e => e.button == 0 && p.onMouse(MDOWN, p.ind)}
        onMouseUp={e => e.button == 0 && p.onMouse(MUP, p.ind)}
        onMouseMove={e => p.onMouse(MMOVE, p.ind)}
        class={
          (this.props.col % 2 == p.row % 2 ? "even" : "odd") +
          " board-cell" +
          (p.possibleMove ? " possible-move" : "")
        }
      >
        {p.possibleMove ? (
          <span class="possible-marker"></span>
        ) : (
          p.code && <Piece code={p.code} animation={p.animation} />
        )}
      </div>
    );
  }
}

class Menu extends Component<{
  currentSave: string;
  continue: () => void;
  saves: [string, { board: string; moden: number }][];
  saveAction: (action: number, slotInd: number) => void;
  start: (moden: number) => void;
}> {
  render() {
    return (
      <div class="vertical menu">
        <h1>White Starts With Nothing</h1>
        <div class="horisontal">
          <div class="modes">
            Select game mode
            <div class="modes-grid">
              {modes.map((mode, i) => (
                <button onClick={e => this.props.start(i)}>{mode.name}</button>
              ))}
            </div>
            {this.props.continue && (
              <button class="menu-continue" onClick={this.props.continue}>
                Continue
              </button>
            )}
          </div>
          {this.props.saves.length > 0 && [
            <div class="vertical-line"></div>,
            <div class="saves">
              <div style="grid-column-end: span 2;">or load a save</div>
              {this.props.saves.map((save, i) => [
                <button
                  class={
                    "load-button" +
                    (save[0] == this.props.currentSave ? " last-save" : "")
                  }
                  onClick={e => this.props.saveAction(SAVE_OR_LOAD, i)}
                >
                  {save[1] ? (
                    <small>
                      {(save[1].board || modes[0].board).replace(/\//g, " ") +
                        " " +
                        modes[save[1].moden].name}
                    </small>
                  ) : (
                    "Save"
                  )}
                </button>,
                <button
                  class="x-button"
                  disabled={!save[1]}
                  onClick={e => this.props.saveAction(REMOVE, i)}
                >
                  X
                </button>
              ])}
            </div>
          ]}
        </div>
      </div>
    );
  }
}

type GameState = {
  position: string[];
  dragged: string;
  draggedFrom: number;
  mouseAt: number[];
  history: string[];
  over: number;
  page: number;
  paused: boolean;
  currentSave: string;
  saves: [string, any][];
  autoPlay: boolean;
  moden: number;
  newmoden: number;
  maxSave: number;
  animation: { cell: number; x: number; y: number };
};

class Game extends Component<{}, GameState> {
  state = {
    position: null,
    dragged: null,
    over: 0,
    paused: false,
    autoPlay: false,
    page: PLANDING,
    currentSave: null,
    saves: [],
    history: [],
    draggedFrom: null,
    mouseAt: [0, 0],
    animation: null,
    moden: 0,
    newmoden: 0
  } as GameState;

  animation: { cell: number; x: number; y: number; stage: number } = null;
  game: p4state;
  bag: string;
  seed = 0;
  passes = 0;
  rng: () => number;

  get currentBagPiece() {
    return (
      !this.over && this.bag[Math.floor(this.game.moveno / 3) - this.passes]
    );
  }

  nextBagPiece(): string {
    return this.currentBagPiece;
  }

  constructor() {
    super();
    this.init();
    document.addEventListener("mousedown", e => {
      if (!this.state.mouseAt) this.cancelDragging();
    });
  }

  init(modeName: string | number = "empty") {
    if (modeName != "empty") {
      let moden = 0;
      if (modeName in modes) moden = Number(modeName);
      else moden = modes.findIndex(m => m.name == modeName);
      let mode = modes[moden];
      this.passes = 0;
      this.bag = mode.bag + "";
      if (mode.random) {
        if (!this.seed) this.seed = Math.random();
        this.rng = newRng(this.seed);
        this.bag =
          this.bag.substr(0, 1) +
          this.bag
            .substr(1)
            .split("")
            .sort(() => (this.rng() > 0.5 ? 1 : -1))
            .join("");
      }
      this.game = p4_fen2state(mode.board);
      this.nextBagPiece();
      this.setState({ moden, over: 0, paused: false, autoPlay: false });
      this.syncPosition();
      this.syncSaves();
    } else {
      this.syncSaves();
    }
    //console.log(this.game);
  }

  syncSaves() {
    let saves = [];
    let maxSave = 0;
    let prefixLength = PREFIX.length;

    let saveNames: string[] = [];
    for (let k in localStorage) {
      if (k.substr(0, prefixLength) == PREFIX) {
        if (k == PREFIX + "current") continue;
        saveNames.push(k);
        let n = Number(k.substr(prefixLength)) || 0;
        maxSave = Math.max(n, maxSave);
      }
    }

    let currentSave: string = localStorage[PREFIX + "current"];
    for (let name of saveNames) {
      saves.push([name, JSON.parse(localStorage[name] || null)]);
    }

    if (this.game) saves.push([PREFIX + (maxSave + 1), null]);

    saves.sort((a, b) => (a[0] > b[0] ? 1 : -1));

    this.setState({ currentSave, saves, maxSave });
    return saves;
  }

  get over() {
    return this.game.over;
  }

  canDropAt = n => {
    let placed = this.state.dragged;
    if (!placed) return false;
    if (this.state.position[n]) return false;
    if (placed == "P") return n >= 8 * 4 && n < 8 * 7;
    if (placed == "p") return n >= 8 && n < 8 * 4;
    if (placed.toUpperCase() == placed) return n >= 8 * 4;
    else return n < 8 * 4;
  };

  async aiMove() {
    if (this.over) return;
    let move = this.game.findmove(4);
    this.game.move(move[0], move[1]);
    await this.animateMove(...(fromP4Move(move) as [number, number]));
  }

  cancelDragging = () => {
    if (this.state.draggedFrom) {
      let position = this.state.position.slice();
      position[this.state.draggedFrom] = this.state.dragged;
      this.setState({ position, dragged: null, draggedFrom: null });
    }
  };

  onMouse = async (action: number, ind: number) => {
    let { dragged, draggedFrom, position } = this.state;

    if (action == MMOVE) {
      if (ind < 0) this.setState({ mouseAt: null });
    }

    if (action == MDOWN) {
      if (this.over) return;

      if (!this.canDropAt(ind)) return;

      if (ind == draggedFrom) {
        this.cancelDragging();
        return;
      }

      let v = position[ind];

      let occupied = v != "·" && v;
      if (occupied && !dragged && ALLOW_NORMAL_MOVE) {
        position = position.slice();
        position[ind] = "·";
        console.log(possibleMoves(this.game, ind));
        this.setState({ position, dragged: v, draggedFrom: ind });
      }

      if (dragged) {
        if (draggedFrom) {
          let converted = toP4Move([draggedFrom, ind]);
          let res = this.game.move(...converted);
          if (res.ok) {
            this.syncPosition();
            this.setState({ dragged: null, draggedFrom: null });
            this.aiMove();
          }
        } else {
          let converted = toP4Move([-allCodes.indexOf(dragged), ind]);
          this.fullMove(converted);
        }
      }
    }
  };

  async fullMove(converted: [number, number]) {
    this.game.move(...converted);
    this.syncPosition();
    this.setState({ dragged: null, draggedFrom: null });
    await this.aiMove();
    await this.aiMove();
    this.nextBagPiece();
    this.syncPosition();
    this.save();
    if (!this.currentBagPiece && !this.over) {
      this.setState({ autoPlay: true });
      this.autoPlay();
    }
  }

  canUndo() {
    return this.game.moveno >= 4 && (this.currentBagPiece || this.over);
  }

  async autoPlay() {
    while (!this.over && !this.state.paused) {
      console.log(this.state);
      this.game.move(-1, -1);
      this.passes++;
      await this.aiMove();
      await this.aiMove();
    }
  }

  async animateMove(from: number, to: number) {
    await delay(10);

    return new Promise(resolve => {
      let { position } = this.state;
      if (from >= 0) {
        position[to] = position[from];
        position[from] = null;
      }
      this.animation = {
        cell: to,
        x: cellSize * ((from % 8) - (to % 8)),
        y: cellSize * (Math.floor(from / 8) - Math.floor(to / 8)),
        stage: 1
      };
      this.setState({ position, animation: this.animation });

      let interval = setInterval(async () => {
        this.setState({
          animation: {
            cell: this.animation.cell,
            x: this.animation.x * this.animation.stage,
            y: this.animation.y * this.animation.stage
          }
        });
        this.animation.stage -= 0.04;
        if (this.animation.stage <= 0) {
          clearInterval(interval);
          this.setState({ animation: null });
          this.syncPosition();
          console.log("anim end");
          resolve();
        }
      }, 20);
    });
  }

  mouseMove = (at: number[]) => {
    this.setState({ mouseAt: at });
  };

  syncPosition() {
    this.setState({
      position: fromP4Position(this.game),
      dragged: this.currentBagPiece,
      history: this.game.historyStrings,
      over: this.game.over
    });
  }

  pass = () => {
    this.fullMove([-1, -1]);
    this.passes++;
  };

  undo = async () => {
    if (!this.canUndo()) return;
    p4_jump_to_moveno(this.game, Math.floor(this.game.moveno / 3 - 1) * 3 + 1);
    this.syncPosition();
  };

  jumpTo(move: number) {
    console.log(move);
    p4_jump_to_moveno(this.game, Math.floor(move / 3) * 3 + 1);
    this.syncPosition();
  }

  serialize() {
    return JSON.stringify({
      moden: this.state.moden,
      seed: this.seed,
      history: this.game.history,
      board: p4_state2fen(this.game)
    });
  }

  calculateMaterial() {
    let material = 0;
    for (let move of this.game.history) {
      if (move[0] < 0 && move[1] != -1) {
        material += pieceCost[-move[0]];
      }
    }
    return material;
  }

  deserialize(save: string) {
    let data = JSON.parse(save);
    this.seed = data.seed;
    this.init(data.moden);
    this.game.history = data.history;
    this.game.moveno = data.history.length + 1;
    this.game.jump_to_moveno(this.game.moveno);
    this.syncPosition();
  }

  save = (slot?: string) => {
    if (!slot) slot = this.state.currentSave;
    localStorage.setItem(slot, this.serialize());
    localStorage.setItem(PREFIX + "current", slot);
    console.log(this.game.history);
  };

  load = (slot?: string) => {
    if (!slot) slot = this.state.currentSave;
    let data = localStorage.getItem(slot);
    if (!data) return false;
    this.deserialize(data);
    localStorage.setItem(PREFIX + "current", slot);
    return true;
  };

  toggleMenu = () => {
    this.syncSaves();
    this.setState(state => ({ page: state.page == PMENU ? PGAME : PMENU }));
  };

  goPage = (page: number) => {
    this.setState({ page });
  };

  pause = async () => {
    let wasPaused = this.state.paused;
    this.setState({ paused: !wasPaused });
    await delay(10);
    if (wasPaused) this.autoPlay();
  };

  saveAction = (action: number, slotInd: number) => {
    let save = this.state.saves[slotInd];
    if (action == REMOVE) {
      localStorage.removeItem(save[0]);
      if (this.state.currentSave == save[0]) {
        localStorage.removeItem(PREFIX + "current");
      }
    } else if (action == SAVE_OR_LOAD) {
      if (this.state.saves[slotInd][1]) {
        this.load(save[0]);
        this.goPage(PGAME);
      } else {
        this.save(save[0]);
      }
    }

    this.syncSaves();
  };

  start = async (newmoden: number) => {
    this.setState({ newmoden });
    this.goPage(PSTART);
  };

  reallyStart = async (moden: number) => {
    this.init(String(moden));
    await delay(0);
    this.save(PREFIX + (this.state.maxSave + 1));
    this.syncSaves();
    this.goPage(PGAME);
  };

  continue = () => {
    if (!this.game) if (!this.load(this.state.currentSave)) this.init(0);
    this.goPage(PGAME);
  };

  canPass() {
    return this.state.dragged != "K";
  }

  render(
    props,
    { dragged, mouseAt, page, position, animation, history, paused, autoPlay }
  ) {
    let draggedAt = mouseAt ? mouseAt.map(v => v - cellSize / 2) : [-100, -100];

    switch (page) {
      case PLANDING:
        return (
          <div>
            <h1>White Starts With Nothing</h1>
            <div class="intro">
              This game plays by Chess rules, but instead of moving pieces
              directly, you gradually place white (and in some modes, black)
              pieces and leave making moves to AI.
              <br />
              Goal is, naturally, the winning of the white side. Note that you
              only can place pieces on respective side's half of the board, and
              pawns also can't be placed on the first or last row.
            </div>
            <button onClick={e => this.goPage(PMENU)}>Start</button>
          </div>
        );
      case PSTART:
        return (
          <div>
            <h1>{modes[this.state.newmoden].name}</h1>
            <div class="intro">{modes[this.state.newmoden].description}</div>
            <button onClick={e => this.goPage(PMENU)}>Cancel</button>
            <button onClick={e => this.reallyStart(this.state.newmoden)}>
              Start
            </button>
          </div>
        );
      case PMENU:
        return (
          <Menu
            currentSave={this.state.currentSave}
            saves={this.state.saves}
            continue={(this.game || this.state.currentSave) && this.continue}
            saveAction={this.saveAction}
            start={this.start}
          />
        );
      case PGAME:
        return (
          <div
            class="game"
            onMouseMove={e => {
              if (
                ((e.target as HTMLElement)
                  .parentNode as HTMLElement).classList.contains("board-grid")
              )
                this.mouseMove([e.clientX, e.clientY]);
              else this.mouseMove(null);
            }}
            style={`font-size:${Math.round(cellSize * 0.8)}px; cursor: ${
              dragged && mouseAt ? "none" : "default"
            };`}
          >
            {this.over > 0 && (
              <div class="game-over">
                <h1>{[0, "BLACK WIN", "WHITE WIN", "DRAW"][this.over]}</h1>
                <div>
                  Turns: <big>{Math.ceil(this.game.history.length / 3)}</big>{" "}
                  Placed pieces cost: <big>{this.calculateMaterial()}</big>
                </div>
                <div>
                  Score (200 - Turns - Cost*3):{" "}
                  <big>
                    {200 -
                      Math.ceil(this.game.history.length / 3) -
                      this.calculateMaterial() * 3}
                  </big>
                </div>
              </div>
            )}
            <Board
              cols={8}
              rows={8}
              Cell={Cell}
              position={position}
              canDropAt={this.canDropAt}
              onMouse={this.onMouse}
              animation={animation}
            />
            <div
              class={"dragged" + (isTouchDevice() ? " placed-touch" : "")}
              style={
                isTouchDevice()
                  ? `left:10; top:${cellSize * 4}`
                  : `left:${draggedAt[0]}; top:${draggedAt[1]};`
              }
            >
              <Piece code={dragged} />
            </div>
            <div>
              <button onClick={this.toggleMenu}>Menu</button>
              {/* <button onClick={e => this.save()}>Save</button>
          <button onClick={e => this.load()}>Load</button>*/}

              <button
                style={`visibility:${
                  this.state.autoPlay ? "visible" : "hidden"
                }`}
                onClick={this.pause}
              >
                {paused ? "Continue" : "Pause"}
              </button>
              <button onClick={this.pass} disabled={!this.canPass()}>
                Pass
              </button>
              <button onClick={this.undo} disabled={!this.canUndo()}>
                Undo
              </button>
            </div>
            <div class="history">
              {history.map((_, i) =>
                i % 3 == 0 ? (
                  <span
                    onMouseDown={e => {
                      if (e.button == 0) this.jumpTo(i + 1);
                    }}
                  >
                    {" " + (i / 3 + 1)}.{history.slice(i, i + 3).join(" ")}
                  </span>
                ) : null
              )}
            </div>
          </div>
        );
    }
  }
}

window.onload = function() {
  render(
    <div class="centered">
      <Game />
    </div>,
    document.body
  );
};
