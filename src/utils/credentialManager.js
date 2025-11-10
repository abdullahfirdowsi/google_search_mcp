class CredentialManager {
  constructor(keys = { primary: {}, secondary: {} }) {
    // create internal array of available credentials
    this.keys = [];
    if (keys.primary && keys.primary.key && keys.primary.cx) {
      this.keys.push({ key: keys.primary.key, cx: keys.primary.cx, label: 'Primary' });
    }
    if (keys.secondary && keys.secondary.key && keys.secondary.cx) {
      this.keys.push({ key: keys.secondary.key, cx: keys.secondary.cx, label: 'Secondary' });
    }

    this.index = 0;
    this.exhaustedSet = new Set();
  }

  getCurrent() {
    if (!this.keys.length) return null;
    if (this.exhaustedSet.has(this.index)) {
      // find next non-exhausted
      for (let i = 0; i < this.keys.length; i++) {
        const idx = (this.index + 1 + i) % this.keys.length;
        if (!this.exhaustedSet.has(idx)) {
          this.index = idx;
          break;
        }
      }
      if (this.exhaustedSet.has(this.index)) return null;
    }
    return this.keys[this.index];
  }

  markExhausted(index = this.index) {
    if (typeof index !== 'number') index = this.index;
    this.exhaustedSet.add(index);
    // rotate to next
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (index + 1 + i) % this.keys.length;
      if (!this.exhaustedSet.has(idx)) {
        this.index = idx;
        return;
      }
    }
    // no available
  }

  rotateOnQuota() {
    this.markExhausted(this.index);
  }

  allExhausted() {
    return this.exhaustedSet.size >= this.keys.length;
  }
}

module.exports = {
  CredentialManager
};
