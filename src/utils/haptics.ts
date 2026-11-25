/**
 * Safe wrapper around the browser Vibration API (navigator.vibrate)
 * for subtle mobile tactile feedback during Shinobi combat & jutsus.
 */

function triggerPattern(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return;
  }
  try {
    navigator.vibrate(pattern);
  } catch {
    // Ignore on unsupported webviews or restricted contexts
  }
}

export const haptics = {
  melee(step: number): void {
    if (step === 3) {
      // Combo 4 Golden Chakra Chain Whip finisher
      triggerPattern([26, 22, 46]);
    } else if (step === 2) {
      // Combo 3 360° Kamui whirlwind spin
      triggerPattern([22, 18, 28]);
    } else {
      triggerPattern(16);
    }
  },

  fuma(): void {
    triggerPattern([22, 18, 32]);
  },

  kamui(): void {
    // Pulsing spatial warp vibration
    triggerPattern([32, 28, 52, 28, 70]);
  },

  katonLaunch(): void {
    triggerPattern([40, 22, 72]);
  },

  katonImpact(): void {
    triggerPattern([65, 32, 95]);
  },

  shinraTensei(): void {
    // Heavy Rinnegan shockwave double-thump
    triggerPattern([60, 28, 115, 32, 80]);
  },

  playerHit(): void {
    triggerPattern([35, 20, 35]);
  },
};
