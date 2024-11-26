// Sound manager class
class SoundManager {
    constructor() {
        this.audioContext = null;
        this.isInitialized = false;
    }

    init() {
        if (!this.isInitialized) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.isInitialized = true;
        }
    }

    generateTone(frequency, duration, volume, type) {
        if (!this.isInitialized) {
            console.log('Sound not initialized yet');
            return;
        }

        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.start();
            setTimeout(() => oscillator.stop(), duration * 1000);
        } catch (error) {
            console.error('Error generating tone:', error);
        }
    }

    move() {
        this.generateTone(440, 0.1, 0.1, 'sine');      // A4 note
    }

    merge() {
        this.generateTone(880, 0.15, 0.1, 'square');  // A5 note
    }

    gameOver() {
        this.generateTone(440, 0.2, 0.1, 'sine');     // Descending tones
        setTimeout(() => this.generateTone(220, 0.3, 0.1, 'sine'), 200);
    }
}

// Create global sound manager instance
window.soundManager = new SoundManager();
