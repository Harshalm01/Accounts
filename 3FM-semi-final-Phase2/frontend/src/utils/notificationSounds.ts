// Notification Sounds Manager
// Uses Web Audio API for better control

interface SoundOptions {
  volume?: number; // 0 to 1
  useFallback?: boolean; // Use beep sound if audio file fails
}

class NotificationSoundManager {
  private audioContext: AudioContext | null = null;
  private soundEnabled: boolean = JSON.parse(localStorage.getItem('soundEnabled') ?? 'true');

  constructor() {
    // Get sound preference from localStorage
    this.soundEnabled = JSON.parse(localStorage.getItem('soundEnabled') ?? 'true');
  }

  // Initialize Web Audio API
  private initAudioContext() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        // Resume AudioContext if suspended (required by browser autoplay policy)
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }
      } catch (error) {
        console.warn('Failed to initialize AudioContext:', error);
      }
    }
    // Ensure AudioContext is running
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  // Play a system beep sound using Web Audio API
  private playBeep(frequency: number = 800, duration: number = 200, volume: number = 0.5) {
    if (!this.soundEnabled) return;

    try {
      this.initAudioContext();
      if (!this.audioContext) return;

      const ctx = this.audioContext;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';

      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration / 1000);
    } catch (error) {
      console.warn('Failed to play beep sound:', error);
    }
  }

  // Play notification sound
  public playNotificationSound(options: SoundOptions = {}) {
    if (!this.soundEnabled) return;

    const { volume = 0.5, useFallback = true } = options;

    // Get sound type from localStorage (default: 'bell')
    const soundType = localStorage.getItem('notificationSoundType') ?? 'bell';
    const soundMap: Record<string, string> = {
      'bell': '/sounds/notification-bell.mp3',
      'chime': '/sounds/success-chime.mp3',
      'buzz': '/sounds/error-buzz.mp3',
    };

    const soundFile = soundMap[soundType] || '/sounds/notification-bell.mp3';

    // Try to play audio file
    try {
      const audio = new Audio(soundFile);
      audio.volume = Math.min(Math.max(volume, 0), 1); // Clamp between 0 and 1
      audio.play().catch(() => {
        if (useFallback) {
          this.playBeep(800, 200, volume);
        }
      });
    } catch (error) {
      if (useFallback) {
        this.playBeep(800, 200, volume);
      }
    }
  }

  // Play success sound
  public playSuccessSound(options: SoundOptions = {}) {
    if (!this.soundEnabled) return;

    const { volume = 0.5, useFallback = true } = options;

    try {
      const audio = new Audio('/sounds/success-chime.mp3');
      audio.volume = Math.min(Math.max(volume, 0), 1);
      audio.play().catch(() => {
        if (useFallback) {
          // Success sound: higher frequency beep
          this.playBeep(1000, 150, volume);
        }
      });
    } catch (error) {
      if (useFallback) {
        this.playBeep(1000, 150, volume);
      }
    }
  }

  // Play error sound
  public playErrorSound(options: SoundOptions = {}) {
    if (!this.soundEnabled) return;

    const { volume = 0.5, useFallback = true } = options;

    try {
      const audio = new Audio('/sounds/error-buzz.mp3');
      audio.volume = Math.min(Math.max(volume, 0), 1);
      audio.play().catch(() => {
        if (useFallback) {
          // Error sound: lower frequency
          this.playBeep(400, 300, volume);
        }
      });
    } catch (error) {
      if (useFallback) {
        this.playBeep(400, 300, volume);
      }
    }
  }

  // Toggle sound on/off
  public setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
    localStorage.setItem('soundEnabled', JSON.stringify(enabled));
  }

  // Check if sound is enabled
  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }
}

// Export singleton instance
export const soundManager = new NotificationSoundManager();

// Export type for React hooks
export type { SoundOptions };
