import {
  AIAgent,
  type Action,
  type ActionRecord,
  type Card,
  type DecisionInfo,
  type Grade,
  HUNLState,
  type StrategyLookup,
  OpponentModel,
  STAT_KEYS,
  type StatKey,
  CryptoRng,
  DEFAULT_CONFIG,
  describeHand,
  equityVsRandom,
  gradeDecision,
  randomDeal,
  translateAction,
} from '@poker-rl/engine';
import { create } from 'zustand';
import { type Explanation, explain } from './explain';
import { describeAction } from './format';
import { type Models, loadModels } from './models';
import { clearGame, loadGame, restoreModel, saveGame, snapshotModel } from './persist';
import { setSoundEnabled, sfx } from './sound';

export const HUMAN = 0;
export const BOT = 1;

export interface BotDecisionView {
  id: number;
  info: DecisionInfo;
  explanation: Explanation;
  label: string;
  street: number;
}

export interface HandSummary {
  id: number;
  humanHole: [Card, Card];
  botHole: [Card, Card];
  board: Card[];
  humanButton: boolean;
  net: number; // human chips
  showdown: boolean;
  winner: 'human' | 'bot' | 'split';
  humanHand?: string;
  botHand?: string;
  log: ActionRecord[];
  botDecisions: BotDecisionView[];
  grades: Grade[];
  pot: number;
  modelHands: number;
  /** what Otto learned about you from this hand: each habit it updated, how often it applied, and its estimate before and after */
  observed: Observation[];
}

export interface Observation {
  key: StatKey;
  /** times the situation came up this hand, and how many of those you did it */
  opps: number;
  hits: number;
  before: number;
  after: number;
}

export interface Settings {
  lambda: number;
  riskBudget: boolean;
  showBotCards: boolean;
  coach: boolean;
  fourColor: boolean;
  sound: boolean;
  speed: 'slow' | 'normal' | 'fast';
  autoDeal: boolean;
}

export interface ActionBubble {
  seat: number;
  text: string;
  id: number;
  kind: string;
}

type Phase = 'loading' | 'error' | 'idle' | 'dealing' | 'human' | 'bot' | 'over';

interface PlayStore {
  phase: Phase;
  loadProgress: number;
  error?: string;
  models?: Models;
  bot?: AIAgent;
  state: HUNLState | null;
  version: number;
  handNo: number;
  botDecisions: BotDecisionView[];
  humanGrades: Grade[];
  allGrades: Grade[];
  history: HandSummary[];
  bubble: ActionBubble | null;
  humanEquity: number | null;
  hint: StrategyLookup | null;
  settings: Settings;
  /** chips each player has between hands: [you, Otto] */
  stacks: [number, number];
  /** times each player went broke and bought back in: [you, Otto] */
  rebuys: [number, number];
  /** who ran out of chips in the hand just played, until they rebuy */
  busted: 'human' | 'bot' | null;
  init(): Promise<void>;
  /** Refill the busted player's stack and deal the next hand. */
  rebuy(): void;
  newHand(): void;
  humanAct(action: Action): void;
  requestHint(): void;
  setSettings(p: Partial<Settings>): void;
  resetSession(): void;
}

// Deals use a cryptographic RNG; the AI's own sampling uses the same stream.
const rng = new CryptoRng();
let timer: ReturnType<typeof setTimeout> | null = null;
const BUY_IN = DEFAULT_CONFIG.startingStack;
let decisionId = 0;
let bubbleId = 0;
const humanBuckets = new Map<number, number>();

function humanLookup(models: Models, state: HUNLState): StrategyLookup {
  let b = humanBuckets.get(state.street);
  if (b === undefined) {
    b = models.blueprint.bucket(state, HUMAN, rng);
    humanBuckets.set(state.street, b);
  }
  return models.blueprint.lookup(state, b);
}

const SPEED_MS = { slow: [1400, 2200], normal: [650, 1300], fast: [150, 300] } as const;

function loadSettings(): Settings {
  const d: Settings = {
    lambda: 1,
    riskBudget: false,
    showBotCards: false,
    coach: true,
    fourColor: true,
    sound: true,
    speed: 'normal',
    autoDeal: false,
  };
  try {
    const s = localStorage.getItem('pokerrl.settings.v3');
    if (s) return { ...d, ...JSON.parse(s) };
  } catch {
    /* storage unavailable */
  }
  return d;
}

