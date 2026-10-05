// Adding a game = a new folder + one import line + one entry here.
import { DEBUG } from '../config.js';
import dummy from './dummy/index.js';
import quickmath from './quickmath/index.js';
import ballpark from './ballpark/index.js';
import sure from './sure/index.js';

export const games = [
  // real games are listed here (one line each)
  quickmath,
  ballpark,
  sure,
  ...(DEBUG ? [dummy] : []),
];

export const getGame = (id) => games.find((g) => g.id === id);
