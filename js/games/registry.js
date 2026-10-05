// Adding a game = a new folder + one import line + one entry here.
import { DEBUG } from '../config.js';
import dummy from './dummy/index.js';

export const games = [
  // real games are listed here (one line each)
  ...(DEBUG ? [dummy] : []),
];

export const getGame = (id) => games.find((g) => g.id === id);