export const usePlay = create<PlayStore>((set, get) => {
  const bump = () => set((s) => ({ version: s.version + 1 }));

  const persist = () => {
    const { bot, stacks, handNo, rebuys, history, allGrades } = get();
    if (!bot) return;
    saveGame({ version: 1, stacks, handNo, rebuys, history, grades: allGrades, model: snapshotModel(bot.model), profitBB: bot.profitBB });
  };

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const sayAction = (st: HUNLState, seat: number) => {
    const rec = st.log[st.log.length - 1];
    if (!rec) return;
    const isBet = rec.kind === 'raise' && st.log.filter((r) => r.street === rec.street && r.kind === 'raise').length === 1 && rec.street > 0;
    set({ bubble: { seat, text: describeAction(rec, isBet), id: ++bubbleId, kind: rec.kind } });
    if (rec.kind === 'fold') sfx.fold();
    else if (rec.kind === 'check') sfx.check();
    else sfx.chips();
  };

  const updateEquity = () => {
    const { state, settings } = get();
    if (!state || !settings.coach) return set({ humanEquity: null });
    const [a, b] = state.holes(HUMAN);
    set({ humanEquity: equityVsRandom(a, b, state.board, 2500, rng) });
  };

  const finishHand = () => {
    const { state, bot, botDecisions, humanGrades, handNo, history, stacks } = get();
    if (!state || !bot) return;
    const before = Object.fromEntries(STAT_KEYS.map((k) => [k, { ...bot.model.counters[k], mean: bot.model.mean(k) }]));
    bot.endHand(state, BOT);
    const observed: Observation[] = STAT_KEYS.filter((k) => bot.model.counters[k].opps > before[k].opps).map((k) => ({
      key: k,
      opps: bot.model.counters[k].opps - before[k].opps,
      hits: bot.model.counters[k].hits - before[k].hits,
      before: before[k].mean,
      after: bot.model.mean(k),
    }));
    const pay = state.payoffs();
    const w = state.winner();
    const showdown = state.isShowdown;
    const [hv, bv] = showdown ? state.showdownValues() : [0, 0];
    const summary: HandSummary = {
      id: handNo,
      humanHole: state.holes(HUMAN),
      botHole: state.holes(BOT),
      board: state.board,
      humanButton: state.button === HUMAN,
      net: pay[HUMAN],
      showdown,
      winner: w === HUMAN ? 'human' : w === BOT ? 'bot' : 'split',
      humanHand: showdown ? describeHand(hv) : undefined,
      botHand: showdown ? describeHand(bv) : undefined,
      log: state.log.slice(),
      botDecisions,
      grades: humanGrades,
      pot: state.pot,
      modelHands: bot.model.hands,
      observed,
    };
    // stacks carry over: whoever reaches zero is out until they rebuy
    const next: [number, number] = [stacks[HUMAN] + pay[HUMAN], stacks[BOT] + pay[BOT]];
    const busted = next[HUMAN] <= 0 ? 'human' : next[BOT] <= 0 ? 'bot' : null;
    set({ phase: 'over', history: [...history, summary], stacks: next, busted });
    persist();
    setTimeout(() => (pay[HUMAN] > 0 ? sfx.win() : pay[HUMAN] < 0 ? sfx.lose() : undefined), showdown ? 700 : 200);
    bump();
    if (get().settings.autoDeal && !busted) {
      clearTimer();
      timer = setTimeout(() => get().newHand(), showdown ? 3600 : 2200);
    }
  };

  const advance = () => {
    const { state, bot, settings } = get();
    if (!state || !bot) return;
    if (state.terminal) return finishHand();
    if (state.toAct === HUMAN) {
      set({ phase: 'human' });
      sfx.turn();
      updateEquity();
      return;
    }
    set({ phase: 'bot' });
    const [lo, hi] = SPEED_MS[settings.speed];
    clearTimer();
    timer = setTimeout(() => {
      const st = get().state;
      if (!st || st !== state || st.terminal) return;
      const d = bot.act(st, rng);
      const info = d.info!;
      const view: BotDecisionView = {
        id: ++decisionId,
        info,
        explanation: explain(info, bot),
        label: '',
        street: st.street,
      };
      st.apply(d.action, d.code);
      const rec = st.log[st.log.length - 1];
      view.label = describeAction(rec, rec.kind === 'raise' && st.raisesThisStreet === 1 && rec.street > 0);
      set((s) => ({ botDecisions: [...s.botDecisions, view] }));
      sayAction(st, BOT);
      bump();
      advance();
    }, lo + Math.random() * (hi - lo));
  };

  return {
    phase: 'loading',
    loadProgress: 0,
    state: null,
    version: 0,
    handNo: 0,
    botDecisions: [],
    humanGrades: [],
    allGrades: [],
    history: [],
    bubble: null,
    humanEquity: null,
    hint: null,
    settings: loadSettings(),
    stacks: [BUY_IN, BUY_IN],
    rebuys: [0, 0],
    busted: null,

    async init() {
      if (get().models) return;
      try {
        const models = await loadModels((f) => set({ loadProgress: f }));
        const { settings } = get();
        setSoundEnabled(settings.sound);
        const bot = new AIAgent(
          models.blueprint,
          models.actor,
          { lambda: settings.lambda, riskBudget: settings.riskBudget, name: 'Poker RL' },
          new OpponentModel(models.exploit.baseline, undefined, models.exploit.baselineBetSize),
        );
        // pick up where the last visit left off
        const saved = loadGame();
        if (saved) {
          restoreModel(bot.model, saved.model);
          bot.profitBB = saved.profitBB;
          const busted = saved.stacks[HUMAN] <= 0 ? 'human' : saved.stacks[BOT] <= 0 ? 'bot' : null;
          set({ stacks: saved.stacks, rebuys: saved.rebuys, handNo: saved.handNo, history: saved.history, allGrades: saved.grades, busted });
        }
        set({ models, bot, phase: 'idle', loadProgress: 1 });
      } catch (e) {
        set({ phase: 'error', error: (e as Error).message });
      }
    },

    newHand() {
      const { bot, handNo, phase, stacks, busted } = get();
      if (!bot || busted || (phase !== 'idle' && phase !== 'over')) return;
      clearTimer();
      humanBuckets.clear();
      const n = handNo + 1;
      // Human holds the button on odd hands; stacks carry over from the last hand.
      const state = new HUNLState(randomDeal(rng), n % 2 === 1 ? HUMAN : BOT, DEFAULT_CONFIG, stacks);
      bot.beginHand();
      set({ state, handNo: n, phase: 'dealing', botDecisions: [], humanGrades: [], bubble: null, humanEquity: null, hint: null });
      sfx.deal();
      setTimeout(() => sfx.deal(), 120);
      bump();
      timer = setTimeout(() => advance(), 450);
    },

    humanAct(action: Action) {
      const { state, phase, models, settings } = get();
      if (!state || phase !== 'human' || state.toAct !== HUMAN || !models) return;
      const code = translateAction(state, action, rng);
      if (settings.coach) {
        const lookup = humanLookup(models, state);
        const grade = gradeDecision(lookup, code, state.street);
        set((s) => ({ humanGrades: [...s.humanGrades, grade], allGrades: [...s.allGrades, grade] }));
      }
      state.apply(action, code);
      sayAction(state, HUMAN);
      set({ humanEquity: null, hint: null });
      bump();
      advance();
    },

    requestHint() {
      const { state, models, phase } = get();
      if (!state || !models || phase !== 'human') return;
      set({ hint: humanLookup(models, state) });
    },

    setSettings(p) {
      const settings = { ...get().settings, ...p };
      try {
        localStorage.setItem('pokerrl.settings.v3', JSON.stringify(settings));
      } catch {
        /* ignore */
      }
      setSoundEnabled(settings.sound);
      const bot = get().bot;
      if (bot) {
        bot.lambda = settings.lambda;
        bot.riskBudget = settings.riskBudget;
      }
      set({ settings });
      if (p.coach !== undefined && get().phase === 'human') updateEquity();
    },

    rebuy() {
      const { busted, stacks, rebuys } = get();
      if (!busted) return;
      const seat = busted === 'human' ? HUMAN : BOT;
      const nextStacks: [number, number] = [...stacks];
      const nextRebuys: [number, number] = [...rebuys];
      nextStacks[seat] = BUY_IN;
      nextRebuys[seat] += 1;
      set({ stacks: nextStacks, rebuys: nextRebuys, busted: null });
      persist();
      get().newHand();
    },

    resetSession() {
      clearTimer();
      const bot = get().bot;
      bot?.resetModel();
      clearGame();
      set({
        state: null,
        handNo: 0,
        history: [],
        allGrades: [],
        humanGrades: [],
        botDecisions: [],
        phase: 'idle',
        bubble: null,
        stacks: [BUY_IN, BUY_IN],
        rebuys: [0, 0],
        busted: null,
      });
      bump();
    },
  };
});

// Expose the store for automated browser tests in development builds.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __play: typeof usePlay }).__play = usePlay;
}

/**
 * The running record across rebuys: net result (current stack minus every
 * buy-in) and matches won and lost (a match ends when someone runs out).
 */
export function recordOf(stacks: [number, number], rebuys: [number, number], busted: 'human' | 'bot' | null) {
  const buyIn = DEFAULT_CONFIG.startingStack;
  return {
    net: stacks[HUMAN] - buyIn * (1 + rebuys[HUMAN]),
    won: rebuys[BOT] + (busted === 'bot' ? 1 : 0),
    lost: rebuys[HUMAN] + (busted === 'human' ? 1 : 0),
    rebuys: rebuys[HUMAN],
  };
}
