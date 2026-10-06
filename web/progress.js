// Combo, score, level and badge rules. Pure logic: callers pass the clock.
export const COMBO_WINDOW_MS = 4000;
export const xpForLevel = level => 300 + level * 200;

export const BADGES = [
  { id: 'first', label: 'はじめの一手', hint: '1回検出', test: s => s.count >= 1 },
  { id: 'combo3', label: 'トリプル', hint: '3コンボ', test: s => s.best >= 3 },
  { id: 'five', label: 'ウォームアップ完了', hint: '5回検出', test: s => s.count >= 5 },
  { id: 'combo5', label: 'ノンストップ', hint: '5コンボ', test: s => s.best >= 5 },
  { id: 'ten', label: '二桁の祝福', hint: '10回検出', test: s => s.count >= 10 },
  { id: 'combo10', label: '止まらない', hint: '10コンボ', test: s => s.best >= 10 },
  { id: 'all', label: '全部のせ', hint: '全部のせを使う', test: s => s.usedAll },
  { id: 'max', label: '脳が溶けた', hint: 'マキシマムで検出', test: s => s.usedMax },
  { id: 'level3', label: 'レベル3到達', hint: 'LV 3', test: s => s.level >= 3 },
];

export class Progress {
  constructor() { this.reset(); }

  reset() {
    Object.assign(this, { count: 0, best: 0, combo: 0, lastAt: null, score: 0, xp: 0, level: 1, usedAll: false, usedMax: false });
    this.badges = new Set();
  }

  get xpNeeded() { return xpForLevel(this.level); }

  // Register one accepted gesture and report what the UI should celebrate.
  // max: Maximum Dopamine Mode doubles score and XP.
  record(now, { allEffects = false, max = false } = {}) {
    this.combo = this.lastAt !== null && now - this.lastAt <= COMBO_WINDOW_MS ? this.combo + 1 : 1;
    this.lastAt = now;
    this.count++;
    this.best = Math.max(this.best, this.combo);
    if (allEffects) this.usedAll = true;
    if (max) this.usedMax = true;
    const gain = 100 * this.combo * (max ? 2 : 1);
    this.score += gain;
    this.xp += gain;
    const levelsGained = [];
    while (this.xp >= this.xpNeeded) { this.xp -= this.xpNeeded; this.level++; levelsGained.push(this.level); }
    const newBadges = BADGES.filter(badge => !this.badges.has(badge.id) && badge.test(this));
    newBadges.forEach(badge => this.badges.add(badge.id));
    return { combo: this.combo, gain, levelsGained, newBadges };
  }

  // 1 right after a gesture, 0 once the combo window has closed.
  comboRemaining(now) {
    if (this.combo === 0 || this.lastAt === null) return 0;
    return Math.max(0, Math.min(1, 1 - (now - this.lastAt) / COMBO_WINDOW_MS));
  }

  // Drops an expired combo. Returns true when it changed.
  expire(now) {
    if (this.combo > 0 && this.comboRemaining(now) === 0) { this.combo = 0; return true; }
    return false;
  }
}
